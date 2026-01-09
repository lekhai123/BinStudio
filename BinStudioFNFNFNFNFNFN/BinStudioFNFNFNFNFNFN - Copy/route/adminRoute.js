const express = require('express');
const router = express.Router();
const adminController = require('../Controller/adminController');
router.get('/', adminController.getDashboard);
module.exports = router;