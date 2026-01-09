require('dotenv').config();
const Order = require('../Models/order');
const Cart = require('../Models/cart');
const Product = require('../Models/product');
const axios = require('axios');
const crypto = require('crypto');
// --- ĐOẠN 1: KHAI BÁO THƯ VIỆN THÔNG MINH (AUTO-DETECT) ---
const payosLib = require("@payos/node");

// Hàm tự động tìm Class PayOS chuẩn trong đống hỗn độn exports
function findPayOSClass(lib) {
    const candidates = [
        lib,                // Trường hợp export trực tiếp
        lib.PayOS,          // Trường hợp export named { PayOS }
        lib.default,        // Trường hợp export default
        lib.default?.PayOS  // Trường hợp export default { PayOS }
    ];

    for (const cls of candidates) {
        // Kiểm tra xem candidate có phải là Class và có hàm createPaymentLink trong prototype không
        if (cls && cls.prototype && typeof cls.prototype.createPaymentLink === 'function') {
            console.log("✅ Đã tìm thấy Class PayOS chuẩn!");
            return cls;
        }
    }
    return null;
}

const PayOSClass = findPayOSClass(payosLib);
const PayOS = PayOSClass;

const CONFIG = {
    GHN: {
        'token': process.env.GHN_TOKEN,
        'ShopId': parseInt(process.env.GHN_SHOP_ID),
        baseUrl: 'https://online-gateway.ghn.vn/shiip/public-api'
    }

};

