const express = require('express');
const router = express.Router();
const orderController = require('../Controller/userOrderController');

// 1. API Tính phí vận chuyển
router.post('/api/calc-shipping', orderController.calcShipping);

// 2. Xử lý đặt hàng
router.post('/place-order', orderController.placeOrder);
// 3.Webhook Sepay
router.post('/api/payos-webhook', orderController.payosWebhook);
// 4. Trang danh sách đơn hàng của User
router.get('/order', orderController.getUserOrders);

module.exports = router;