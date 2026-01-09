require('dotenv').config();
const Order = require('../Models/order');
const Cart = require('../Models/cart');
const Product = require('../Models/product');
const axios = require('axios');
const crypto = require('crypto');

// --- 🛠️ CLASS PAYOS THỦ CÔNG (GIỮ NGUYÊN) ---
class PayOS {
    constructor(clientId, apiKey, checksumKey) {
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
    }

    async createPaymentLink(data) {
        const signData = {
            amount: data.amount,
            cancelUrl: data.cancelUrl,
            description: data.description,
            orderCode: data.orderCode,
            returnUrl: data.returnUrl
        };
        const sortedStr = Object.keys(signData).sort().map(key => `${key}=${signData[key]}`).join('&');
        const signature = crypto.createHmac('sha256', this.checksumKey).update(sortedStr).digest('hex');

        console.log("🚀 Đang gọi API PayOS trực tiếp...");
        try {
            const res = await axios.post(
                'https://api-merchant.payos.vn/v2/payment-requests',
                { ...data, signature },
                {
                    headers: {
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey
                    }
                }
            );
            if (res.data.code === '00') return res.data.data;
            throw new Error(res.data.desc);
        } catch (err) {
            throw new Error(err.response?.data?.desc || err.message);
        }
    }
}

const CONFIG = {
    GHN: {
        'token': process.env.GHN_TOKEN,
        'ShopId': parseInt(process.env.GHN_SHOP_ID),
        'baseUrl': 'https://online-gateway.ghn.vn/shiip/public-api'
    }
};

// --- GIỮ NGUYÊN HÀM TÍNH SHIP ---
exports.calcShipping = async (req, res) => {
    try {
        const { districtId, wardCode, carrier, orderAmount, provinceId } = req.body;
        if (!districtId || !wardCode) return res.status(400).json({ success: false, message: "Thiếu thông tin địa chỉ" });

        if (carrier === 'LOCAL') {
            const pId = parseInt(provinceId);
            if (pId !== 202) return res.status(400).json({ success: false, message: "Chỉ ship nội thành TP.HCM" });
            const total = parseInt(orderAmount) || 0;
            const fee = total >= 2000000 ? 0 : 30000;
            return res.json({ success: true, fee: fee });
        }

        // GHN Logic (Rút gọn cho dễ nhìn)
        try {
            const payload = {
                "service_type_id": 2, "from_district_id": 1454, "to_district_id": parseInt(districtId), "to_ward_code": wardCode.toString(),
                "height": 10, "length": 40, "weight": 2000, "width": 40, "insurance_value": parseInt(orderAmount) || 1000000
            };
            const ghnRes = await axios.post(`${CONFIG.GHN.baseUrl}/v2/shipping-order/fee`, payload, {
                headers: { 'Token': CONFIG.GHN.token, 'ShopId': parseInt(CONFIG.GHN.shopId), 'Content-Type': 'application/json' }
            });
            if (ghnRes.data.code === 200) return res.json({ success: true, fee: ghnRes.data.data.total });
            else return res.status(400).json({ success: false, message: ghnRes.data.message });
        } catch (apiErr) { return res.status(400).json({ success: false, message: "Lỗi kết nối GHN" }); }
    } catch (err) { res.status(500).json({ success: false, message: "Lỗi hệ thống" }); }
};

