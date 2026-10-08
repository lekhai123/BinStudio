require('dotenv').config();
const express = require('express');
const router = express.Router();
const passwordController = require('../Controller/userRsPasswordController');
const rateLimit = require('express-rate-limit');

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15p
    max: 5,
    message: { success: false, message: "Bạn đã yêu cầu quá nhiều lần, vui lòng quay lại sau 15p." }
});
router.post('/get-otp', otpLimiter, passwordController.getOTP);

router.post('/Doimatkhau', passwordController.resetPassword);

module.exports = router;