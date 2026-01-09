const express = require('express');
const router = express.Router();
const userController = require('../Controller/userController');

// Middleware kiểm tra trạng thái tài khoản (bạn cần import middleware này từ nơi bạn khai báo nó)
// Giả sử bạn để nó trong folder middlewares hoặc ultils. Nếu nó nằm ở server.js thì bạn cần chuyển nó ra file riêng.

// --- Trang chủ ---
router.get('/', userController.getHomePage);

// --- Danh mục sản phẩm ---
router.get('/Vest', userController.getVest);
router.get('/Quan', userController.getQuan);
router.get('/Aosomi', userController.getAosomi);
router.get('/Aodai', userController.getAodai);
router.get('/Phukien', userController.getPhukien);

// --- Chi tiết sản phẩm ---
router.get('/product/:id', userController.getProductDetail);

// --- Tài khoản & Auth ---
router.get('/login', userController.getLogin);
router.get('/register', userController.getRegister);
router.get('/Doimatkhau',userController.getChangePassword); // Có middleware

// --- Giỏ hàng & Đơn hàng ---
router.get('/cart', userController.getCart);
router.get('/order', userController.getOrders);

module.exports = router;