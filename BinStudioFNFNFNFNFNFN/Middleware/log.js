
const express = require('express');
const router = express.Router(); // 1. Sử dụng Router// Middleware ghi log đơn giản
const fs = require('fs');
router.use((req, res, next) => {
    const log = `[${new Date().toLocaleString()}] ${req.method} ${req.url} \n`;
    fs.appendFileSync('system.log', log);
    next();
});
module.exports = router;