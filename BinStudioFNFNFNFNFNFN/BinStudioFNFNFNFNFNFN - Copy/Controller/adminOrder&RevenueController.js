const Order = require('../Models/order');
const Product = require('../Models/product');

// 1. Logic hiển thị trang danh sách & Thống kê
exports.getRevenuePage = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const daysInMonth = endOfMonth.getDate();

        let query = {};
        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }

        const orders = await Order.find(query).sort({ createdAt: -1 });

        const ordersToday = await Order.find({
            createdAt: { $gte: today },
            status: 'delivered'
        });
        const dailyRevenue = ordersToday.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        const ordersMonth = await Order.find({
            createdAt: { $gte: startOfMonth },
            status: 'delivered'
        });
        const monthlyRevenue = ordersMonth.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        const pendingCount = await Order.countDocuments({ status: 'pending' });
        const completedCount = await Order.countDocuments({ status: 'delivered' });

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
            currentFilter: req.query.status || 'all'
        });
    } catch (err) {
        console.error("Lỗi getRevenuePage:", err);
        res.status(500).send("Lỗi server");
    }
};

// 2. Logic cập nhật trạng thái & Hoàn kho
exports.updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const newStatus = req.body.status;
        const order = await Order.findById(orderId);

        if (!order) return res.status(404).send("Không tìm thấy đơn hàng");


        // Chặn thay đổi nếu đơn đã hủy hoặc đã giao
        if (order.status === 'cancelled' || order.status === 'delivered') {
            return res.status(400).send(`
                <h1>Thao tác bị từ chối!</h1>
                <p>Đơn hàng đã ở trạng thái kết thúc.</p>
                <a href="/admin/orders">Quay lại danh sách</a>
            `);
        }

        // Logic hoàn kho nếu hủy đơn
        if (newStatus === 'cancelled' && order.status !== 'cancelled') {
            for (const item of order.items) {
                const product = await Product.findById(item.productId);
                if (product) {
                    const variant = product.variants.find(v => v.size === item.size);
                    if (variant) {
                        variant.stock += item.quantity;
                        await product.save();
                    }
                }
            }
        }

        order.status = newStatus;
        if (newStatus === 'delivered') order.paymentStatus = 'Paid';

        await order.save();
        res.redirect('/admin/orders');
    } catch (err) {
        console.error("Lỗi updateOrderStatus:", err);
        res.status(500).send("Lỗi hệ thống khi cập nhật");
    }
};

// 3. Logic API biểu đồ linh hoạt
exports.getRevenueChartData = async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) return res.status(400).json({ error: "Thiếu ngày" });

        const startDate = new Date(start); startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(end); endDate.setHours(23, 59, 59, 999);

        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'delivered'
        }).sort({ createdAt: 1 });

        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let labels = [];
        let data = [];

        if (diffDays <= 90) {
            const dayMap = {};
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const key = d.getDate() + '/' + (d.getMonth() + 1);
                dayMap[key] = 0;
            }
            orders.forEach(o => {
                const d = new Date(o.createdAt);
                const key = d.getDate() + '/' + (d.getMonth() + 1);
                if (dayMap.hasOwnProperty(key)) dayMap[key] += o.totalPrice;
            });
            labels = Object.keys(dayMap);
            data = Object.values(dayMap);
        } else {
            const weekMap = {};
            orders.forEach(o => {
                const d = new Date(o.createdAt);
                const day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                const key = `Tuần ${monday.getDate()}/${monday.getMonth() + 1}`;
                weekMap[key] = (weekMap[key] || 0) + o.totalPrice;
            });
            labels = Object.keys(weekMap);
            data = Object.values(weekMap);
        }
        res.json({ labels, data });
    } catch (err) {
        res.status(500).json({ error: "Lỗi Server" });
    }
};
// controllers/orderController.js
exports.cancelOrder = async (req, res) => {
    const order = await Order.findById(req.params.id);

    // Nếu mã vận đơn GHN đã tồn tại (nghĩa là đã giao shipper)
    if (order.ghnOrderCode) {
        return res.status(400).json({
            message: "Sản phẩm cao cấp đã đóng gói và bàn giao vận chuyển. Không thể hủy đơn tự động. Vui lòng liên hệ hotline."
        });
    }

    order.status = 'Cancelled';
    await order.save();
    res.json({ message: "Đã hủy đơn thành công." });
};