const express = require('express');
const router = express.Router();
const cartController = require('../Controller/userCartController');

// Route thêm sản phẩm
router.post('/add-to-cart', cartController.addToCart);

// Route cập nhật số lượng (tăng/giảm)
router.post('/update-cart', cartController.updateCart);

// Route xóa sản phẩm
router.post('/remove-from-cart', cartController.removeFromCart);

module.exports = router;