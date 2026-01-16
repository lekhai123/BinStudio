const express = require('express');
const router = express.Router();
const orderController = require('../Controller/userOrderController');

// 1. API Tính phí vận chuyển
router.post('/api/calc-shipping', orderController.calcShipping);

// 2. Xử lý đặt hàng
router.post('/place-order', orderController.placeOrder);
// 3.Webhook Sepay

router.get('/order', orderController.getUserOrders);
// Thêm route này vào file routes
router.post('/repay-order', orderController.repayOrder);

router.get('/order/tracking/:id', orderController.trackOrder);
router.post('/order/ghn-webhook', orderController.ghnWebhook).

module.exports = router;