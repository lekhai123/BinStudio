const express = require('express');
const router = express.Router(); // 1. Sử dụng Router thay vì app
const Product = require('../Models/product'); // 2. Sửa đường dẫn: Models viết hoa và dùng ../

// 3. Thay app.get bằng router.get
router.get('/vest', async (req, res) => {
    try {
        // Lấy tất cả sản phẩm thuộc danh mục 'vest' từ MongoDB Atlas
        const products = await Product.find({ category: 'vest' });

        // Đổ dữ liệu vào file EJS trong thư mục view/vest-page.ejs
        res.render('vest-page', { products });
    } catch (err) {
        console.error("Lỗi hiển thị trang Vest:", err);
        res.status(500).send("Lỗi tải sản phẩm");
    }
});

// 4. Bắt buộc phải xuất router để server.js sử dụng
module.exports = router;