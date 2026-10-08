
const express = require('express');
const router = express.Router(); 
const fs = require('fs');
router.use((req, res, next) => {
    const log = `[${new Date().toLocaleString()}] ${req.method} ${req.url} \n`;
    fs.appendFileSync('system.log', log);
    next();
});
module.exports = router;