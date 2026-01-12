require('dotenv').config();
const Order = require('../Models/order');
const Cart = require('../Models/cart');
const Product = require('../Models/product');
const axios = require('axios');
const crypto = require('crypto');
const ghnService = require('../Service/ghnService');
const telegramService = require('../Service/telegramService');

// ==========================================
// 🛠️ 1. CLASS PAYOS THỦ CÔNG (CHUẨN HÓA)
// ==========================================
class PayOS {
    constructor(clientId, apiKey, checksumKey) {
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
    }

    // ✅ FIX 1: Đưa hàm này vào TRONG class
    createSignature(data) {
        const sortedKeys = Object.keys(data).sort(); // 1. Sắp xếp A-Z
        const dataStr = sortedKeys
            .map(key => {
                const val = data[key];
                // 2. LỌC KỸ: Bỏ null, undefined. 
                // QUAN TRỌNG: PayOS vẫn tính chuỗi rỗng "" và số 0
                if (val === null || val === undefined) return null;
                return `${key}=${val}`;
            })
            .filter(item => item !== null) // Loại bỏ null
            .join('&'); // Nối bằng &

        return crypto
            .createHmac('sha256', this.checksumKey)
            .update(dataStr)
            .digest('hex');
    }

    async createPaymentLink(data) {
        const signData = {
            amount: data.amount,
            cancelUrl: data.cancelUrl,
            description: data.description,
            orderCode: data.orderCode,
            returnUrl: data.returnUrl
        };
        // Gọi hàm nội bộ bằng từ khóa 'this'
        const signature = this.createSignature(signData);

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

    // ✅ FIX 2: Hàm check Webhook nằm trong class luôn
    verifyWebhookData(webhookBody) {
        const { data, signature } = webhookBody;
        if (!data || !signature) return false;

        // Tính lại chữ ký từ data nhận được
        const mySignature = this.createSignature(data);

        // So sánh
        if (mySignature !== signature) {
            console.log(`❌ LỆCH:`);
            console.log(`- Của mình: ${mySignature}`);
            console.log(`- Của PayOS: ${signature}`);
            return false;
        }
        return true;
    }
}

// Khởi tạo đối tượng PayOS dùng chung
const payosInstance = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
);

const CONFIG = {
    GHN: {
        'token': process.env.GHN_TOKEN,
        'ShopId': parseInt(process.env.GHN_SHOP_ID),
        'baseUrl': 'https://online-gateway.ghn.vn/shiip/public-api'
    }
};
function createSignature(data, checksumKey) {
    const sortedKeys = Object.keys(data).sort(); // 1. Sắp xếp A-Z
    const dataStr = sortedKeys
        .map(key => {
            const val = data[key];
            // 2. LỌC KỸ: Chỉ lấy giá trị không null, không undefined, không rỗng
            if (val === null || val === undefined || val === "") return null;
            return `${key}=${val}`;
        })
        .filter(item => item !== null) // Loại bỏ các trường null vừa lọc
        .join('&'); // Nối bằng &

    // 3. Log ra để xem chuỗi trước khi băm (Quan trọng để debug)
    console.log("📝 Chuỗi cần ký (My String):", dataStr);

    return crypto
        .createHmac('sha256', checksumKey)
        .update(dataStr)
        .digest('hex');
}
// ==========================================
// 📦 2. CÁC HÀM XỬ LÝ (LOGIC CHÍNH)
// ==========================================

// --- TÍNH SHIP (GIỮ NGUYÊN) ---
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

// --- ĐẶT HÀNG (PLACE ORDER) ---
exports.placeOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });

        if (req.body.paymentMethod === 'PAYOS' && !process.env.PAYOS_CLIENT_ID)
            return res.status(500).json({ message: "Thiếu ENV PayOS" });

        const userId = req.session.user.id;
        const { items, shippingInfo, shippingMethod, shippingFee, paymentMethod } = req.body;

        let serverProductTotal = 0;
        const orderItems = [];

        // Check kho & lấy giá server
        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) return res.status(400).json({ message: "Sản phẩm không tồn tại" });

            const variantIndex = product.variants.findIndex(v => v.size === item.size);
            if (variantIndex === -1) return res.status(400).json({ message: `Size ${item.size} không hợp lệ` });

            const buyQty = parseInt(item.quantity);
            if (product.variants[variantIndex].stock < buyQty) {
                return res.status(400).json({ message: `Sản phẩm ${product.name} (${item.size}) đã hết hoặc không đủ!` });
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
        const numericOrderCode = Number(Date.now().toString().slice(-9)); // Mã đơn 9 số

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
            status: 'Pending',
            paymentStatus: 'Unpaid',
            ghn_order_code: null
        });
        await newOrder.save();

        if (paymentMethod === 'PAYOS') {
            const paymentData = {
                orderCode: numericOrderCode,
                amount: finalTotal,
                description: `Thanh toan don ${numericOrderCode}`,
                cancelUrl: `https://binstudio.id.vn/order`, // Link khi khách hủy
                returnUrl: `https://binstudio.id.vn/order`, // Link khi khách trả xong
            };
            // Gọi hàm của Class PayOS thủ công
            const paymentLinkRes = await payosInstance.createPaymentLink(paymentData);
            return res.json({ success: true, type: 'PAYOS', checkoutUrl: paymentLinkRes.checkoutUrl });
        } else {
            // COD
            await handleStockAndCart(newOrder);
            telegramService.sendOrderNotify(newOrder);
            return res.json({ success: true, type: 'COD', orderCode: numericOrderCode });
        }

    } catch (err) {
        console.error("Lỗi đặt hàng:", err);
        res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
    }
};