exports.calcShipping = async (req, res) => {
    try {
        const { districtId, wardCode, carrier, orderAmount, street, provinceId } = req.body;

        // 1. Kiểm tra dữ liệu đầu vào
        if (!districtId || !wardCode) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin Quận/Huyện hoặc Phường/Xã" });
        }

        if (carrier === 'LOCAL') {
            // Ép kiểu về số để so sánh chính xác (Tránh lỗi "202" !== 202)
            const pId = parseInt(provinceId);

            // ID 202 là TP. Hồ Chí Minh (Check kỹ trong API GHN của bạn nếu ID khác)
            if (pId !== 202) {
                return res.status(400).json({
                    success: false,
                    // Message này sẽ hiện lên Frontend khi khách cố tình chọn
                    message: "Giao hàng nội thành chỉ áp dụng tại TP. Hồ Chí Minh!"
                });
            }

            const total = parseInt(orderAmount) || 0;
            const fee = total >= 2000000 ? 0 : 30000;
            return res.json({ success: true, fee: fee });
        }
        // 3. Tính phí GHN
        try {
            // Ép kiểu dữ liệu cho đúng chuẩn GHN yêu cầu
            const payload = {
                "service_type_id": 2, // Giao hàng chuẩn
                "from_district_id": 1454, // ID Quận kho hàng
                "to_district_id": parseInt(districtId),
                "to_ward_code": wardCode.toString(), // Ward code phải là string
                "height": 10, "length": 40, "weight": 2000, "width":40,
                "insurance_value": parseInt(orderAmount) || 1000000
            };

            // LOG RA ĐỂ KIỂM TRA XEM DỮ LIỆU GỬI ĐI LÀ GÌ
             console.log("GHN Payload:", payload);
             console.log("GHN Token:", CONFIG.GHN.token);

            const ghnRes = await axios.post(
                `${CONFIG.GHN.baseUrl || 'https://online-gateway.ghn.vn/shiip/public-api'}/v2/shipping-order/fee`,
                payload,
                {
                    headers: {
                        'Token': CONFIG.GHN.token, // Phải viết hoa chữ T
                        'ShopId': parseInt(CONFIG.GHN.shopId), // Phải là số (Int)
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (ghnRes.data.code === 200) {
                return res.json({ success: true, fee: ghnRes.data.data.total });
            } else {
                console.error("GHN Logic Error:", ghnRes.data);
                return res.status(400).json({ success: false, message: ghnRes.data.message });
            }

        } catch (apiErr) {
            // In lỗi chi tiết ra Terminal để bạn đọc
            console.error("=== LỖI GỌI API GHN ===");
            console.error(apiErr.response ? apiErr.response.data : apiErr.message);

            // Trả về lỗi 400 để Frontend biết là KHÔNG TÍNH ĐƯỢC
            // KHÔNG TRẢ VỀ 30000 Ở ĐÂY NỮA
            return res.status(400).json({
                success: false,
                message: "Lỗi kết nối GHN. Vui lòng kiểm tra lại địa chỉ!"
            });
        }

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};// --- 2. XỬ LÝ ĐẶT HÀNG ---
exports.placeOrder = async (req, res) => {
    try {

        if (!req.session.user) return res.status(401).json({ message: "Vui lòng đăng nhập!" });
        if (!process.env.PAYOS_CLIENT_ID || !process.env.PAYOS_API_KEY) {
            console.error("❌ LỖI: Chưa đọc được biến môi trường PayOS!");
            return res.status(500).json({ message: "Lỗi cấu hình Server (Missing ENV)" });
        }
        const getPayOS = () => {
            return new PayOS(
                process.env.PAYOS_CLIENT_ID,
                process.env.PAYOS_API_KEY,
                process.env.PAYOS_CHECKSUM_KEY
            );
        };
        const payos = getPayOS();
        if (typeof payos.createPaymentLink !== 'function') {
            throw new Error("LỖI THƯ VIỆN: Class PayOS này bị thiếu hàm createPaymentLink!");
        }
        console.log("👉 PayOS Instance:", payos);
        // Kiểm tra xem đối tượng này có hàm gì bên trong prototype không
        console.log("👉 Các hàm có sẵn:", Object.getOwnPropertyNames(Object.getPrototypeOf(payos)));

        const userId = req.session.user.id;
        const { items, shippingInfo, shippingMethod, shippingFee} = req.body;

        // --- GIỮ NGUYÊN LOGIC KIỂM TRA KHO VÀ TÍNH TIỀN ---
        let serverProductTotal = 0;
        const orderItems = [];
        const purchasedProductIds = [];
        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) return res.status(400).json({ message: "Sản phẩm không tồn tại" });

            const variantIndex = product.variants.findIndex(v => v.size === item.size);
            if (variantIndex === -1) return res.status(400).json({ message: `Size ${item.size} không hợp lệ` });

            const buyQty = parseInt(item.quantity);
            if (product.variants[variantIndex].stock < buyQty) {
                return res.status(400).json({ message: `Sản phẩm ${product.name} (${item.size}) đã hết!` });
            }

            product.variants[variantIndex].stock -= buyQty;
            await product.save();

            serverProductTotal += product.price * buyQty;
            purchasedProductIds.push({ id: product._id.toString(), size: item.size });

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
        if (!fee && fee !== 0) return res.status(400).json({ success: false, message: "Lỗi phí vận chuyển!" });

        const finalTotal = serverProductTotal + fee;

        // --- THAY ĐỔI: PayOS yêu cầu orderCode là SỐ NGUYÊN ---
        // Chúng ta lấy timestamp hiện tại để đảm bảo mã số là duy nhất
        const numericOrderCode = Number(Date.now().toString().slice(-9));

        // --- TẠO ĐƠN HÀNG VÀO DB ---
        const newOrder = new Order({
            userId,
            orderCode: numericOrderCode, // Lưu mã số để đồng bộ với PayOS
            userInfo: shippingInfo,
            items: orderItems,
            shippingMethod,
            shippingFee: fee,
            productTotal: serverProductTotal,
            totalPrice: finalTotal,
            paymentMethod: 'PAYOS', // Chuyển sang PAYOS
            status: 'pending',
            paymentStatus: 'Unpaid',
        });
        await newOrder.save();

        // GIỮ NGUYÊN LOGIC XÓA GIỎ HÀNG
        const cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = cart.items.filter(i =>
                !purchasedProductIds.some(p => p.id === i.productId.toString() && p.size === i.size)
            );
            await cart.save();
            req.session.cartCount = cart.items.length;
        }

        // --- TẠO LINK THANH TOÁN PAYOS ---
        const paymentData = {
            orderCode: numericOrderCode,
            amount: finalTotal,
            description: `Thanh toan don ${numericOrderCode}`,
            cancelUrl: `https://pei-untestamentary-nonavoidably.ngrok-free.dev/cart`, // Thay bằng link web của bạn
            returnUrl: `https://pei-untestamentary-nonavoidably.ngrok-free.dev/order`, // Thay bằng link web của bạn
        };
        console.log("👉 KIỂM TRA ĐỐI TƯỢNG PAYOS:", payos);
        console.log("👉 KIỂM TRA HÀM:", typeof payos.createPaymentLink);
        const paymentLinkRes = await payos.createPaymentLink(paymentData);

        // Trả về cho Frontend link thanh toán để redirect khách đi
        return res.json({
            success: true,
            type: 'PAYOS',
            checkoutUrl: paymentLinkRes.checkoutUrl
        });

    } catch (err) {
        console.error("Lỗi đặt hàng PayOS:", err);
        res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
    }
};

exports.payosWebhook = async (req, res) => {
    console.log("🔔 [PAYOS WEBHOOK] Tín hiệu thanh toán mới!");

    // 1. Lấy dữ liệu từ body (PayOS gửi về mẫu như bạn đã đưa)
    const { code, success, data } = req.body;

    // 2. Kiểm tra nếu thanh toán thành công (code "00" và success true)
    if (code === "00" && success === true) {
        try {
            const orderCode = data.orderCode; // Ví dụ: 123
            const amountPaid = data.amount;   // Ví dụ: 3000

            // 3. Tìm đơn hàng trong Database
            // Lưu ý: Nếu DB của bạn lưu orderCode là String, hãy ép kiểu: String(orderCode)
            const order = await Order.findOne({ orderCode: orderCode });

            if (!order) {
                console.log(`❌ Không tìm thấy đơn hàng: ${orderCode}`);
                return res.status(404).json({ error: "Order not found" });
            }

            // 4. Kiểm tra số tiền (tùy chọn nhưng nên có)
            if (amountPaid >= order.totalPrice) {
                order.paymentStatus = 'Paid';
                order.status = 'confirmed';
                await order.save();
                console.log(`✅ Đơn hàng ${orderCode} đã thanh toán thành công!`);

                // 5. Bắn Socket.io để Frontend tự động chuyển trang
                if (req.io) {
                    req.io.emit('payment-success', { orderCode: orderCode });
                }
            } else {
                console.log(`⚠️ Thanh toán thiếu tiền cho đơn ${orderCode}`);
            }

            // PayOS yêu cầu bạn trả về 200 để xác nhận đã nhận webhook
            return res.status(200).json({ success: true });

        } catch (error) {
            console.error("❌ Lỗi xử lý Webhook PayOS:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    } else {
        console.log("❌ Giao dịch thất bại hoặc bị hủy.");
        return res.status(200).json({ success: false });
    }
};// --- 4. HIỂN THỊ LỊCH SỬ ĐƠN HÀNG ---
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

