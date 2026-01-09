const User = require('../Models/user');
const bcrypt = require('bcrypt');

// --- 1. XỬ LÝ ĐĂNG KÝ ---
exports.register = async (req, res) => {
    try {
        const { email, password, confirmpassword, otp } = req.body;

        // Kiểm tra mật khẩu khớp
        if (password !== confirmpassword) {
            return res.send("Lỗi: Mật khẩu xác nhận không khớp! Vui lòng thử lại.");
        }

        // Kiểm tra OTP từ Session
        const sessionOTP = req.session.registerOTP;
        if (!sessionOTP) return res.send("Lỗi: Bạn chưa lấy mã xác thực OTP!");
        if (sessionOTP.email !== email) return res.send("Lỗi: Email xác thực không khớp!");
        if (sessionOTP.code !== otp) return res.send("Lỗi: Mã OTP không chính xác!");
        if (Date.now() > sessionOTP.expires) return res.send("Lỗi: Mã OTP đã hết hạn!");

        // Kiểm tra tồn tại
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.send("Tài khoản đã tồn tại!");

        // Hash mật khẩu và Lưu
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            email,
            password: hashedPassword,
            role: 'user'
        });

        await newUser.save();
        delete req.session.registerOTP; // Dọn dẹp OTP

        return res.render('user/login', {
            success: "Chúc mừng! Bạn đã đăng ký tài khoản thành công. Hãy đăng nhập ngay!"
        });
    } catch (err) {
        console.error("Lỗi register:", err);
        res.status(500).send("Lỗi đăng ký hệ thống");
    }
};

// --- 2. XỬ LÝ ĐĂNG NHẬP ---
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && bcrypt.compareSync(password, user.password)) {
            // Kiểm tra trạng thái khóa
            if (user.isLocked) {
                return res.render('user/login', {
                    error: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin!"
                });
            }

            // Thiết lập Session
            req.session.user = {
                id: user._id,
                email: user.email,
                role: user.role,
                fullName: user.fullName,
                address: user.address,
                phone: user.phone
            };

            // Phân quyền điều hướng (Fix lỗi %20 bằng cách viết sát)
            return user.role === 'admin' ? res.redirect('/admin') : res.redirect('/');
        }

        res.render('user/login', { error: "Email hoặc mật khẩu không chính xác!" });
    } catch (err) {
        console.error("Lỗi login:", err);
        res.status(500).send("Lỗi đăng nhập");
    }
};

// --- 3. ĐĂNG XUẤT ---
exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/');
};

// --- 4. LƯU THÔNG TIN CÁ NHÂN ---
exports.saveProfile = async (req, res) => {
    try {
        const { fullName, phone, address } = req.body;

        await User.findByIdAndUpdate(req.session.user.id, {
            fullName, phone, address
        });

        // Cập nhật lại session để FE hiển thị ngay không cần F5
        req.session.user.fullName = fullName;
        req.session.user.address = address;

        res.json({ success: true, message: "Đã lưu thông tin cá nhân thành công!" });
    } catch (err) {
        console.error("Lỗi saveProfile:", err);
        res.status(500).json({ success: false, message: "Lỗi khi lưu thông tin" });
    }
};