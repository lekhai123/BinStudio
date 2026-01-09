const express = require('express');
const router = express.Router();

// Import Controller
const adminOrderController = require('../Controller/adminOrder&RevenueController');

router.get('/', adminOrderController.getRevenuePage);

router.post('/update-status/:id', adminOrderController.updateOrderStatus);

router.get('/api/revenue-data', adminOrderController.getRevenuePage);

// Thêm dòng này vào
router.post('/update-payment/:id', adminOrderController.updatePaymentStatus);

module.exports = router;