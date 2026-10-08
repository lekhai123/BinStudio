const express = require('express');
const router = express.Router();

const adminOrderController = require('../Controller/adminOrder&RevenueController');

router.get('/', adminOrderController.getRevenuePage);

router.post('/update-status/:id', adminOrderController.updateOrderStatus);

router.get('/api/revenue-data', adminOrderController.getRevenuePage);

router.post('/update-payment/:id', adminOrderController.updatePaymentStatus);

module.exports = router;