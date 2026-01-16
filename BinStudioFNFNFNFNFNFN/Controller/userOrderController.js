require('dotenv').config();
const Order = require('../Models/order');
const Cart = require('../Models/cart');
const Product = require('../Models/product');
const axios = require('axios');
const crypto = require('crypto');
const ghnService = require('../Service/ghnService');
const telegramService = require('../Service/telegramService');

// ==========================================
// 🛠️ 1. CLASS PAYOS (CHUẨN HÓA THEO SAMPLE CODE)
// ==========================================
class PayOS {
    constructor(clientId, apiKey, checksumKey) {
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
    }

    // 1. Hàm sắp xếp object theo key (Giống sample: sortObjDataByKey)
    sortObjDataByKey(object) {
        const orderedObject = Object.keys(object)
            .sort()
            .reduce((obj, key) => {
                obj[key] = object[key];
                return obj;
            }, {});
        return orderedObject;
    }

    // 2. Hàm chuyển object thành query string (Giống sample: convertObjToQueryStr)
    convertObjToQueryStr(object) {
        return Object.keys(object)
            .filter((key) => object[key] !== undefined) // Chỉ lọc undefined gốc
            .map((key) => {
                let value = object[key];

                // Nếu là mảng (Array) thì sort và stringify (Logic của PayOS)
                if (value && Array.isArray(value)) {
                    value = JSON.stringify(value.map((val) => this.sortObjDataByKey(val)));
                }

                // Chuyển null, undefined, "null" thành chuỗi rỗng ""
                // QUAN TRỌNG: Key vẫn được giữ lại chứ không bị xóa
                if ([null, undefined, 'undefined', 'null'].includes(value)) {
                    value = '';
                }

                return `${key}=${value}`;
            })
            .join('&');
    }

    // 3. Hàm tạo chữ ký HMAC_SHA256
    createSignature(data) {
        const sortedData = this.sortObjDataByKey(data);
        const dataQueryStr = this.convertObjToQueryStr(sortedData);

        // Debug: In ra để kiểm tra
        // console.log("📝 Data String to Hash:", dataQueryStr);

        return crypto
            .createHmac('sha256', this.checksumKey)
            .update(dataQueryStr)
            .digest('hex');
    }

