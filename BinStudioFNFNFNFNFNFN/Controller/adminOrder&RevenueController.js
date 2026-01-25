const Order = require('../Models/order');
const Product = require('../Models/product');
const Log = require('../Models/log');

// 1. Logic hiển thị trang danh sách & Thống kê (ĐÃ NÂNG CẤP BỘ LỌC)
const getVNTime = () => new Date(Date.now() + (7 * 60 * 60 * 1000));
// 2. Logic cập nhật trạng thái & Hoàn kho (GIỮ NGUYÊN)
exports.updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const newStatus = req.body.status; // Trạng thái muốn chuyển tới
        const order = await Order.findById(orderId);

        if (!order) return res.status(404).send("Không tìm thấy đơn hàng");

        // 1. CHẶN NẾU ĐƠN ĐÃ CHẾT (Final State)
        if (['Cancelled', 'Returned'].includes(order.status)) {
            return res.send(`<script>alert('❌ Đơn đã kết thúc (${order.status}). Không thể sửa!'); window.history.back();</script>`);
        }
        if (order.paymentStatus === 'Refund') {
            return res.send(`<script>alert('⛔ Đơn đã Hoàn tiền. Không thể thao tác!'); window.history.back();</script>`);
        }
        if (order.paymentStatus === 'Unpaid'&& newStatus!=='Cancelled') {
            return res.send(`<script>alert('⛔ Đơn hàng chưa thanh toán. Không thể thao tác!'); window.history.back();</script>`);
        }

        // 2. LOGIC CHUYỂN SANG "SHIPPING" (ĐANG GIAO)
        if (newStatus === 'Shipping') {
            // Nếu là GHN: Không cho chuyển tay (Phải dùng nút Tạo đơn GHN)
            if (order.shippingMethod === 'GHN' && !order.ghn_order_code) {
                return res.send(`<script>alert('⛔ Với đơn GHN, vui lòng bấm nút "Tạo đơn GHN" để lấy mã vận đơn trước!'); window.history.back();</script>`);

            }
            order.trackingLogs.push({
                status: newStatus,
                action_at: getVNTime(),
                note: `Admin cập nhật: ${newStatus}`
            });
            // Nếu là LOCAL: Cho phép chuyển
        }

        // 3. LOGIC CHUYỂN SANG "COMPLETED" (HOÀN THÀNH - CHỈ LOCAL)
        if (newStatus === 'Completed') {
            // Nếu là GHN: Không cho chuyển tay (Chờ Webhook hoặc Shipper cập nhật)
            if (order.shippingMethod === 'GHN') {
                return res.send(`<script>alert('⛔ Đơn GHN sẽ tự động hoàn thành khi Shipper giao xong via Webhook.'); window.history.back();</script>`);
            }

            // Nếu là LOCAL: Xử lý thanh toán COD
            if (order.paymentMethod === 'COD' && order.paymentStatus !== 'Paid') {
                order.paymentStatus = 'Paid';
                order.payment_info = { method: 'COD_LOCAL', status: 'Paid', amount: order.totalPrice, date: new Date() };
                console.log(`💰 Auto-Paid cho đơn Local #${order.orderCode}`);
            }
            order.trackingLogs.push({
                status: newStatus,
                action_at: getVNTime(),
                note: `Admin cập nhật: ${newStatus}`
            });
        }

        // 4. LOGIC "CANCELLED" (HỦY ĐƠN)
        if (newStatus === 'Cancelled') {
            // Chặn nếu đang đi giao
            if (['Shipping', 'Completed'].includes(order.status)) {
                return res.send(`<script>alert('⛔ Đơn đang giao hoặc đã xong. Không thể Hủy ngang! Hãy dùng chức năng Trả hàng.'); window.history.back();</script>`);
            }
            // Chặn nếu đã trả tiền (Bắt phải dùng nút Refund bên cột Thanh toán)
            if (order.paymentStatus === 'Paid') {
                return res.send(`<script>alert('⛔ Khách đã thanh toán! Vui lòng thao tác bên cột "Thanh toán" -> chọn "Đã hoàn tiền" để hệ thống tự hủy và hoàn kho.'); window.history.back();</script>`);
            }
            order.trackingLogs.push({
                status: newStatus,
                action_at: getVNTime(),
                note: `Admin cập nhật: ${newStatus}`
            });
        }

        // 5. LOGIC "RETURNED" (KHÁCH TRẢ HÀNG / GIAO THẤT BẠI)
        if (newStatus === 'Returned') {
            // Chỉ cho phép khi đang Shipping hoặc đã Completed
            if (!['Shipping', 'Completed'].includes(order.status)) {
                return res.send(`<script>alert('⛔ Chỉ hoàn hàng khi đơn Đang giao hoặc Đã giao.'); window.history.back();</script>`);
            }
            // Nếu đã trả tiền -> Cảnh báo (Admin phải tự quyết định có Refund tiền không)
            // Ở đây ta cho phép đổi trạng thái để hoàn kho, nhưng tiền thì Admin xử lý sau
            order.trackingLogs.push({
                status: newStatus,
                action_at: getVNTime(),
                note: `Admin cập nhật: ${newStatus}`
            });
        }

        // --- 6. XỬ LÝ HOÀN KHO (RESTOCK) ---
        // Áp dụng cho Cancelled và Returned
        if (newStatus === 'Cancelled' || newStatus === 'Returned') {
            console.log("🔄 Đang hoàn kho cho đơn:", order.orderCode);
            for (const item of order.items) {
                const product = await Product.findById(item.productId);
                if (product) {
                    const variant = product.variants.find(v => v.size === item.size);
                    if (variant) variant.stock += item.quantity;
                    await product.save();
                }
            }
        }

        // --- 7. LƯU DATABASE ---
        if (order.status !== newStatus) {
            order.status = newStatus;

            // 🔥 QUAN TRỌNG: Ghi log thời gian thực vào DB
            // Để bên tracking hiển thị đúng giờ Admin bấm nút

            await order.save();

            // Ghi log hệ thống (cho Admin xem lịch sử thao tác)
            await Log.create({
                type: 'ORDER',
                message: `Admin đã cập nhật đơn #${order.orderCode} sang ${newStatus}`
            });
        }
        res.redirect('/aHyIsnxH18Ahpwww/orders');


    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi hệ thống");
    }
};
// 3. Logic API biểu đồ linh hoạt (GIỮ NGUYÊN)
exports.getRevenuePage = async (req, res) => {
    try {
        // --- A. TÍNH TOÁN THỐNG KÊ (ĐÃ CẬP NHẬT LOGIC MỚI) ---
        const today = new Date();
        today.setHours(today.getHours() + 7); // Chuyển về giờ VN
        today.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const daysInMonth = endOfMonth.getDate();

        // 1. Doanh thu hôm nay (Chỉ cần Paid và không Cancelled)
        const ordersToday = await Order.find({
            createdAt: { $gte: today },
            paymentStatus: 'Paid',          // Đã trả tiền
            status: { $ne: 'cancelled' }    // Chưa hủy
        });
        const dailyRevenue = ordersToday.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        // 2. Doanh thu tháng này (Logic tương tự)
        const ordersMonth = await Order.find({
            createdAt: { $gte: startOfMonth },
            paymentStatus: 'Paid',
            status: { $ne: 'cancelled' }
        });
        const monthlyRevenue = ordersMonth.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        const pendingCount = await Order.countDocuments({ status: 'pending' });
        const completedCount = await Order.countDocuments({ status: 'delivered' });

        // --- B. XỬ LÝ BỘ LỌC TÌM KIẾM ---
        const { keyword, date, status } = req.query;
        let filter = {};

        if (status) filter.status = status;

        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: startDate, $lte: endDate };
        }

        if (keyword) {
            const regex = new RegExp(keyword, 'i');
            let orConditions = [
                { 'userInfo.fullName': regex },
                { 'userInfo.phone': regex },
                { 'userInfo.email': regex }
            ];
            if (!isNaN(keyword)) {
                orConditions.push({ orderCode: Number(keyword) });
            }
            filter.$or = orConditions;
        }

        // --- C. TRUY VẤN DỮ LIỆU ---
        const orders = await Order.find(filter).sort({ createdAt: -1 });

        // --- D. DỮ LIỆU BIỂU ĐỒ MẶC ĐỊNH (Cho tháng hiện tại) ---
        const chartLabels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        const chartData = new Array(daysInMonth).fill(0);

        ordersMonth.forEach(order => {
            const d = new Date(order.createdAt);
            const day = d.getDate();
            chartData[day - 1] += (order.totalPrice || 0);
        });

        res.render('admin/DonHangVaDoanhThu', {
            orders,
            stats: { dailyRevenue, monthlyRevenue, pendingCount, completedCount },
            chartData: JSON.stringify(chartData),
            chartLabels: JSON.stringify(chartLabels),
            queryData: req.query
        });

    } catch (err) {
        console.error("Lỗi getRevenuePage:", err);
        res.status(500).send("Lỗi server");
    }
};

