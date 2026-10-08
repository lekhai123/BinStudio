const express = require('express');
const router = express.Router();
const adminAuthController = require('../Controller/authAdminController');
const isAdmin = require('../Middleware/authAdminMiddleware');
const adminDashboardController = require('../Controller/adminController');

router.get('/login', adminAuthController.getLogin);
router.post('/login', adminAuthController.postLogin);

router.use(isAdmin);

router.use('/', require('./adminRoute'));

router.use('/products', require('./adminProductRoute'));
router.use('/users', require('./adminUserRoute'));
router.use('/orders', require('./adminOrder&RevenueRoute'));
router.use('/config', require('./adminAPI&LogRoute'));

module.exports = router;