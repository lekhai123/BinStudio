const express = require('express');
const router = express.Router();
const authController = require('../Controller/authUserController');

// Đăng ký
router.post('/register', authController.register);

// Đăng nhập
router.post('/login', authController.login);

// Đăng xuất
router.get('/logout', authController.logout);

// Cập nhật hồ sơ
router.post('/save-profile', authController.saveProfile);

module.exports = router;