// --- 2. XỬ LÝ ĐẶT HÀNG (SỬA ĐỔI: KHÔNG TRỪ KHO, KHÔNG XÓA GIỎ) ---
exports.placeOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });
        if (!process.env.PAYOS_CLIENT_ID) return res.status(500).json({ message: "Thiếu ENV PayOS" });

        const payos = new PayOS(
            process.env.PAYOS_CLIENT_ID,
            process.env.PAYOS_API_KEY,
            process.env.PAYOS_CHECKSUM_KEY
        );

        const userId = req.session.user.id;
        const { items, shippingInfo, shippingMethod, shippingFee } = req.body;

        let serverProductTotal = 0;
        const orderItems = [];

        // --- CHỈ KIỂM TRA TỒN KHO (KHÔNG TRỪ) ---
        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) return res.status(400).json({ message: "Sản phẩm không tồn tại" });

            const variantIndex = product.variants.findIndex(v => v.size === item.size);
            if (variantIndex === -1) return res.status(400).json({ message: `Size ${item.size} không hợp lệ` });

            const buyQty = parseInt(item.quantity);
            // Kiểm tra xem có đủ hàng không
            if (product.variants[variantIndex].stock < buyQty) {
                return res.status(400).json({ message: `Sản phẩm ${product.name} (${item.size}) đã hết hoặc không đủ số lượng!` });
            }

            // ⚠️ QUAN TRỌNG: Đã xóa đoạn code trừ kho ở đây (product.save)

            serverProductTotal += product.price * buyQty;
            orderItems.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                quantity: buyQty,
                size: item.size,
                image: product.image[0]
            });
        }

        const fee = parseInt(shippingFee);
        const finalTotal = serverProductTotal + fee;
        const numericOrderCode = Number(Date.now().toString().slice(-9));

        // --- TẠO ĐƠN HÀNG (Trạng thái Unpaid) ---
        const newOrder = new Order({
            userId,
            orderCode: numericOrderCode,
            userInfo: shippingInfo,
            items: orderItems,
            shippingMethod,
            shippingFee: fee,
            productTotal: serverProductTotal,
            totalPrice: finalTotal,
            paymentMethod: 'PAYOS',
            status: 'NoStatus',
            paymentStatus: 'Unpaid',
        });
        await newOrder.save();
        try {
            // Lấy instance socket từ app (phải khớp với cách bạn set trong server.js)
            const io = req.app.get('io');

            if (io) {
                io.emit('new-order', {
                    message: `🔔 Đơn hàng mới #${numericOrderCode}`,
                    orderCode: numericOrderCode,
                    total: finalTotal,
                    customer: shippingInfo.fullName || "Khách lẻ"
                });
                console.log("📡 Đã bắn socket new-order tới Admin");
            } else {
                console.log("⚠️ Không tìm thấy Socket IO instance");
            }
        } catch (socketErr) {
            console.error("Lỗi gửi socket:", socketErr);
            // Không return lỗi ở đây để khách vẫn nhận được link thanh toán
        }

        // ⚠️ QUAN TRỌNG: Đã xóa đoạn code xóa Giỏ Hàng ở đây
        // Giỏ hàng vẫn giữ nguyên để nếu khách hủy thì quay lại vẫn còn

        // --- TẠO LINK PAYOS ---
        const paymentData = {
            orderCode: numericOrderCode,
            amount: finalTotal,
            description: `Thanh toan don ${numericOrderCode}`,
            cancelUrl: `https://pei-untestamentary-nonavoidably.ngrok-free.dev/order`, // Quay về giỏ hàng
            returnUrl: `https://pei-untestamentary-nonavoidably.ngrok-free.dev/order`,
        };

        const paymentLinkRes = await payos.createPaymentLink(paymentData);

        return res.json({
            success: true,
            type: 'PAYOS',
            checkoutUrl: paymentLinkRes.checkoutUrl
        });

    } catch (err) {
        console.error("Lỗi đặt hàng:", err);
        res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
    }
};

