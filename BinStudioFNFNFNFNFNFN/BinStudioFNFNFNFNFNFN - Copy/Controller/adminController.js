const User = require('../Models/user');
const Product = require('../Models/product');
const Order = require('../Models/order');

exports.getDashboard = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. DOANH THU HÔM NAY (Lưu ý: Kiểm tra database là 'Delivered' hay 'delivered')
        const ordersToday = await Order.find({
            createdAt: { $gte: today },
            status: { $regex: /^delivered$/i } // Dùng regex để không phân biệt hoa thường
        });
        const dailyRevenue = ordersToday.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

        // 2. ĐƠN HÀNG CHỜ XỬ LÝ
        const pendingOrders = await Order.countDocuments({ status: { $regex: /^pending$/i } });

        // 3. KHÁCH HÀNG MỚI TRONG THÁNG
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const newCustomers = await User.countDocuments({
            createdAt: { $gte: startOfMonth },
            role: 'user'
        });

        // 4. CẢNH BÁO KHO (Giữ nguyên logic của bạn)
        const products = await Product.find();
        let lowStockAlerts = [];
        products.forEach(p => {
            p.variants.forEach(v => {
                if (v.stock < 3) {
                    lowStockAlerts.push({ name: p.name, size: v.size, stock: v.stock });
                }
            });
        });

        // 5. NGƯỜI DÙNG MỚI NHẤT
        const recentUsers = await User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5);

        // 6. LẤY DỮ LIỆU BIỂU ĐỒ THẬT (7 ngày gần nhất)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const chartStats = await Order.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo }, status: { $regex: /^delivered$/i } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%d/%m", date: "$createdAt" } },
                    total: { $sum: "$totalPrice" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const chartLabels = chartStats.map(s => s._id);
        const chartData = chartStats.map(s => s.total);

        // TRẢ DỮ LIỆU VỀ VIEW
        res.render('admin/admin', {
            stats: { dailyRevenue, pendingOrders, newCustomers },
            lowStockAlerts,
            recentUsers,
            chartData: JSON.stringify(chartData),
            chartLabels: JSON.stringify(chartLabels)
        });

    } catch (err) {
        console.error("Lỗi Dashboard:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};
