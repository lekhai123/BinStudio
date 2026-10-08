const express = require('express');
const router = express.Router();
const uploadCloud = require('../config/cloudinary');
const adminAddProductController = require('../Controller/adminAddProductController');

// Route POST xử lý thêm sản phẩm
// Chúng ta dùng uploadCloud.array để nhận tối đa 5 file
router.post('/add-product', uploadCloud.array('image', 5), adminAddProductController.addProduct);

module.exports = router;0