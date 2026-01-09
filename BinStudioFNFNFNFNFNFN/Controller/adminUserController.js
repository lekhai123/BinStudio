const User = require('../Models/user');

// --- 1. HIỂN THỊ DANH SÁCH NGƯỜI DÙNG ---
exports.listUsers = async (req, res) => {
    try {
        // Chỉ lấy những người có role là 'user' (bỏ qua admin)
        const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });

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
        }

        // Điều hướng về trang danh sách (Viết liền, không dấu cách)
        res.redirect('/admin/users');
    } catch (err) {
        console.error("Lỗi toggleUserLock:", err);
        res.status(500).send("Lỗi thao tác trên tài khoản người dùng");
    }
};