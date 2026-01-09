const express = require('express');
const router = express.Router();
const adminAuthController = require('../Controller/authAdminController');
const isAdmin = require('../Middleware/authAdminMiddleware');
const adminDashboardController = require('../Controller/adminController');

// ==========================================
// 1. ĐĂNG NHẬP (Phải nằm TRƯỚC Middleware)
// ==========================================
// URL: domain.com/admin/login
router.get('/login', adminAuthController.getLogin);
router.post('/login', adminAuthController.postLogin);

// ==========================================
// 2. KÍCH HOẠT BẢO VỆ
// ==========================================
router.use(isAdmin);

// ==========================================
// 3. TRANG DASHBOARD (Quan trọng)
// ==========================================
// URL: domain.com/admin
router.use('/', require('./adminRoute'));
// ==========================================
// 4. CÁC MODULE KHÁC
// ==========================================
router.use('/products', require('./adminProductRoute'));
router.use('/users', require('./adminUserRoute'));
router.use('/orders', require('./adminOrder&RevenueRoute'));
router.use('/config', require('./adminAPI&LogRoute'));

module.exports = router;