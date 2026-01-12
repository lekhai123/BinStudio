require('dotenv').config();
const Order = require('../Models/order');
const Cart = require('../Models/cart');
const Product = require('../Models/product');
const axios = require('axios');
const crypto = require('crypto');
const ghnService = require('../Service/ghnService');
const telegramService = require('../Service/telegramService');

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

// --- XỬ LÝ ĐẶT HÀNG ---
exports.placeOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });

        if (req.body.paymentMethod === 'PAYOS' && !process.env.PAYOS_CLIENT_ID)
            return res.status(500).json({ message: "Thiếu ENV PayOS" });

        const userId = req.session.user.id;
        const { items, shippingInfo, shippingMethod, shippingFee, paymentMethod } = req.body;

        let serverProductTotal = 0;
        const orderItems = [];

        // --- CHECK KHO & LẤY THÔNG TIN SẢN PHẨM ---
        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) return res.status(400).json({ message: "Sản phẩm không tồn tại" });

            const variantIndex = product.variants.findIndex(v => v.size === item.size);
            if (variantIndex === -1) return res.status(400).json({ message: `Size ${item.size} không hợp lệ` });

            const buyQty = parseInt(item.quantity);
            if (product.variants[variantIndex].stock < buyQty) {
                return res.status(400).json({ message: `Sản phẩm ${product.name} (${item.size}) đã hết hoặc không đủ số lượng!` });
            }

            serverProductTotal += product.price * buyQty;
            orderItems.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                quantity: buyQty,
                size: item.size,
                image: product.image[0],
                category: product.category || 'Khac'
            });
        }

        const fee = parseInt(shippingFee);
        const finalTotal = serverProductTotal + fee;
        const numericOrderCode = Number(Date.now().toString().slice(-9));

        // --- TẠO ĐƠN HÀNG DATABASE ---
        const newOrder = new Order({
            userId,
            orderCode: numericOrderCode,
            userInfo: {
                fullName: shippingInfo.fullName,
                phone: shippingInfo.phone,
                address: shippingInfo.address,
                provinceId: parseInt(shippingInfo.provinceId),
                districtId: parseInt(shippingInfo.districtId),
                wardCode: String(shippingInfo.wardCode)
            },
            items: orderItems,
            shippingMethod,
            shippingFee: fee,
            productTotal: serverProductTotal,
            totalPrice: finalTotal,
            paymentMethod: paymentMethod,
            status: 'Pending', // Mặc định là Pending (Chờ xử lý)
            paymentStatus: 'Unpaid',
            ghn_order_code: null
        });
        await newOrder.save();

        // 🔵 THANH TOÁN PAYOS
        if (paymentMethod === 'PAYOS') {
            const payos = new PayOS(process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, process.env.PAYOS_CHECKSUM_KEY);
            const paymentData = {
                orderCode: numericOrderCode,
                amount: finalTotal,
                description: `Thanh toan don ${numericOrderCode}`,
                cancelUrl: `https://binstudio.id.vn/order`,
                returnUrl: `https://binstudio.id.vn/order`,
            };
            const paymentLinkRes = await payos.createPaymentLink(paymentData);
            return res.json({ success: true, type: 'PAYOS', checkoutUrl: paymentLinkRes.checkoutUrl });
        } else {
            // COD: Trừ kho ngay, xóa giỏ ngay, Bắn telegram ngay
            await handleStockAndCart(newOrder);
            telegramService.sendOrderNotify(newOrder); // Gửi Telegram để Admin Xác nhận
            return res.json({ success: true, type: 'COD', orderCode: numericOrderCode });
        }

    } catch (err) {
        console.error("Lỗi đặt hàng:", err);
        res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
    }
};

