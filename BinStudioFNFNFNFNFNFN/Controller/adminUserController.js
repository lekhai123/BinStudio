const User = require('../Models/user');
const bcrypt = require('bcrypt');
const Log = require('../Models/log');
// --- 1. HIỂN THỊ DANH SÁCH NGƯỜI DÙNG ---
exports.listUsers = async (req, res) => {
    try {
        // Chỉ lấy những người có role là 'user' (bỏ qua admin)
        const users = await User.find().sort({ createdAt: -1 }).lean();
        res.render('admin/admin-user', { users });
    } catch (err) {
        console.error("Lỗi listUsers:", err);
        res.status(500).send("Lỗi tải danh sách người dùng");
    }
};

// --- 2. XỬ LÝ KHÓA / MỞ KHÓA TÀI KHOẢN ---
exports.toggleUserLock = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (user) {
            // Đảo trạng thái: Nếu đang true thành false và ngược lại
            user.isLocked = !user.isLocked;
            await user.save();
            await Log.create({
                type: 'ADMIN',
                message: `Admin đã ${user.isLocked ? 'KHÓA' : 'MỞ KHÓA'} tài khoản: ${user.email}`
            });
        }

        // Điều hướng về trang danh sách (Viết liền, không dấu cách)
        res.redirect('/aHyIsnxH18Ahpwww/users');
    } catch (err) {
        console.error("Lỗi toggleUserLock:", err);
        res.status(500).send("Lỗi thao tác trên tài khoản người dùng");
    }
};

exports.toggleUserRole = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (user) {
            // Đổi vai trò
            user.role = (user.role === 'admin') ? 'user' : 'admin';
            await user.save();

            // Sửa lại log: dùng user.role thay vì user.isAdmin để tránh lỗi undefined
            await Log.create({
                type: 'ADMIN',
                message: `Admin thay đổi vai trò user ${user.email} sang: ${user.role.toUpperCase()}`
            });
        }
        res.redirect('/aHyIsnxH18Ahpwww/users');
    } catch (err) {
        console.error("Lỗi toggleUserRole:", err);
        res.status(500).send("Lỗi cập nhật quyền");
    }
};
exports.changeUserPassword = async (req, res) => {
    try {
        const { userId, newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            // Có thể thêm thông báo lỗi (flash message) nếu muốn
            console.log("Mật khẩu quá ngắn");
            return res.redirect('/admin/users');
        }

        const user = await User.findById(userId);
        if (user) {
            // Mã hóa mật khẩu mới trước khi lưu
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;
            await user.save();
            console.log(`Đã đổi mật khẩu cho ${user.email}`);
        }

        res.redirect('/aHyIsnxH18Ahpwww/users');
    } catch (err) {
        console.error("Lỗi changeUserPassword:", err);
        res.status(500).send("Lỗi đổi mật khẩu");
    }
};