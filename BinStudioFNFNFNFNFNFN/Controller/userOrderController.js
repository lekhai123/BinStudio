require('dotenv').config();
const Order = require('../Models/order');
const Cart = require('../Models/cart');
const Product = require('../Models/product');
const axios = require('axios');
const crypto = require('crypto');
const ghnService = require('../Service/ghnService');
const telegramService = require('../Service/telegramService');

// ==========================================
// 🛠️ 1. CLASS PAYOS
// ==========================================
class PayOS {
    constructor(clientId, apiKey, checksumKey) {
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
    }

    sortObjDataByKey(object) {
        const orderedObject = Object.keys(object)
            .sort()
            .reduce((obj, key) => {
                obj[key] = object[key];
                return obj;
            }, {});
        return orderedObject;
    }

    convertObjToQueryStr(object) {
        return Object.keys(object)
            .filter((key) => object[key] !== undefined)
            .map((key) => {
                let value = object[key];
                if (value && Array.isArray(value)) {
                    value = JSON.stringify(value.map((val) => this.sortObjDataByKey(val)));
                }
                if ([null, undefined, 'undefined', 'null'].includes(value)) {
                    value = '';
                }
                return `${key}=${value}`;
            })
            .join('&');
    }

    createSignature(data) {
        const sortedData = this.sortObjDataByKey(data);
        const dataQueryStr = this.convertObjToQueryStr(sortedData);
        return crypto.createHmac('sha256', this.checksumKey).update(dataQueryStr).digest('hex');
    }

    async createPaymentLink(data) {
        const signData = {
            amount: data.amount,
            cancelUrl: data.cancelUrl,
            description: data.description,
            orderCode: data.orderCode,
            returnUrl: data.returnUrl
        };
        const signature = this.createSignature(signData);
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

    verifyWebhookData(webhookBody) {
        const { data, signature } = webhookBody;
        if (!data || !signature) return false;
        const mySignature = this.createSignature(data);
        return mySignature === signature;
    }
}

const payosInstance = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
);

// ==========================================
// 📦 2. CÁC HÀM XỬ LÝ CHÍNH
// ==========================================

// --- TÍNH SHIP ---
exports.calcShipping = async (req, res) => {
    try {
        const { districtId, wardCode, carrier, orderAmount, provinceId, items } = req.body;
        if (!districtId || !wardCode) return res.status(400).json({ success: false, message: "Thiếu thông tin địa chỉ" });

        // Local
        if (carrier === 'LOCAL') {
            const pId = parseInt(provinceId);
            if (pId !== 202) return res.status(400).json({ success: false, message: "Chỉ ship nội thành TP.HCM" });
            const total = parseInt(orderAmount) || 0;
            const fee = total >= 2000000 ? 0 : 30000;
            return res.json({ success: true, fee: fee });
        }

        // GHN
        let totalWeight = 0;
        let maxLength = 0;
        let maxWidth = 0;
        let totalHeight = 0;

        if (items && Array.isArray(items)) {
            for (const item of items) {
                const product = await Product.findById(item.productId);
                if (product) {
                    const qty = parseInt(item.quantity) || 1;
                    const pWeight = product.weight || 500;
                    const pLength = product.length || 30;
                    const pWidth = product.width || 20;
                    const pHeight = product.height || 10;

                    totalWeight += (pWeight * qty);
                    totalHeight += (pHeight * qty);
                    if (pLength > maxLength) maxLength = pLength;
                    if (pWidth > maxWidth) maxWidth = pWidth;
                }
            }
        }

        if (totalWeight === 0) totalWeight = 2000;
        if (maxLength === 0) maxLength = 30;
        if (maxWidth === 0) maxWidth = 20;
        if (totalHeight === 0) totalHeight = 10;

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
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// --- ĐẶT HÀNG ---
exports.placeOrder = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });
        const userId = req.session.user.id;
        const { items, shippingInfo, shippingMethod, shippingFee, paymentMethod } = req.body;

        let serverProductTotal = 0;
        const orderItems = [];

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
            await handleStockAndCart(newOrder);
            telegramService.sendOrderNotify(newOrder);
            return res.json({ success: true, type: 'COD', orderCode: numericOrderCode });
        }
    } catch (err) {
        console.error("Lỗi đặt hàng:", err);
        res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
    }
};

