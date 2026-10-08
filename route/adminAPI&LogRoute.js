const express = require('express');
const router = express.Router();
const adminConfigController = require('../Controller/adminConfigController');

router.get('/', adminConfigController.getConfigPage);

router.post('/save', adminConfigController.saveConfig);

router.post('/logs/clear', adminConfigController.clearLogs);

router.get('/api/logs-stream', adminConfigController.getLogsStream);

module.exports = router;