const User = require('../Models/user');
const bcrypt = require('bcrypt');
const OTP = require('../Models/otp');


// --- 1. XỬ LÝ ĐĂNG KÝ ---
exports.register = async (req, res) => {
    try {
        const { email, password, confirmpassword, otp } = req.body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !password || !confirmpassword || !otp) {
            return res.send("Thiếu dữ liệu bắt buộc");
        }
        if (!emailRegex.test(email)) {
            return res.render('user/register', {
                error: "Định dạng Email không hợp lệ!"
            });
        }
        if (password !== confirmpassword) {
            return res.send("Mật khẩu xác nhận không khớp");
        }

        const otpRecord = await OTP.findOne({
            email,
            purpose: 'REGISTER',
            isUsed: false,
            expiresAt: { $gt: Date.now() }
        });

        if (!otpRecord) {
            return res.send("OTP không hợp lệ hoặc đã hết hạn");
        }

        // 🚫 Chặn brute force
        if (otpRecord.attempts >= 5) {
            return res.send("Bạn đã nhập sai OTP quá nhiều lần. Vui lòng yêu cầu mã mới.");
        }

        const isValidOTP = await bcrypt.compare(otp, otpRecord.code);

        if (!isValidOTP) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return res.send("Mã OTP không chính xác");
        }

        const existedUser = await User.findOne({ email });
        if (existedUser) {
            return res.send("Tài khoản đã tồn tại");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            email,
            password: hashedPassword,
            role: 'user'
        });

        otpRecord.isUsed = true;
        await otpRecord.save();

        return res.render('user/login', {
            success: "Đăng ký thành công! Vui lòng đăng nhập."
        });

    } catch (err) {
        console.error("Lỗi register:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};

// --- 2. XỬ LÝ ĐĂNG NHẬP ---
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render('user/login', {
                error: "Định dạng Email không hợp lệ!"
            });
        }
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

        // Validate số điện thoại nếu có nhập
        if (phone) {
            const phoneRegex = /^(0|\+84|84)(3|5|7|8|9)[0-9]{8}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: "Số điện thoại không đúng định dạng"
                });
            }
        }

        await User.findByIdAndUpdate(req.session.user.id, {
            fullName,
            phone,
            address
        });

        // Update lại session để FE render ngay
        req.session.user.fullName = fullName;
        req.session.user.phone = phone;
        req.session.user.address = address;

        res.json({
            success: true,
            message: "Đã lưu thông tin cá nhân thành công!"
        });

    } catch (err) {
        console.error("Lỗi saveProfile:", err);
        res.status(500).json({
            success: false,
            message: "Lỗi khi lưu thông tin"
        });
    }
};
