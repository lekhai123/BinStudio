const mongoose = require('mongoose');
const Product = require('../Models/product');
const Cart = require('../Models/cart');
const Order = require('../Models/order');
const PageContent = require('../Models/pagecontent');
// 1. Trang chủ
exports.getHomePage = async (req, res) => {
    try {
        // Gom tất cả điều kiện vào tham số thứ nhất
        console.log("🚀 1. Đã vào được Route trang chủ (getHomePage)");
        console.log("🔌 Trạng thái Mongoose:", mongoose.connection.readyState);
        const products = await Product.find({
            isHot: true,      // Phải là sản phẩm HOT
            isHidden: false   // Và sản phẩm đó KHÔNG ĐƯỢC BỊ ẨN
        })
            .sort({ updatedAt: -1 })
            .limit(8);

        let content = await PageContent.findOne();

        // 🔥 FALLBACK: Nếu DB chưa có dữ liệu (Web mới chạy lần đầu)
        // Thì tạo một object mặc định để View không bị lỗi
        if (!content) {
            content = new PageContent({
                hero: {
                    title: 'BINSTUDIO LUXURY',
                    subtitle: 'THỜI TRANG QUÝ ÔNG',
                    description: 'Đẳng cấp phái mạnh được khẳng định qua từng đường kim mũi chỉ.',
                    backgroundImage: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600'
                },
                services: [
                    { icon: '<i class="fas fa-ruler-combined"></i>', title: 'MAY ĐO BESPOKE', description: 'Độc bản theo số đo riêng' },
                    { icon: '<i class="fas fa-tshirt"></i>', title: 'CHO THUÊ CAO CẤP', description: 'Đa dạng mẫu mã sự kiện' },
                    { icon: '<i class="fas fa-shipping-fast"></i>', title: 'GIAO HÀNG HỎA TỐC', description: 'Nhận hàng trong 4H nội thành' }
                ],
                celebrities: [
                    { name: 'Diễn Viên A', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400' },
                    { name: 'Ca Sĩ B', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400' },
                    { name: 'MC C', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400' }
                ]
            });
        }
        res.render('user/BinStudio', { products: products, content: content });


    } catch (err) {
        console.error("Lỗi trang chủ:", err);
        res.render('user/BinStudio', { products: [] });
    }
};

// 2. Các trang danh mục (Vest, Quần, Áo sơ mi...)
exports.getCategoryPage = async (req, res) => {
    try {
        // Lấy tên danh mục từ đường dẫn (URL) để xử lý động cho gọn
        // Tuy nhiên để an toàn giống code cũ, ta viết hàm riêng hoặc switch case
        // Ở đây mình tách hàm cho bạn dễ copy nhé:
        const path = req.path.replace('/', '').toLowerCase(); // Lấy 'vest', 'quan'...

        const products = await Product.find({
            category: path, // Lưu ý: Đảm bảo database lưu 'vest', 'quan' khớp với url
            isHidden: { $ne: true }
        });

        // Render đúng file view (Viết hoa chữ cái đầu: vest -> Vest)
        const viewName = path.charAt(0).toUpperCase() + path.slice(1);
        res.render(`user/${viewName}`, { products });
    } catch (err) {
        res.status(500).send("Lỗi server");
    }
};

// Hoặc nếu bạn muốn giữ nguyên từng hàm rời rạc cho an toàn:
exports.getVest = async (req, res) => {
    const products = await Product.find({ category: 'vest', isHidden: { $ne: true } });
    res.render('user/Vest', { products });
};
exports.getQuan = async (req, res) => {
    const products = await Product.find({ category: 'quan', isHidden: { $ne: true } });
    res.render('user/Quan', { products });
};
exports.getAosomi = async (req, res) => {
    const products = await Product.find({ category: 'aosomi', isHidden: { $ne: true } });
    res.render('user/Aosomi', { products });
};
exports.getAodai = async (req, res) => {
    const products = await Product.find({ category: 'aodai', isHidden: { $ne: true } });
    res.render('user/Aodai', { products });
};
exports.getPhukien = async (req, res) => {
    const products = await Product.find({ category: 'phukien', isHidden: { $ne: true } });
    res.render('user/Phukien', { products });
};

// 3. Auth & Account
exports.getLogin = (req, res) => res.render('user/login');
exports.getRegister = (req, res) => res.render('user/register');
exports.getChangePassword = (req, res) => res.render('user/Doimatkhau', {
    error: null,
    success: null
});

// 4. Giỏ hàng
exports.getCart = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const cart = await Cart.findOne({ userId: req.session.user.id }).populate('items.productId');
        res.render('user/cart', { cart: cart });
    } catch (err) {
        console.error("Lỗi giỏ hàng:", err);
        res.status(500).send("Lỗi tải giỏ hàng");
    }
};

exports.getProductDetail = async (req, res) => {
    try {
        // 1. Tìm sản phẩm
        const product = await Product.findOne({
            _id: req.params.id,
            isHidden: { $ne: true }
        });

        if (!product) return res.status(404).send("Sản phẩm không khả dụng.");

        // 2. 🔥 LOGIC FIX LỖI: TỰ TÍNH LẠI CART COUNT TỪ DB 🔥
        // (Không tin tưởng vào req.session.cartCount nữa vì nó đang bị lỗi 0)
        let finalCartCount = 0;

        // ✅ ƯU TIÊN SESSION (nguồn đang sống)
        if (req.session.user) {
            const cart = await Cart.findOne({ userId: req.session.user.id });
            if (cart?.items?.length) {
                finalCartCount = cart.items.length;
            }
        }
        // 3. Render ra view với số lượng chính xác tuyệt đối
        res.render('user/product', {
            product: product,
            user: req.session.user || null,

            // ✅ Dùng biến vừa tính, KHÔNG dùng req.session.cartCount cũ nữa
            cartCount: finalCartCount

        });

    } catch (err) {
        console.error("Lỗi chi tiết sản phẩm:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};

// 6. Lịch sử đơn hàng
exports.getOrders = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const orders = await Order.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
        res.render('user/order', { orders: orders });
    } catch (err) {
        console.error("Lỗi đơn hàng:", err);
        res.status(500).send("Lỗi tải đơn hàng");
    }
};