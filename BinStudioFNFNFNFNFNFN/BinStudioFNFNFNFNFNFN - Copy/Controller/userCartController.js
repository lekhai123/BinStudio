const Cart = require('../Models/cart');
const Product = require('../Models/product');

// --- 1. THÊM VÀO GIỎ HÀNG ---
exports.addToCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: "Vui lòng đăng nhập để mua hàng!" });
        }

        const { productId, quantity, size } = req.body;
        const userId = req.session.user.id;
        const qty = parseInt(quantity);
        const selectedSize = size || 'N/A';

        const product = await Product.findById(productId);
        if (!product) return res.json({ success: false, message: "Sản phẩm không tồn tại!" });

        // Kiểm tra tồn kho tổng quát (hoặc bạn có thể check theo size cụ thể ở đây)
        if (product.stock <= 0) {
            return res.json({ success: false, message: "Sản phẩm này đã hết hàng!" });
        }

        let cart = await Cart.findOne({ userId: userId });

        if (!cart) {
            cart = new Cart({
                userId: userId,
                items: [{ productId, quantity: qty, size: selectedSize }]
            });
        } else {
            const itemIndex = cart.items.findIndex(p =>
                p.productId.toString() === productId && p.size === selectedSize
            );

            if (itemIndex > -1) {
                const newQuantity = cart.items[itemIndex].quantity + qty;
                // Kiểm tra nếu tổng trong giỏ vượt quá tồn kho
                if (newQuantity > product.stock) {
                    return res.json({
                        success: false,
                        message: `Bạn đã có ${cart.items[itemIndex].quantity} cái trong giỏ. Tổng cộng vượt quá tồn kho!`
                    });
                }
                cart.items[itemIndex].quantity = newQuantity;
            } else {
                cart.items.push({ productId, quantity: qty, size: selectedSize });
            }
        }

        await cart.save();
        req.session.cartCount = cart.items.length;

        return res.json({
            success: true,
            message: "Đã thêm sản phẩm vào giỏ hàng!",
            cartCount: req.session.cartCount
        });
    } catch (err) {
        console.error("Lỗi addToCart:", err);
        res.json({ success: false, message: "Lỗi hệ thống!" });
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