// --- WEBHOOK (ĐÃ SỬA: KHÔNG TẠO GHN, GIỮ STATUS PENDING) ---
// --- 1. SỬA WEBHOOK: Lưu số tiền còn thiếu ---
exports.payosWebhook = async (req, res) => {
    // 1. Lấy dữ liệu từ PayOS gửi sang
    const { code, success, data, signature } = req.body;

    // Sử dụng console.error để log vẫn hiện trên Render khi đã tắt console.log
    console.error(`🔔 [WEBHOOK] Nhận tín hiệu đơn hàng: ${data?.orderCode}`);

    try {
        // 2. Kiểm tra chữ ký (Signature Verification) để đảm bảo an toàn
        // Sắp xếp các trường trong data theo alphabet để tạo chuỗi kiểm tra
        const sortedDataStr = Object.keys(data)
            .sort()
            .map(key => `${key}=${data[key]}`)
            .join('&');

        const mySignature = crypto
            .createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY)
            .update(sortedDataStr)
            .digest('hex');

        if (mySignature !== signature) {
            console.error("❌ Chữ ký không khớp! Yêu cầu bị từ chối.");
            return res.status(403).json({ error: "Invalid signature" });
        }

        // 3. Nếu thanh toán thành công (code "00")
        if (code === "00" && success === true) {
            const orderCode = data.orderCode;
            const amountPaid = Number(data.amount);

            // Tìm đơn hàng trong Database
            const order = await Order.findOne({ orderCode: orderCode });
            if (!order) {
                console.error(`❌ Không tìm thấy đơn hàng #${orderCode}`);
                return res.status(404).json({ error: "Order not found" });
            }

            // Nếu đơn đã thanh toán trước đó (tránh xử lý trùng lặp)
            if (order.paymentStatus === 'Paid') {
                return res.status(200).json({ success: true });
            }

            const totalOrder = Number(order.totalPrice);

            // --- TRƯỜNG HỢP A: THANH TOÁN THIẾU ---
            if (amountPaid < totalOrder) {
                const missing = totalOrder - amountPaid;
                order.paymentStatus = 'Partially_Paid';
                order.payment_info = {
                    method: 'PAYOS',
                    status: 'Partially_Paid',
                    paidAmount: amountPaid,
                    remainingAmount: missing,
                    date: new Date(),
                    note: `Khách trả thiếu ${missing.toLocaleString()}đ`
                };
                await order.save();

                // Gửi thông báo cảnh báo cho Admin
                if (req.io) req.io.to('admin').emit('payment-warning', { orderCode, missing });
                console.error(`⚠️ Đơn #${orderCode} trả thiếu tiền.`);
            }

            // --- TRƯỜNG HỢP B: THANH TOÁN ĐỦ HOẶC DƯ ---
            else {
                const extra = amountPaid - totalOrder;
                order.paymentStatus = 'Paid';
                order.payment_info = {
                    method: 'PAYOS',
                    status: 'Paid',
                    amount: amountPaid,
                    date: new Date(),
                    note: extra > 0 ? `Dư ${extra.toLocaleString()}đ` : 'Đã trả đủ'
                };
                order.status = 'Pending'; // Chờ admin xác nhận đóng hàng

                // Lưu thay đổi đơn hàng
                await order.save();

                // 4. Các thao tác hậu cần (Trừ kho, Xóa giỏ, Thông báo)
                // Dùng Promise.all để các tác vụ chạy song song cho nhanh
                await Promise.all([
                    handleStockAndCart(order), // Hàm trừ kho bạn đã viết
                    telegramService.sendOrderNotify(order) // Thông báo Telegram
                ]);

                // Bắn socket báo thành công realtime cho trình duyệt của khách/admin
                if (req.io) req.io.emit('payment-success', { orderCode });
                console.error(`✅ Đơn #${orderCode} đã thanh toán thành công.`);
            }
        }

        // Luôn trả về 200 cho PayOS để họ không gửi lại Webhook nữa
        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("❌ Lỗi xử lý Webhook:", err.message);
        // Vẫn trả về 200 hoặc 500 tùy chiến lược, thường 200 để tránh PayOS spam lại khi lỗi code
        return res.status(200).json({ error: "Internal Error nhưng đã nhận tin" });
    }
};
// --- 2. SỬA REPAY: Tạo link thanh toán cho số tiền CÒN THIẾU ---

// --- HÀM PHỤ: XỬ LÝ KHO & GIỎ HÀNG (Dùng chung cho COD và PayOS) ---
async function handleStockAndCart(order) {
    // 1. Trừ tồn kho
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
    // 2. Xóa giỏ hàng
    const cart = await Cart.findOne({ userId: order.userId });
    if (cart) {
        const purchasedItems = order.items.map(i => ({ id: i.productId.toString(), size: i.size }));
        cart.items = cart.items.filter(cartItem =>
            !purchasedItems.some(p => p.id === cartItem.productId.toString() && p.size === cartItem.size)
        );
        await cart.save();
    }
}

exports.repayOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });
        const { orderCode } = req.body;

        const order = await Order.findOne({ orderCode: orderCode, userId: req.session.user.id });
        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn!" });

        // Nếu đã Paid thì chặn
        if (order.paymentStatus === 'Paid') return res.status(400).json({ message: "Đơn này đã xong!" });

        // --- XÁC ĐỊNH SỐ TIỀN CẦN TRẢ ---
        let amountToPay = Number(order.totalPrice);
        let description = `Thanh toan lai ${order.orderCode}`;

        // Nếu đang nợ tiền (Partially_Paid) -> Chỉ trả số còn thiếu
        if (order.paymentStatus === 'Partially_Paid' && order.payment_info && order.payment_info.remainingAmount) {
            amountToPay = Number(order.payment_info.remainingAmount);
            description = `Tra not ${order.orderCode}`;
        }

        // Tạo mã đơn mới để PayOS không báo trùng
        const newOrderCode = Number(Date.now().toString().slice(-9));
        order.orderCode = newOrderCode;

        // Cập nhật lại orderCode nhưng GIỮ NGUYÊN paymentStatus cũ
        // để Webhook lần sau biết đường trừ tiếp
        await order.save();

        const payos = new PayOS(process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, process.env.PAYOS_CHECKSUM_KEY);
        const paymentData = {
            orderCode: newOrderCode,
            amount: amountToPay, // Số tiền (Toàn bộ hoặc Phần thiếu)
            description: description.substring(0, 25), // Cắt ngắn cho đỡ lỗi
            cancelUrl: `https://binstudio.id.vn/order`,
            returnUrl: `https://binstudio.id.vn/order`,
        };

        const paymentLinkRes = await payos.createPaymentLink(paymentData);
        return res.json({ success: true, checkoutUrl: paymentLinkRes.checkoutUrl });

    } catch (err) {
        console.error("Lỗi Repay:", err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};


// --- CÁC HÀM KHÁC (GET, TRACK) GIỮ NGUYÊN ---
exports.getUserOrders = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const orders = await Order.find({ userId: req.session.user.id }).sort({ createdAt: -1 }).lean();
        res.render('user/order', { user: req.session.user, orders, cartCount: req.session.cartCount || 0 });
    } catch (err) { res.status(500).send("Lỗi server"); }
};