// Thêm hàm xử lý cập nhật thanh toán
exports.updatePaymentStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { paymentStatus } = req.body;
        const order = await Order.findById(orderId);

        if (!order) return res.status(404).send("Không tìm thấy đơn hàng");

        const oldPayStatus = order.paymentStatus; // 🔥 Khai báo biến này ở đây

        if (oldPayStatus === 'Refund') {
            return res.send(`<script>alert("❌ Đơn này đã hoàn tiền xong."); window.history.back();</script>`);
        }

        order.paymentStatus = paymentStatus;

        if (paymentStatus === 'Refund') {
            const oldStatus = order.status;
            order.status = 'Returned';

            if (oldStatus !== 'Cancelled' && oldStatus !== 'Returned') {
                for (const item of order.items) {
                    const product = await Product.findById(item.productId);
                    if (product) {
                        const variant = product.variants.find(v => v.size === item.size);
                        if (variant) variant.stock += item.quantity;
                        await product.save();
                    }
                }
            }
        }

        await order.save();

        // Ghi Log lịch sử
        await Log.create({
            type: 'PAYMENT',
            message: `Cập nhật THANH TOÁN #${order.orderCode}: [${oldPayStatus}] -> [${paymentStatus}]`
        });

        res.redirect('/aHyIsnxH18Ahpwww/orders');
    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi cập nhật");
    }
};