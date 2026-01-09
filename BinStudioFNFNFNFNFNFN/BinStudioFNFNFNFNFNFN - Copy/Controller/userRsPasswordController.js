const User = require('../Models/user');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

// --- CẤU HÌNH GỬI EMAIL ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
});

// --- 1. XỬ LÝ GỬI MÃ OTP (Dùng cho cả Đăng ký & Quên mật khẩu) ---
exports.getOTP = async (req, res) => {
    try {
        const { email, type } = req.body;
        const user = await User.findOne({ email });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + 300000; // 5 phút

        if (type === 'register') {
            if (user) return res.json({ success: false, message: "Email này đã được sử dụng!" });

            // Lưu vào Session cho đăng ký
            req.session.registerOTP = { email, code: otp, expires: otpExpires };
        } else {
            if (!user) return res.json({ success: false, message: "Email không tồn tại!" });

            // Lưu vào Database cho quên mật khẩu
            user.resetOTP = otp;
            user.resetOTPExpires = otpExpires;
            await user.save();
        }

        const mailOptions = {
            from: 'BinStudio Support',
            to: email,
            subject: 'Mã xác thực OTP - BinStudio',
            html: `
                <h3>Mã xác thực của bạn</h3>
                <p>Mã OTP là: <b style="font-size: 20px; color: #d1b06b;">${otp}</b></p>
                <p>Mã này có hiệu lực trong 5 phút. Vui lòng không chia sẻ cho ai.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Mã OTP đã được gửi về email của bạn!" });
    } catch (err) {
        console.error("Lỗi getOTP:", err);
        res.status(500).json({ success: false, message: "Lỗi gửi email." });
    }
};

// --- 2. XỬ LÝ ĐỔI MẬT KHẨU ---
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newpassword, confirmnewpassword } = req.body;

        const user = await User.findOne({
            email: email,
            resetOTP: otp,
            resetOTPExpires: { $gt: Date.now() }
        });

        if (!user) return res.send("Email sai hoặc mã OTP không đúng/đã hết hạn!");

        if (user.isLocked) {
            req.session.destroy();
            return res.render('user/login', { error: "Tài khoản đã bị khóa!" });
        }

        if (newpassword.trim() !== confirmnewpassword.trim()) {
            return res.send("Mật khẩu xác nhận không khớp!");
        }

        // Hash mật khẩu mới và dọn dẹp OTP
        user.password = await bcrypt.hash(newpassword, 10);
        user.resetOTP = undefined;
        user.resetOTPExpires = undefined;
        await user.save();

        req.session.destroy(); // Đăng xuất sau khi đổi mật khẩu để yêu cầu login lại
        res.send("Đổi mật khẩu thành công! Vui lòng đăng nhập lại.");
    } catch (err) {
        console.error("Lỗi resetPassword:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};