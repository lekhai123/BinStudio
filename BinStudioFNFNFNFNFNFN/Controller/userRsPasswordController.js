const User = require('../Models/user');
const bcrypt = require('bcrypt');
// const nodemailer = require('nodemailer'); // Bỏ dòng này
const { Resend } = require('resend'); // Thêm dòng này
const OTP = require('../Models/otp');
const crypto = require('crypto');

// --- CẤU HÌNH RESEND ---
const resend = new Resend(process.env.RESEND_API_KEY);

// --- HELPER: RENDER VIEW ---
const renderChangePassword = (req, res, data) => {
    return res.render('user/Doimatkhau', {
        user: req.session.user || null,
        cartCount: req.session.cartCount || 0,
        error: null,
        success: null,
        ...data
    });
};

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

        // ===== RATE LIMIT EMAIL =====
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

        // ===== DELETE OLD OTP =====
        await OTP.deleteMany({ email, purpose, isUsed: false });

        // ===== GENERATE OTP =====
        const otp = crypto.randomInt(100000, 999999).toString();
        const hashedOTP = await bcrypt.hash(otp, 10);

        await OTP.create({
            email,
            code: hashedOTP,
            purpose,
            expiresAt: Date.now() + 5 * 60 * 1000,
            ip
        });

        // ===== SEND EMAIL VỚI RESEND =====
        // Lưu ý: Nếu chưa verify domain, chỉ gửi được về chính email đăng ký Resend
        const { data, error } = await resend.emails.send({
            from: 'BinStudio <security@binstudio.id.vn>', // Mail mặc định dùng để test
            to: [email],
            subject: 'Mã OTP xác thực - BinStudio',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #d1b06b; text-align: center;">BinStudio Verification</h2>
                    <p style="text-align: center;">Mã xác thực của bạn là:</p>
                    <h1 style="color: #333; letter-spacing: 5px; text-align: center; background: #f4f4f4; padding: 10px; border-radius: 5px;">${otp}</h1>
                    <p style="text-align: center;">Mã này có hiệu lực trong vòng <strong>5 phút</strong>.</p>
                </div>
            `
        });

        if (error) {
            console.error("Resend Error:", error);
            return res.status(500).json({ success: false, message: "Lỗi gửi mail từ nhà cung cấp" });
        }

        res.json({ success: true, message: "OTP đã được gửi thành công" });

    } catch (err) {
        console.error("getOTP System Error:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// --- 2. RESET PASSWORD (Giữ nguyên logic cũ) ---
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newpassword, confirmnewpassword } = req.body;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return renderChangePassword(req, res, { error: "Định dạng Email không hợp lệ!" });
        }

        if (!email || !otp || !newpassword || !confirmnewpassword) {
            return renderChangePassword(req, res, { error: "Vui lòng nhập đầy đủ thông tin" });
        }

        const otpRecord = await OTP.findOne({
            email,
            purpose: 'RESET_PASSWORD',
            isUsed: false,
            expiresAt: { $gt: Date.now() }
        });

        if (!otpRecord) {
            return renderChangePassword(req, res, { error: "OTP không hợp lệ hoặc đã hết hạn" });
        }

        if (otpRecord.attempts >= 5) {
            return renderChangePassword(req, res, { error: "Bạn đã nhập sai OTP quá nhiều lần." });
        }

        const isValidOTP = await bcrypt.compare(otp, otpRecord.code);
        if (!isValidOTP) {
            await OTP.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
            return renderChangePassword(req, res, { error: "OTP không chính xác" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return renderChangePassword(req, res, { error: "Tài khoản không tồn tại" });
        }

        const isSamePassword = await bcrypt.compare(newpassword, user.password);
        if (isSamePassword) {
            return renderChangePassword(req, res, { error: "Mật khẩu mới không được trùng với mật khẩu cũ!" });
        }

        user.password = await bcrypt.hash(newpassword, 10);
        await user.save();

        otpRecord.isUsed = true;
        await otpRecord.save();

        return req.session.save(() => {
            res.render('user/login', {
                success: "Đổi mật khẩu thành công! Vui lòng đăng nhập lại."
            });
        });

    } catch (err) {
        console.error("Reset Password Error:", err);
        return renderChangePassword(req, res, { error: "Lỗi hệ thống, vui lòng thử lại sau" });
    }
};