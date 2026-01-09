const User = require('../Models/user');
const Cart = require('../Models/cart');

// Kiểm tra tài khoản bị khóa
exports.checkAccountStatus = async (req, res, next) => {
    if (req.session.user) {
        const user = await User.findById(req.session.user.id);
        if (user && user.isLocked) {
            req.session.destroy();
            return res.redirect('/login?error=account_locked');
        }
    }
    next();
};

// Đổ dữ liệu user và số lượng giỏ hàng vào biến toàn cục của view
exports.injectUserData = async (req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.cartCount = 0;
    if (req.session.user) {
        try {
            const cart = await Cart.findOne({ userId: req.session.user.id });
            res.locals.cartCount = cart ? cart.items.length : 0;
        } catch (err) { console.error(err); }
    }
    next();
};