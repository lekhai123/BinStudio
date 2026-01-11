const Product = require('../Models/product');
const cloudinary = require('cloudinary').v2;

// --- HÀM HỖ TRỢ: Lấy Public ID từ URL Cloudinary để xóa ảnh ---
const getPublicIdFromUrl = (url) => {
    try {
        const splitUrl = url.split('/');
        const filename = splitUrl.pop().split('.')[0];
        const folder = splitUrl.pop();
        return `${folder}/${filename}`;
    } catch (error) {
        return null;
    }
};

// --- 1. DANH SÁCH SẢN PHẨM & CẢNH BÁO TỒN KHO ---
// --- 1. DANH SÁCH SẢN PHẨM (ĐÃ TÍCH HỢP TÌM KIẾM & LỌC) ---
exports.listProducts = async (req, res) => {
    try {
        // 1. Lấy dữ liệu từ thanh tìm kiếm
        const { keyword, category } = req.query;
        let filter = {};

        // 2. Nếu có từ khóa -> Tìm theo tên (Không phân biệt hoa thường)
        if (keyword) {
            filter.name = { $regex: keyword, $options: 'i' };
        }

        // 3. Nếu có danh mục -> Lọc theo danh mục
        if (category) {
            filter.category = category;
        }

        // 4. Truy vấn Database với bộ lọc (Sắp xếp mới nhất trước)
        const products = await Product.find(filter).sort({ createdAt: -1 }).lean();

        // 5. Logic cảnh báo tồn kho thấp (< 3)
        let lowStockAlerts = [];
        products.forEach(p => {
            p.variants.forEach(v => {
                if (v.stock < 3) {
                    lowStockAlerts.push({
                        name: p.name,
                        size: v.size,
                        stock: v.stock,
                        productId: p._id
                    });
                }
            });
        });

        // 6. Render ra View
        res.render('admin/Qlysanpham', {
            products,
            lowStockAlerts,
            successMessage: req.flash('success'), // Nếu dùng flash message
            queryData: req.query // 🔥 QUAN TRỌNG: Truyền lại để giữ giá trị trên ô input
        });

    } catch (err) {
        console.error("Lỗi tải danh sách:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};
// --- 2. HIỂN THỊ FORM THÊM ---
exports.renderAddForm = (req, res) => {
    res.render('admin/admin-add-product');
};

// --- 3. XỬ LÝ THÊM SẢN PHẨM MỚI ---
exports.createProduct = async (req, res) => {
    try {
        const { name, price, description, category } = req.body;

        if (!req.files || req.files.length === 0) {
            return res.status(400).send("Vui lòng tải lên ít nhất 1 ảnh hoặc video.");
        }
        const fileUrls = req.files.map(file => file.path);

        let variants = [];
        if (category === 'vest') {
            const qty = parseInt(req.body.stock_FreeSize);
            if (!isNaN(qty)) variants.push({ size: 'Free Size', stock: qty });
        } else if (['aosomi', 'quan', 'aodai'].includes(category)) {
            if (req.body.stock_S) variants.push({ size: 'S', stock: parseInt(req.body.stock_S) });
            if (req.body.stock_M) variants.push({ size: 'M', stock: parseInt(req.body.stock_M) });
            if (req.body.stock_L) variants.push({ size: 'L', stock: parseInt(req.body.stock_L) });
        } else if (category === 'phukien') {
            const qty = parseInt(req.body.stock_NA);
            if (!isNaN(qty)) variants.push({ size: 'N/A', stock: qty });
        }

        const newProduct = new Product({
            name,
            price: parseInt(price),
            description,
            category,
            image: fileUrls,
            variants,
            isHidden: false
        });

        await newProduct.save();
        res.redirect('/admin/products');
    } catch (err) {
        console.error("Lỗi thêm sản phẩm:", err);
        res.status(500).send(`Lỗi Server: ${err.message}`);
    }
};

// --- 4. ẨN / HIỆN SẢN PHẨM ---
exports.toggleVisibility = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            product.isHidden = !product.isHidden;
            await product.save();
        }
        res.redirect('/admin/products');
    } catch (err) {
        res.status(500).send("Lỗi cập nhật trạng thái");
    }
};
exports.toggleHot = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            // Đảo ngược trạng thái (đang true thành false, đang false thành true)
            product.isHot = !product.isHot;
            await product.save();
            req.flash('success', product.isHot ? 'Đã thêm vào mục Nổi Bật!' : 'Đã bỏ khỏi mục Nổi Bật!');
        }
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi hệ thống");
    }
};

// --- 5. XÓA SẢN PHẨM (XÓA CẢ ẢNH TRÊN CLOUD) ---
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            if (product.image && product.image.length > 0) {
                for (const imageUrl of product.image) {
                    const publicId = getPublicIdFromUrl(imageUrl);
                    if (publicId) await cloudinary.uploader.destroy(publicId);
                }
            }
            await Product.findByIdAndDelete(req.params.id);
        }
        res.redirect('/admin/products?success=true');
    } catch (err) {
        console.error("Lỗi xóa:", err);
        res.status(500).send("Lỗi khi xóa sản phẩm");
    }
};

// --- 6. HIỂN THỊ FORM SỬA ---
exports.renderEditForm = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).send("Không tìm thấy sản phẩm");
        res.render('admin/admin-add-product', { product });
    } catch (err) {
        res.status(500).send("Lỗi tải trang sửa");
    }
};

// --- 7. CẬP NHẬT SẢN PHẨM ---
exports.updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const { name, price, description, category } = req.body;
        const currentProduct = await Product.findById(productId);
        if (!currentProduct) return res.status(404).send("Sản phẩm không tồn tại");

        // Xử lý xóa ảnh cũ
        let imagesToDelete = req.body.delete_images || [];
        if (!Array.isArray(imagesToDelete)) imagesToDelete = [imagesToDelete];

        for (const imageUrl of imagesToDelete) {
            const publicId = getPublicIdFromUrl(imageUrl);
            if (publicId) await cloudinary.uploader.destroy(publicId);
        }

        let finalImages = currentProduct.image.filter(url => !imagesToDelete.includes(url));

        // Thêm ảnh mới
        if (req.files && req.files.length > 0) {
            const newImageUrls = req.files.map(file => file.path);
            finalImages = finalImages.concat(newImageUrls);
        }

        if (finalImages.length === 0) return res.status(400).send("Sản phẩm phải có ít nhất 1 ảnh.");

        // Xử lý Variants chuẩn (nhận cả số 0)
        let variants = [];
        const parseStock = (val) => (val === undefined || val === '') ? null : parseInt(val);

        if (category === 'vest') {
            const s = parseStock(req.body.stock_FreeSize);
            if (s !== null) variants.push({ size: 'Free Size', stock: s });
        } else if (['aosomi', 'quan', 'aodai'].includes(category)) {
            const s = parseStock(req.body.stock_S), m = parseStock(req.body.stock_M), l = parseStock(req.body.stock_L);
            if (s !== null) variants.push({ size: 'S', stock: s });
            if (m !== null) variants.push({ size: 'M', stock: m });
            if (l !== null) variants.push({ size: 'L', stock: l });
        } else if (category === 'phukien') {
            const na = parseStock(req.body.stock_NA);
            if (na !== null) variants.push({ size: 'N/A', stock: na });
        }

        await Product.findByIdAndUpdate(productId, {
            name, price: parseInt(price), description, variants, image: finalImages
        });
        res.redirect('/admin/products?success=true');
    } catch (err) {
        console.error("Lỗi cập nhật:", err);
        res.status(500).send("Lỗi hệ thống: " + err.message);
    }
};