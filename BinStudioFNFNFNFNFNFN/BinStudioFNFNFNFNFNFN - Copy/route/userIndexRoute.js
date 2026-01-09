const express = require('express');
const router = express.Router();

router.use('/', require('./userRoute'));
router.use('/', require('./authRoute'));
router.use('/', require('./userProductRoute'));
router.use('/', require('./userCartRoute'));
router.use('/', require('./userOrderRoute'));
router.use('/', require('./userRsPasswordRoute'));

module.exports = router;