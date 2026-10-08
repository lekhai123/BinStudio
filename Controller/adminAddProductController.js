const Product = require('../Models/product');

exports.addProduct = async (req, res) => {
    try {
        // 1. Lấy dữ liệu cơ bản
        const { name, price, description, category } = req.body;

        // 2. Kiểm tra và lấy link ảnh từ Cloudinary
        if (!req.files || req.files.length === 0) {
            return res.status(400).send("Vui lòng tải lên ít nhất 1 ảnh hoặc video.");
        }
        const fileUrls = req.files.map(file => file.path);

        // 3. XỬ LÝ VARIANTS THEO DANH MỤC
        let variants = [];

        if (category === 'vest') {
            // Chỉ lấy Free Size
            const stock = parseInt(req.body.stock_FreeSize);
            if (!isNaN(stock) && stock > 0) {
                variants.push({ size: 'Free Size', stock: stock });
            }
        }
        else if (['aosomi', 'quan', 'aodai'].includes(category)) {
            // Lấy S, M, L
            if (req.body.stock_S > 0) variants.push({ size: 'S', stock: parseInt(req.body.stock_S) });
            if (req.body.stock_M > 0) variants.push({ size: 'M', stock: parseInt(req.body.stock_M) });
            if (req.body.stock_L > 0) variants.push({ size: 'L', stock: parseInt(req.body.stock_L) });
        }
        else if (category === 'phukien') {
            // Chỉ lấy N/A
            const stock = parseInt(req.body.stock_NA);
            if (!isNaN(stock) && stock > 0) {
                variants.push({ size: 'N/A', stock: stock });
            }
        }

        // 4. Tạo Product mới
        const newProduct = new Product({
            name,
            price: parseInt(price),
            description,
            category,
            image: fileUrls,
            variants: variants,
            isHidden: false // Mặc định không ẩn
        });

        // 5. Lưu vào MongoDB
        await newProduct.save();

        // 6. Redirect về trang quản lý (Đảm bảo đường dẫn chính xác)
        res.redirect('/aHyIsnxH18Ahpwww/products?success=true');

    } catch (err) {
        console.error("Lỗi Controller AddProduct:", err);
        res.status(500).send(`Lỗi hệ thống: ${err.message}`);
    }
};