const express = require('express');
const router = express.Router();
const uploadCloud = require('../config/cloudinary');
const adminProductController = require('../Controller/adminProductController');

router.get('/', adminProductController.listProducts);

router.get('/add-product', adminProductController.renderAddForm);
router.post('/add-product', uploadCloud.array('image', 5), adminProductController.createProduct);

router.post('/toggle-product/:id', adminProductController.toggleVisibility);
router.post('/toggle-hot/:id', adminProductController.toggleHot);
router.post('/delete-product/:id', adminProductController.deleteProduct);

router.get('/edit-product/:id', adminProductController.renderEditForm);
router.post('/edit-product/:id', uploadCloud.array('image', 5), adminProductController.updateProduct);

module.exports = router;