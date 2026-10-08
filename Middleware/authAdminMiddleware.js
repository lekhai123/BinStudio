module.exports = (req, res, next) => {

    if (req.path === '/login') {
        return next();
    }

    if (
        !req.session ||
        !req.session.user ||
        req.session.user.role !== 'admin'
    ) {
        return res.redirect('/aHyIsnxH18Ahpwww/login');
    }

    next();
};
