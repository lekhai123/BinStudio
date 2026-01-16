module.exports = (req, res, next) => {

    // Cho phép truy cập trang login
    if (req.path === '/login') {
        return next();
    }

    // Chưa đăng nhập hoặc không phải admin
    if (
        !req.session ||
        !req.session.user ||
        req.session.user.role !== 'admin'
    ) {
        return res.redirect('/aHyIsnxH18Ahpwww/login');
    }

    next();
};
