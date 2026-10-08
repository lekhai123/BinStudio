const express = require('express');
const router = express.Router();
const adminController = require('../Controller/adminController');
const upload = require('../config/cloudinary');
router.get('/', adminController.getDashboard);
router.get('/api/dashboard-chart', adminController.getDashboardChartData);
// ...
router.get('/homepage', adminController.getHomepageConfig);
router.post('/homepage', upload.fields([
    { name: 'heroImage', maxCount: 1 },
    { name: 'celebImg1', maxCount: 1 },
    { name: 'celebImg2', maxCount: 1 },
    { name: 'celebImg3', maxCount: 1 }
]), adminController.updateHomepageConfig);// ...
module.exports = router;