// --- WEBHOOK (QUAN TRỌNG NHẤT - ĐÃ SỬA THỦ CÔNG) ---
exports.payosWebhook = async (req, res) => {
    const { code, success, data, signature } = req.body;
    console.log(`🔔 [WEBHOOK] Nhận tín hiệu đơn hàng: ${data?.orderCode}`);

    try {
        // ✅ FIX 3: Dùng hàm của class để verify (An toàn nhất)
        const isValid = payosInstance.verifyWebhookData(req.body);

        if (!isValid) {
            console.error("❌ CHỮ KÝ KHÔNG KHỚP!");
            return res.status(403).json({ error: "Invalid signature" });
        } else {
            console.log("✅ Chữ ký hợp lệ!");
        }

        // 2. Logic xử lý đơn hàng (như cũ)
        if (code === "00" && success === true) {
            const orderCode = data.orderCode;
            const amountPaid = Number(data.amount);

            const order = await Order.findOne({ orderCode: orderCode });
            if (!order) {
                console.error(`❌ Không tìm thấy đơn hàng #${orderCode}`);
                return res.json({ success: true });
            }

            if (order.paymentStatus === 'Paid') return res.json({ success: true });

            const totalOrder = Number(order.totalPrice);

            // Xử lý thiếu/đủ tiền
            if (amountPaid < totalOrder) {
                const missing = totalOrder - amountPaid;
                order.paymentStatus = 'Partially_Paid';
                order.payment_info = {
                    method: 'PAYOS', status: 'Partially_Paid',
                    paidAmount: amountPaid, remainingAmount: missing,
                    date: new Date(), note: `Khách trả thiếu ${missing.toLocaleString()}đ`
                };
                await order.save();
                if (req.io) req.io.to('admin').emit('payment-warning', { orderCode, missing });
            } else {
                order.paymentStatus = 'Paid';
                order.payment_info = {
                    method: 'PAYOS', status: 'Paid',
                    amount: amountPaid, date: new Date(),
                    note: 'Đã trả đủ'
                };
                order.status = 'Pending';
                await order.save();

                // Hậu cần
                await Promise.all([
                    handleStockAndCart(order),
                    telegramService.sendOrderNotify(order)
                ]);

                if (req.io) req.io.emit('payment-success', { orderCode });
                console.log(`✅ Đơn #${orderCode} đã thanh toán thành công.`);
            }
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("❌ Lỗi Webhook:", err.message);
        return res.status(200).json({ success: true });
    }
};
// --- TRẢ LẠI TIỀN / TRẢ NỐT (REPAY) ---
exports.repayOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });
        const { orderCode } = req.body;

        const order = await Order.findOne({ orderCode: orderCode, userId: req.session.user.id });
        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn!" });
        if (order.paymentStatus === 'Paid') return res.status(400).json({ message: "Đơn này đã xong!" });

        let amountToPay = Number(order.totalPrice);
        let description = `Thanh toan lai ${order.orderCode}`;

        if (order.paymentStatus === 'Partially_Paid' && order.payment_info?.remainingAmount) {
            amountToPay = Number(order.payment_info.remainingAmount);
            description = `Tra not ${order.orderCode}`;
        }

        // Tạo mã mới để không bị lỗi trùng lặp trên PayOS
        const newOrderCode = Number(Date.now().toString().slice(-9));
        order.orderCode = newOrderCode; // Cập nhật mã mới vào DB
        await order.save();

        const paymentData = {
            orderCode: newOrderCode,
            amount: amountToPay,
            description: description.substring(0, 25),
            cancelUrl: `https://binstudio.id.vn/order`,
            returnUrl: `https://binstudio.id.vn/order`,
        };

        const paymentLinkRes = await payosInstance.createPaymentLink(paymentData);
        return res.json({ success: true, checkoutUrl: paymentLinkRes.checkoutUrl });

    } catch (err) {
        console.error("Lỗi Repay:", err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

// --- HÀM PHỤ TRỢ (HELPER) ---
async function handleStockAndCart(order) {
    // Trừ kho
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
    // Xóa giỏ
    const cart = await Cart.findOne({ userId: order.userId });
    if (cart) {
        const purchasedItems = order.items.map(i => ({ id: i.productId.toString(), size: i.size }));
        cart.items = cart.items.filter(item =>
            !purchasedItems.some(p => p.id === item.productId.toString() && p.size === item.size)
        );
        await cart.save();
    }
}

// --- CÁC HÀM GET KHÁC GIỮ NGUYÊN NHƯ CŨ ---
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