exports.trackOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        if (!order) return res.render('404', { message: "Không tìm thấy đơn hàng" });

        let trackingLogs = [];
        let ghnStatus = "";

        // TRƯỜNG HỢP 1: ĐƠN GHN (Giữ nguyên logic cũ)
        if (order.ghn_order_code) {
            try {
                const ghnData = await ghnService.getOrderDetail(order.ghn_order_code);
                if (ghnData && ghnData.data) {
                    trackingLogs = ghnData.data.logs || [];
                    ghnStatus = ghnData.data.status;

                    // Logic Sync Status (Giữ nguyên)
                    let mapStatus = null;
                    if (ghnStatus === 'cancel' && order.status !== 'Cancelled') mapStatus = 'Cancelled';
                    else if ((ghnStatus === 'delivered' || ghnStatus === 'finish') && order.status !== 'Completed') {
                        mapStatus = 'Completed';
                        // ... (Logic COD giữ nguyên)
                    }
                    else if (['picked', 'storing', 'transporting', 'sorting', 'delivering'].includes(ghnStatus) && (order.status === 'Processing' || order.status === 'Confirmed')) {
                        mapStatus = 'Shipping';
                    }
                    else if (ghnStatus === 'return' && order.status !== 'Returned') mapStatus = 'Returned';

                    if (mapStatus) {
                        order.status = mapStatus;
                        await order.save();
                    }
                }
            } catch (e) { console.error("Lỗi GHN Track:", e.message); }
        }

        // TRƯỜNG HỢP 2: ĐƠN LOCAL (TỰ TẠO LOGS)
        else {
            // Log 1: Đặt hàng thành công (Luôn có)
            trackingLogs.push({
                status: 'placed',
                status_name: 'Đặt hàng thành công',
                action_at: order.createdAt,
                location: { address: 'Hệ thống' }
            });

            // Log 2: Đã xác nhận (Nếu status khác Pending)
            if (order.status !== 'Pending' && order.status !== 'Cancelled') {
                trackingLogs.push({
                    status: 'confirmed',
                    status_name: 'Đã xác nhận đơn hàng',
                    action_at: order.updatedAt, // Tạm dùng updatedAt
                    location: { address: 'Shop' }
                });
            }

            // Log 3: Đang giao hàng (Nếu status = Shipping hoặc Completed/Returned)
            if (['Shipping', 'Completed', 'Returned'].includes(order.status)) {
                trackingLogs.push({
                    status: 'picking',
                    status_name: 'Shipper đã lấy hàng đi giao',
                    action_at: order.updatedAt,
                    location: { address: 'Kho vận' }
                });
            }

            // Log 4: Hoàn thành hoặc Trả hàng
            if (order.status === 'Completed') {
                trackingLogs.push({
                    status: 'delivered',
                    status_name: 'Giao hàng thành công',
                    action_at: order.updatedAt,
                    location: { address: order.userInfo.address }
                });
            } else if (order.status === 'Returned') {
                trackingLogs.push({
                    status: 'return',
                    status_name: 'Khách trả hàng / Giao thất bại',
                    action_at: order.updatedAt,
                    location: { address: 'Shop' }
                });
            } else if (order.status === 'Cancelled') {
                trackingLogs.push({
                    status: 'cancel',
                    status_name: 'Đơn hàng đã bị hủy',
                    action_at: order.updatedAt,
                    location: { address: 'Hệ thống' }
                });
            }

            // Đảo ngược để log mới nhất lên đầu (giống GHN)
            trackingLogs.reverse();
        }

        res.render('user/order-tracking', {
            order: order,
            trackingLogs: trackingLogs, // Đã xử lý reverse ở trên
            ghnStatus: ghnStatus,
            user: req.session.user || null,
            cartCount: req.session.cartCount || 0
        });
    } catch (err) { res.status(500).send("Lỗi Tracking"); }
};