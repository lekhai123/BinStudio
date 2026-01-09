const express = require('express');
const router = express.Router();
const adminUserController = require('../Controller/adminUserController');

// 1. Route lấy danh sách
router.get('/', adminUserController.listUsers);

// 2. Route xử lý Khóa/Mở khóa
router.post('/toggle-lock/:id', adminUserController.toggleUserLock);

module.exports = router;