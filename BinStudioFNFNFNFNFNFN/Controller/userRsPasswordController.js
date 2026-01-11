const User = require('../Models/user');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const OTP = require('../Models/otp');
const crypto = require('crypto');


const renderChangePassword = (req, res, data) => {
    return res.render('user/Doimatkhau', {
        user: req.session.user || null,
        cartCount: req.session.cartCount || 0, // Lấy tạm từ session để không bị lỗi view
        error: null,
        success: null,
        ...data // Dữ liệu error/success truyền vào sẽ ghi đè lên null
    });
};


const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Bắt buộc là false với port 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3' // Giúp tương thích bảo mật
    },
    // 🔥 DÒNG NÀY QUAN TRỌNG ĐỂ SỬA LỖI TIMEOUT TRÊN RENDER:
    family: 4 // Ép buộc sử dụng IPv4 thay vì IPv6
});
// --- 1. GỬI OTP (REGISTER / FORGOT) ---
exports.getOTP = async (req, res) => {
    try {
        const { email, type } = req.body;
        const ip = req.ip;

        if (!email || !type) {
            return res.json({ success: false, message: "Thiếu dữ liệu" });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({ 
                success: false, 
                message: "Định dạng Email không hợp lệ (ví dụ: abc@gmail.com)" 
            });
        }

        if (!['register', 'forgot'].includes(type)) {
            return res.json({ success: false, message: "Loại OTP không hợp lệ" });
        }

        const purpose = type === 'register' ? 'REGISTER' : 'RESET_PASSWORD';

        // ===== RATE LIMIT EMAIL (OTP còn hạn) =====
        const emailCount = await OTP.countDocuments({
            email,
            purpose,
            expiresAt: { $gt: Date.now() }
        });

        if (emailCount >= 3) {
            return res.status(429).json({
                success: false,
                message: "Bạn đã yêu cầu OTP quá nhiều lần. Vui lòng thử lại sau."
            });
        }

        // ===== RATE LIMIT IP =====
        const ipCount = await OTP.countDocuments({
            ip,
            expiresAt: { $gt: Date.now() }
        });

        if (ipCount >= 5) {
            return res.status(429).json({
                success: false,
                message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau."
            });
        }

        // ===== CHECK USER =====
        const user = await User.findOne({ email });

        if (purpose === 'REGISTER' && user) {
            return res.json({ success: false, message: "Email đã tồn tại" });
        }

        if (purpose === 'RESET_PASSWORD' && !user) {
            return res.json({ success: false, message: "Email không tồn tại" });
        }

        // ===== XÓA OTP CŨ =====
        await OTP.deleteMany({ email, purpose, isUsed: false });

        // ===== TẠO OTP =====
        const otp = crypto.randomInt(100000, 999999).toString();
        const hashedOTP = await bcrypt.hash(otp, 10);

        await OTP.create({
            email,
            code: hashedOTP,
            purpose,
            expiresAt: Date.now() + 5 * 60 * 1000,
            ip
        });

        // ===== SEND EMAIL =====
        await transporter.sendMail({
            to: email,
            subject: 'Mã OTP xác thực - BinStudio',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
                    <h2 style="color: #d1b06b;">BinStudio Verification</h2>
                    <p>Mã OTP của bạn là:</p>
                    <h1 style="color: #333; letter-spacing: 5px;">${otp}</h1>
                    <p>Mã này có hiệu lực trong vòng <strong>5 phút</strong>.</p>
                    <p>Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
                </div>
            `
        });
        res.json({ success: true, message: "OTP đã được gửi" });

    } catch (err) {
        console.error("getOTP error:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// --- 2. RESET PASSWORD ---
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newpassword, confirmnewpassword } = req.body;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render('user/Doimatkhau', {
                error: "Định dạng Email không hợp lệ!"
            });
        }
        // 1. Check thiếu dữ liệu
        if (!email || !otp || !newpassword || !confirmnewpassword) {
            return renderChangePassword(req, res, {
                error: "Vui lòng nhập đầy đủ thông tin"
            });
        }

        // --- XÓA DÒNG if(newpassword === req.password) CŨ CỦA BẠN ĐI VÌ NÓ SAI LOGIC ---

        // 2. Check độ dài mật khẩu

        // 4. Tìm OTP hợp lệ
        const otpRecord = await OTP.findOne({
            email,
            purpose: 'RESET_PASSWORD',
            isUsed: false,
            expiresAt: { $gt: Date.now() }
        });

        if (!otpRecord) {
            return renderChangePassword(req, res, {
                error: "OTP không hợp lệ hoặc đã hết hạn"
            });
        }

        // 5. Check số lần nhập sai
        if (otpRecord.attempts >= 5) {
            return renderChangePassword(req, res, {
                error: "Bạn đã nhập sai OTP quá nhiều lần"
            });
        }

        // 6. So OTP
        // 6. So OTP
        const isValidOTP = await bcrypt.compare(otp, otpRecord.code);
        if (!isValidOTP) {
            // 🔥 DÙNG CÁCH NÀY ĐỂ CHẶN RACE CONDITION 🔥
            // Tăng attempts lên 1 ngay lập tức trong Database
            await OTP.updateOne(
                { _id: otpRecord._id },
                { $inc: { attempts: 1 } }
            );

            return renderChangePassword(req, res, { error: "OTP không chính xác" });
        }

        // 7. Tìm user
        const user = await User.findOne({ email });
        if (!user) {
            return renderChangePassword(req, res, {
                error: "Tài khoản không tồn tại"
            });
        }
        if (newpassword.length < 8) {
            return renderChangePassword(req, res, {
                error: "Mật khẩu phải có ít nhất 8 ký tự"
            });
        }

        // 3. Check confirm password
        if (newpassword !== confirmnewpassword) {
            return renderChangePassword(req, res, {
                error: "Mật khẩu xác nhận không khớp"
            });
        }
        // 🔥 7.5. CHECK MẬT KHẨU MỚI TRÙNG CŨ (Code thêm mới) 🔥
        // So sánh newpassword (chưa hash) với user.password (đã hash trong DB)
        const isSamePassword = await bcrypt.compare(newpassword, user.password);
        if (isSamePassword) {
            return renderChangePassword(req, res, {
                error: "Mật khẩu mới không được trùng với mật khẩu cũ!"
            });
        }

        // 8. Update password
        user.password = await bcrypt.hash(newpassword, 10);
        await user.save();


        otpRecord.isUsed = true;
        await otpRecord.save();
        return req.session.save((err) => {
            if (err) {
                console.error("Lỗi lưu session sau khi reset pass:", err);
            }
            return res.render('user/login', {
                success: "Đổi mật khẩu thành công! Vui lòng đăng nhập lại"
            });
        });
        // 9. Thành công
        return res.render('user/login', {
            success: "Đổi mật khẩu thành công! Vui lòng đăng nhập lại"
        });

    } catch (err) {
        console.error(err);
        return renderChangePassword(req, res, {
            error: "Lỗi hệ thống, vui lòng thử lại"
        });
    }
};