// --- 3. WEBHOOK (SỬA ĐỔI: TRỪ KHO VÀ XÓA GIỎ KHI THÀNH CÔNG) ---
exports.payosWebhook = async (req, res) => {
    console.log("🔔 [PAYOS WEBHOOK] Nhận tín hiệu...");
    const { code, success, data } = req.body;

    if (code === "00" && success === true) {
        try {
            const orderCode = data.orderCode;
            const amountPaid = data.amount;

            const order = await Order.findOne({ orderCode: orderCode });
            if (!order) return res.status(404).json({ error: "Order not found" });

            // Kiểm tra: Chỉ xử lý nếu đơn hàng chưa thanh toán (Tránh trừ kho 2 lần)
            if (amountPaid >= order.totalPrice && order.paymentStatus !== 'Paid') {

                // 1. CẬP NHẬT TRẠNG THÁI
                order.paymentStatus = 'Paid';
                order.status = 'pending';
                order.payment_info = {
                    method: 'PAYOS',
                    status: 'Paid',
                    amount: amountPaid,
                    date: new Date()
                };
                await order.save();
                console.log(`✅ Đơn hàng ${orderCode} đã thanh toán! Bắt đầu trừ kho & xóa cart...`);

                // 2. TRỪ TỒN KHO THẬT SỰ (QUAN TRỌNG)
                for (const item of order.items) {
                    const product = await Product.findById(item.productId);
                    if (product) {
                        const variantIndex = product.variants.findIndex(v => v.size === item.size);
                        if (variantIndex !== -1) {
                            product.variants[variantIndex].stock -= item.quantity;
                            await product.save();
                        }
                    }
                }

                // 3. XÓA SẢN PHẨM KHỎI GIỎ HÀNG CỦA USER
                // Chúng ta cần UserId để tìm giỏ hàng
                const cart = await Cart.findOne({ userId: order.userId });
                if (cart) {
                    const purchasedItems = order.items.map(i => ({ id: i.productId.toString(), size: i.size }));

                    // Lọc bỏ những món đã mua trong đơn hàng này
                    cart.items = cart.items.filter(cartItem =>
                        !purchasedItems.some(p => p.id === cartItem.productId.toString() && p.size === cartItem.size)
                    );

                    await cart.save();
                    console.log(`🛒 Đã làm sạch giỏ hàng cho User ${order.userId}`);
                }

                // 4. BẮN SOCKET
                if (req.io) {
                    req.io.emit('payment-success', { orderCode: orderCode });
                }

            } else {
                console.log(`⚠️ Đơn ${orderCode} đã xử lý hoặc thiếu tiền.`);
            }
            return res.status(200).json({ success: true });

        } catch (error) {
            console.error("❌ Lỗi Webhook:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    } else {
        console.log("❌ Thanh toán thất bại/hủy.");
        return res.status(200).json({ success: false });
    }
};
// --- 5. HÀM THANH TOÁN LẠI (CÓ CHECK KHO) ---
// --- 5. HÀM THANH TOÁN LẠI (FIX LỖI TRÙNG MÃ) ---
exports.repayOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });

        const { orderCode } = req.body;

        // 1. Tìm đơn hàng cũ
        const order = await Order.findOne({
            orderCode: orderCode,
            userId: req.session.user.id
        });

        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng!" });
        if (order.paymentStatus === 'Paid') return res.status(400).json({ message: "Đơn này đã trả tiền rồi!" });

        // 2. CHECK TỒN KHO (Giữ nguyên logic an toàn)
        for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (!product) return res.status(400).json({ message: `Sản phẩm "${item.name}" đã ngừng bán.` });

            const variant = product.variants.find(v => v.size === item.size);
            if (!variant || variant.stock < item.quantity) {
                return res.status(400).json({
                    message: `Rất tiếc, "${item.name}" (Size: ${item.size}) hiện tại đã hết hàng!`
                });
            }
        }

        // 🔥 3. TẠO MÃ ĐƠN HÀNG MỚI (QUAN TRỌNG) 🔥
        // Để tránh lỗi "Order already exists" của PayOS
        const newOrderCode = Number(Date.now().toString().slice(-9));

        // Cập nhật mã mới vào Database ngay lập tức
        order.orderCode = newOrderCode;
        await order.save();
        try {
            // Lấy instance socket từ app (phải khớp với cách bạn set trong server.js)
            const io = req.app.get('io');

            if (io) {
                io.emit('new-order', {
                    message: `🔔 Đơn hàng mới #${numericOrderCode}`,
                    orderCode: numericOrderCode,
                    total: finalTotal,
                    customer: shippingInfo.fullName || "Khách lẻ"
                });
                console.log("📡 Đã bắn socket new-order tới Admin");
            } else {
                console.log("⚠️ Không tìm thấy Socket IO instance");
            }
        } catch (socketErr) {
            console.error("Lỗi gửi socket:", socketErr);
            // Không return lỗi ở đây để khách vẫn nhận được link thanh toán
        }
        console.log(`♻️ Đã đổi mã đơn cũ ${orderCode} thành mã mới ${newOrderCode}`);

        // 4. Tạo Link PayOS với mã mới
        const payos = new PayOS(
            process.env.PAYOS_CLIENT_ID,
            process.env.PAYOS_API_KEY,
            process.env.PAYOS_CHECKSUM_KEY
        );

        const paymentData = {
            orderCode: newOrderCode, // Dùng mã mới
            amount: Number(order.totalPrice),
            description: `Thanh toan lai ${newOrderCode}`, // Nội dung ngắn gọn < 25 ký tự
            cancelUrl: `https://pei-untestamentary-nonavoidably.ngrok-free.dev/order`,
            returnUrl: `https://pei-untestamentary-nonavoidably.ngrok-free.dev/order`,
        };

        const paymentLinkRes = await payos.createPaymentLink(paymentData);

        return res.json({
            success: true,
            checkoutUrl: paymentLinkRes.checkoutUrl
        });

    } catch (err) {
        console.error("Lỗi Repay:", err);
        res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
    }
};// --- GIỮ NGUYÊN ---
exports.getUserOrders = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const orders = await Order.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
        res.render('user/order', {
            user: req.session.user,
            orders,
            cartCount: req.session.cartCount || 0
        });
    } catch (err) { res.status(500).send("Lỗi server"); }
};