// --- WEBHOOK ---
exports.payosWebhook = async (req, res) => {
    const { code, success, data } = req.body;
    try {
        const isValid = payosInstance.verifyWebhookData(req.body);
        if (!isValid) return res.status(403).json({ error: "Invalid signature" });

        if (code === "00" && success === true) {
            const orderCode = data.orderCode;
            const amountPaid = Number(data.amount);
            const order = await Order.findOne({ orderCode: orderCode });

            if (!order || order.paymentStatus === 'Paid') return res.json({ success: true });

            const totalOrder = Number(order.totalPrice);
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
                    action_at: new Date(),
                    note: 'Khách đã thanh toán qua PayOS'
                });
                await order.save();
                await Promise.all([handleStockAndCart(order), telegramService.sendOrderNotify(order)]);
                if (req.io) req.io.emit('payment-success', { orderCode });
            }
        }
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("Webhook Error:", err);
        return res.status(200).json({ success: true });
    }
};

// --- REPAY ---
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
        console.error(err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

// --- GET ORDERS ---
exports.getUserOrders = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const orders = await Order.find({ userId: req.session.user.id }).sort({ createdAt: -1 }).lean();
        res.render('user/order', { user: req.session.user, orders, cartCount: req.session.cartCount || 0 });
    } catch (err) { res.status(500).send("Lỗi server"); }
};

// --- TRACK ORDER (ĐÃ TỐI ƯU HÓA) ---
exports.trackOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        if (!order) return res.render('404', { message: "Không tìm thấy đơn hàng" });

        let displayLogs = [];

        // Chỉ lấy Logs nội bộ (Không gọi API GHN ở đây nữa)
        const statusMap = {
            'Pending': { text: 'Đặt hàng thành công', icon: 'fa-shopping-bag' },
            'Paid': { text: 'Thanh toán thành công', icon: 'fa-credit-card' },
            'Confirmed': { text: 'Đã xác nhận đơn hàng', icon: 'fa-check-double' },
            'Processing': { text: 'Đang đóng gói', icon: 'fa-box-open' },
            'Shipping': { text: 'Đã bàn giao vận chuyển', icon: 'fa-truck-loading' },
            'Completed': { text: 'Giao hàng thành công', icon: 'fa-flag-checkered' },
            'Cancelled': { text: 'Đã hủy đơn', icon: 'fa-times' },
            'Returned': { text: 'Đã trả hàng', icon: 'fa-undo' }
        };

        if (order.trackingLogs && order.trackingLogs.length > 0) {
            displayLogs = order.trackingLogs.map(log => ({
                status: log.status,
                status_text: statusMap[log.status]?.text || log.status,
                time: new Date(log.action_at),
                desc: log.note || 'Cập nhật từ hệ thống',
                icon: statusMap[log.status]?.icon || 'fa-circle'
            }));
        } else {
            // Fallback nếu đơn cũ chưa có logs
            displayLogs.push({
                status: 'Pending',
                status_text: 'Đặt hàng thành công',
                time: order.createdAt,
                desc: 'Hệ thống ghi nhận',
                icon: 'fa-shopping-bag'
            });
        }

        // Sắp xếp mới nhất lên đầu
        displayLogs.sort((a, b) => b.time - a.time);

        res.render('user/order-tracking', {
            order: order,
            logs: displayLogs, // Chỉ gửi log nội bộ
            user: req.session.user || null,
            cartCount: req.session.cartCount || 0
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi Tracking");
    }
};

// Helpers
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