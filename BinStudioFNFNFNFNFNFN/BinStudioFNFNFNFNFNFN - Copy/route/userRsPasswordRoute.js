require('dotenv').config();
const express = require('express');
const router = express.Router();
const passwordController = require('../Controller/userRsPasswordController');

// 1. Route yêu cầu gửi OTP
router.post('/get-otp', passwordController.getOTP);

// 2. Route thực hiện đổi mật khẩu
router.post('/Doimatkhau', passwordController.resetPassword);

module.exports = router;