    // 4. Tạo Payment Link
    async createPaymentLink(data) {
        // Chỉ lấy các trường cần thiết để ký
        const signData = {
            amount: data.amount,
            cancelUrl: data.cancelUrl,
            description: data.description,
            orderCode: data.orderCode,
            returnUrl: data.returnUrl
        };

        // Tạo chữ ký
        const signature = this.createSignature(signData);

        console.log("🚀 Đang gọi API PayOS...");
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

    // 5. Xác thực Webhook
    verifyWebhookData(webhookBody) {
        const { data, signature } = webhookBody;
        if (!data || !signature) return false;

        // Tính lại chữ ký từ data nhận được
        const mySignature = this.createSignature(data);

        // So sánh
        if (mySignature !== signature) {
            console.log("❌ LỆCH CHỮ KÝ:");
            console.log("👉 Server tính: ", mySignature);
            console.log("👉 PayOS gửi:   ", signature);
            // console.log("👉 Data gốc:    ", JSON.stringify(data));
            return false;
        }
        return true;
    }
}

// Khởi tạo đối tượng PayOS
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

// ==========================================
// 📦 2. CÁC HÀM XỬ LÝ (LOGIC CHÍNH)
// ==========================================

// --- TÍNH SHIP (GIỮ NGUYÊN) ---
exports.calcShipping = async (req, res) => {
    try {
        const { districtId, wardCode, carrier, orderAmount, provinceId, items } = req.body;

        // Validation
        if (!districtId || !wardCode) return res.status(400).json({ success: false, message: "Thiếu thông tin địa chỉ" });

        // 1. Local Shipping Logic
        if (carrier === 'LOCAL') {
            const pId = parseInt(provinceId);
            if (pId !== 202) return res.status(400).json({ success: false, message: "Chỉ ship nội thành TP.HCM" });
            const total = parseInt(orderAmount) || 0;
            const fee = total >= 2000000 ? 0 : 30000;
            return res.json({ success: true, fee: fee });
        }

        // 2. GHN Shipping Logic
        try {
            // Calculate Total Weight & Dimensions from DB Products
            // (We fetch products again to ensure security and accuracy)
            let totalWeight = 0;
            let maxLength = 0;
            let maxWidth = 0;
            let totalHeight = 0;

            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const product = await Product.findById(item.productId);
                    if (product) {
                        const qty = parseInt(item.quantity) || 1;

                        // Use product properties (defaulting if not set)
                        const pWeight = product.weight || 500;
                        const pLength = product.length || 30;
                        const pWidth = product.width || 20;
                        const pHeight = product.height || 10;

                        totalWeight += (pWeight * qty);
                        totalHeight += (pHeight * qty); // Stack items vertically

                        // Find largest length/width for the box
                        if (pLength > maxLength) maxLength = pLength;
                        if (pWidth > maxWidth) maxWidth = pWidth;
                    }
                }
            }

            // Fallbacks if no items found or calc failed
            if (totalWeight === 0) totalWeight = 2000;
            if (maxLength === 0) maxLength = 30;
            if (maxWidth === 0) maxWidth = 20;
            if (totalHeight === 0) totalHeight = 10;

            // Call Service
            const dataForFee = {
                districtId: parseInt(districtId),
                wardCode: wardCode.toString(),
                height: totalHeight,
                length: maxLength,
                width: maxWidth,
                weight: totalWeight,
                orderAmount: parseInt(orderAmount) || 0
            };

            const ghnRes = await ghnService.calculateFee(dataForFee);

            if (ghnRes && ghnRes.code === 200) {
                return res.json({ success: true, fee: ghnRes.data.total });
            } else {
                return res.status(400).json({ success: false, message: ghnRes?.message || "Lỗi tính phí GHN" });
            }
        } catch (apiErr) {
            console.error(apiErr);
            return res.status(400).json({ success: false, message: "Lỗi kết nối GHN" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
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
        const numericOrderCode = Number(Date.now().toString().slice(-9));

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
                cancelUrl: `https://binstudio.id.vn/order`,
                returnUrl: `https://binstudio.id.vn/order`,
            };
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

// --- WEBHOOK (ĐÃ FIX: DÙNG LOGIC CHUẨN ĐỂ CHECK) ---
exports.payosWebhook = async (req, res) => {
    const { code, success, data, signature } = req.body;
    console.log(`🔔 [WEBHOOK] Nhận tín hiệu đơn hàng: ${data?.orderCode}`);

    try {
        // 1. Kiểm tra chữ ký
        const isValid = payosInstance.verifyWebhookData(req.body);

        if (!isValid) {
            console.error("❌ CẢNH BÁO: Chữ ký không khớp! Dừng xử lý.");
            // CHẶN HACKER Ở ĐÂY
            return res.status(403).json({ error: "Invalid signature" });
        }

        console.log("✅ Chữ ký hợp lệ!");

        // 2. Logic xử lý đơn hàng (như cũ)
        if (code === "00" && success === true) {
            const orderCode = data.orderCode;
            const amountPaid = Number(data.amount);

            const order = await Order.findOne({ orderCode: orderCode });
            if (!order) return res.json({ success: true });

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

                order.trackingLogs.push({
                    status: 'Pending',
                    action_at: new Date(), // Giờ hiện tại chính xác từng giây
                    note: 'Khách đã thanh toán qua PayOS'
                });
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

// --- REPAY ORDER (GIỮ NGUYÊN) ---
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

        const newOrderCode = Number(Date.now().toString().slice(-9));
        order.orderCode = newOrderCode;
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

// --- HELPER & GET (GIỮ NGUYÊN) ---
async function handleStockAndCart(order) {
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
    const cart = await Cart.findOne({ userId: order.userId });
    if (cart) {
        const purchasedItems = order.items.map(i => ({ id: i.productId.toString(), size: i.size }));
        cart.items = cart.items.filter(item =>
            !purchasedItems.some(p => p.id === item.productId.toString() && p.size === item.size)
        );
        await cart.save();
    }
}

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

        let allLogs = [];

        // --- BƯỚC 1: LẤY LOG NỘI BỘ (Từ database của bạn) ---
        const statusMap = {
            'Pending': { text: 'Đặt hàng thành công', icon: 'fa-shopping-bag' },
            'Paid': { text: 'Thanh toán thành công', icon: 'fa-credit-card' },
            'Confirmed': { text: 'Đã xác nhận đơn hàng', icon: 'fa-check-double' },
            'Processing': { text: 'Đang đóng gói', icon: 'fa-box-open' },
            'Shipping': { text: 'Bàn giao cho đơn vị vận chuyển', icon: 'fa-truck-loading' },
            'Completed': { text: 'Giao hàng thành công', icon: 'fa-flag-checkered' },
            'Cancelled': { text: 'Đã hủy đơn', icon: 'fa-times' },
            'Returned': { text: 'Đã trả hàng', icon: 'fa-undo' }
        };

        if (order.trackingLogs && order.trackingLogs.length > 0) {
            allLogs = order.trackingLogs.map(log => ({
                status_key: log.status,
                status_text: statusMap[log.status]?.text || log.status,
                time: new Date(log.action_at),
                desc: log.note || 'Hệ thống cập nhật',
                icon: statusMap[log.status]?.icon || 'fa-circle',
                source: 'local'
            }));
        } else {
            allLogs.push({
                status_text: 'Đặt hàng thành công',
                time: order.createdAt,
                desc: 'Hệ thống ghi nhận',
                icon: 'fa-shopping-bag',
                source: 'local'
            });
        }

        // --- BƯỚC 2: LẤY LOG GHN (Nếu có) ---
        if (order.ghn_order_code) {
            try {
                const ghnData = await ghnService.getOrderDetail(order.ghn_order_code);
                if (ghnData?.data?.logs) {
                    const ghnLogs = ghnData.data.logs.map(log => ({
                        status_key: log.status,
                        status_text: log.status_name,
                        time: new Date(log.action_at || log.updated_date),
                        desc: log.location?.address || 'Hệ thống GHN',
                        icon: 'fa-truck',
                        source: 'ghn'
                    }));

                    // Gom chung vào mảng
                    allLogs = [...allLogs, ...ghnLogs];
                }
            } catch (e) { console.error("Lỗi lấy log GHN:", e.message); }
        }

        // --- BƯỚC 3: XỬ LÝ GOM NHÓM & SẮP XẾP ---
        // 1. Sắp xếp theo thời gian mới nhất lên đầu
        allLogs.sort((a, b) => b.time - a.time);

        // 2. (Tùy chọn) Lọc trùng: Nếu trong cùng 1 phút có 2 log cùng trạng thái thì lấy cái mới nhất
        const seen = new Set();
        const filteredLogs = allLogs.filter(log => {
            const duplicateKey = `${log.status_key}-${log.time.getMinutes()}`;
            if (seen.has(duplicateKey)) return false;
            seen.add(duplicateKey);
            return true;
        });

        res.render('user/order-tracking', {
            order: order,
            logs: filteredLogs,
            user: req.session.user || null,
            cartCount: req.session.cartCount || 0
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi Tracking");
    }
};