const Cart = require('../Models/cart');
const Product = require('../Models/product');

// --- 1. THÊM VÀO GIỎ HÀNG ---
exports.addToCart = async (req, res) => {
    try {
        // 1. Kiểm tra đăng nhập
        if (!req.session.user) {
            return res.json({ success: false, message: "Vui lòng đăng nhập để mua hàng!" });
        }

        const { productId, quantity, size } = req.body;
        const userId = req.session.user.id;
        const qty = parseInt(quantity); // Số lượng muốn thêm

        // 2. Tìm sản phẩm
        const product = await Product.findById(productId);
        if (!product) return res.json({ success: false, message: "Sản phẩm không tồn tại!" });

        // --- QUAN TRỌNG: TÌM ĐÚNG BIẾN THỂ (SIZE) ĐỂ CHECK KHO ---
        // Giả sử model Product của bạn có field variants: [{ size: String, stock: Number }]
        const variant = product.variants.find(v => v.size === size);

        if (!variant) {
            return res.json({ success: false, message: "Kích cỡ không hợp lệ!" });
        }

        if (variant.stock <= 0) {
            return res.json({ success: false, message: `Size ${size} đã hết hàng!` });
        }

        // 3. Lấy giỏ hàng của user
        let cart = await Cart.findOne({ userId: userId });

        // Biến lưu số lượng hiện tại đang có trong giỏ (Mặc định là 0)
        let currentQtyInCart = 0;

        if (!cart) {
            // Nếu chưa có giỏ thì tạo mới
            cart = new Cart({ userId: userId, items: [] });
        } else {
            // Nếu có giỏ rồi, tìm xem món này đã có trong đó chưa
            const existingItem = cart.items.find(
                p => p.productId.toString() === productId && p.size === size
            );

            if (existingItem) {
                currentQtyInCart = existingItem.quantity;
            }
        }

        // --- 4. LOGIC KIỂM TRA TỒN KHO CHẶT CHẼ ---
        // Tổng số lượng user muốn sở hữu = (Đã có trong giỏ) + (Muốn thêm đợt này)
        const totalWanted = currentQtyInCart + qty;

        if (totalWanted > variant.stock) {
            return res.json({
                success: false,
                message: `Kho chỉ còn ${variant.stock} sản phẩm size ${size}. Trong giỏ bạn đã có ${currentQtyInCart}, không thể thêm tiếp!`
            });
        }

        // --- 5. CẬP NHẬT GIỎ HÀNG (Nếu đã qua được bài kiểm tra ở trên) ---
        const itemIndex = cart.items.findIndex(
            p => p.productId.toString() === productId && p.size === size
        );

        if (itemIndex > -1) {
            // Nếu đã có -> Cộng dồn
            cart.items[itemIndex].quantity += qty;
        } else {
            // Nếu chưa có -> Push mới
            cart.items.push({ productId, quantity: qty, size: size });
        }

        await cart.save();

        // Cập nhật session nếu cần hiển thị số lượng trên menu
        // Lưu ý: cartCount thường đếm tổng số item (dòng) hoặc tổng số lượng sản phẩm
        req.session.cartCount = cart.items.length;
        return res.json({
            success: true,
            message: "Đã thêm sản phẩm vào giỏ hàng!",
            cartCount: req.session.cartCount
        });

    } catch (err) {
        console.error("Lỗi addToCart:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống!" });
    }
};
// --- 2. CẬP NHẬT SỐ LƯỢNG (Tăng/Giảm) ---
exports.updateCart = async (req, res) => {
    try {
        const { productId, action, size } = req.body;
        if (!req.session.user) return res.status(401).json({ success: false, message: "Vui lòng đăng nhập" });

        const userId = req.session.user.id;
        const cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: "Giỏ hàng không tồn tại" });

        const item = cart.items.find(i =>
            i.productId.toString() === productId && i.size === size
        );

        if (!item) return res.status(404).json({ success: false, message: "Sản phẩm không có trong giỏ" });

        if (action === 'increase') {
            const product = await Product.findById(productId);
            // Tìm biến thể size để check tồn kho chính xác
            const variant = product.variants.find(v => v.size === size);

            if (variant && item.quantity >= variant.stock) {
                return res.status(400).json({
                    success: false,
                    message: `Kho chỉ còn ${variant.stock} sản phẩm size ${size}!`
                });
            }
            item.quantity++;
        } else if (action === 'decrease') {
            item.quantity--;
            if (item.quantity <= 0) {
                cart.items = cart.items.filter(i => i !== item);
            }
        }

        await cart.save();
        req.session.cartCount = cart.items.length;
        res.json({ success: true, cartCount: req.session.cartCount });
    } catch (err) {
        console.error("Lỗi updateCart:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// --- 3. XÓA KHỎI GIỎ HÀNG ---
exports.removeFromCart = async (req, res) => {
    try {
        const { productId, size } = req.body;
        const userId = req.session.user.id;

        const updatedCart = await Cart.findOneAndUpdate(
            { userId: userId },
            { $pull: { items: { productId: productId, size: size } } },
            { new: true }
        );

        req.session.cartCount = updatedCart ? updatedCart.items.length : 0;
        res.json({ success: true, cartCount: req.session.cartCount });
    } catch (err) {
        console.error("Lỗi removeFromCart:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};