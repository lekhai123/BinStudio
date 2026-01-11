const User = require('../Models/user');
const bcrypt = require('bcrypt');

exports.getLogin = (req, res) => {
    // Đảm bảo file view tên là loginAdmin.ejs trong thư mục admin
    res.render('admin/loginAdmin', { error: null });
};

exports.postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && bcrypt.compareSync(password, user.password)) {
            // Check quyền
            if (user.role !== 'admin') {
                return res.render('admin/loginAdmin', {
                    error: "Truy cập bị từ chối. Bạn không có quyền quản trị!"
                });
            }

            // Lưu session
            req.session.user = {
                id: user._id,
                email: user.email,
                role: user.role,
                fullName: user.fullName
            };

            // 4. 🔥 ÉP LƯU SESSION TRƯỚC KHI REDIRECT (Fix lỗi trên Render)
            return req.session.save((err) => {
                if (err) {
                    console.error("Lỗi lưu session Admin:", err);
                    return res.render('admin/loginAdmin', { error: "Lỗi lưu phiên đăng nhập!" });
                }
                // Redirect về trang Dashboard sau khi session đã ghi vào DB xong
                return res.redirect('/admin');
            });
        }

        res.render('admin/loginAdmin', { error: "Email hoặc mật khẩu admin không đúng!" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi hệ thống");
    }
};