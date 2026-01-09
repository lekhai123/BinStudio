const express = require('express');
const router = express.Router();

// Import Controller
const adminOrderController = require('../Controller/adminOrder&RevenueController');

router.get('/', adminOrderController.getRevenuePage);

router.post('/update-status/:id', adminOrderController.updateOrderStatus);

router.get('/api/revenue-data', adminOrderController.getRevenueChartData);

module.exports = router;