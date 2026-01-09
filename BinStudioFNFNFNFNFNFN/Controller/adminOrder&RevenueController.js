const Order = require('../Models/order');
const Product = require('../Models/product');

// 1. Logic hiển thị trang danh sách & Thống kê (ĐÃ NÂNG CẤP BỘ LỌC)
exports.getRevenuePage = async (req, res) => {
    try {
        // --- A. TÍNH TOÁN THỐNG KÊ (GIỮ NGUYÊN) ---
        // Phần này tính tổng doanh thu Hôm nay & Tháng này để hiển thị lên 4 cái thẻ trên cùng
        // Số liệu này KHÔNG bị ảnh hưởng bởi bộ lọc (để Admin luôn nắm được tình hình chung)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const daysInMonth = endOfMonth.getDate();

        // Tính doanh thu hôm nay
        const ordersToday = await Order.find({
            createdAt: { $gte: today },
            status: 'delivered', // Hoặc 'completed' tùy DB của bạn, ở đây bạn dùng 'delivered'
            paymentStatus: 'Paid' // Chỉ tính đơn đã trả tiền
        });
        const dailyRevenue = ordersToday.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        // Tính doanh thu tháng này
        const ordersMonth = await Order.find({
            createdAt: { $gte: startOfMonth },
            status: 'delivered',
            paymentStatus: 'Paid'
        });
        const monthlyRevenue = ordersMonth.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        const pendingCount = await Order.countDocuments({ status: 'pending' });
        const completedCount = await Order.countDocuments({ status: 'delivered' });

        // --- B. XỬ LÝ BỘ LỌC TÌM KIẾM (PHẦN MỚI) ---
        const { keyword, date, status } = req.query;
        let filter = {};

        // 1. Lọc theo Trạng thái
        if (status) {
            filter.status = status;
        }

        // 2. Lọc theo Ngày
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            filter.createdAt = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // 3. Lọc theo Từ khóa (Mã đơn, Tên, SĐT, Email)
        if (keyword) {
            const regex = new RegExp(keyword, 'i'); // 'i' là không phân biệt hoa thường

            let orConditions = [
                { 'userInfo.fullName': regex },
                { 'userInfo.phone': regex },
                { 'userInfo.email': regex }
            ];

            // Nếu keyword là số -> Tìm theo orderCode
            if (!isNaN(keyword)) {
                orConditions.push({ orderCode: Number(keyword) });
            }

            filter.$or = orConditions;
        }

        // --- C. TRUY VẤN DỮ LIỆU ĐỂ HIỂN THỊ BẢNG ---
        // Lấy danh sách đơn hàng dựa trên bộ lọc `filter`
        const orders = await Order.find(filter).sort({ createdAt: -1 });

        // --- D. DỮ LIỆU BIỂU ĐỒ (MẶC ĐỊNH THÁNG NÀY) ---
        const chartLabels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        const chartData = new Array(daysInMonth).fill(0);

        ordersMonth.forEach(order => {
            const d = new Date(order.createdAt);
            const day = d.getDate();
            chartData[day - 1] += (order.totalPrice || 0);
        });

        // --- E. RENDER VIEW ---
        // Lưu ý: Tên file view phải khớp với file bạn tạo (admin/order.ejs)
        res.render('admin/DonHangVaDoanhThu', {
            orders,
            stats: { dailyRevenue, monthlyRevenue, pendingCount, completedCount },
            chartData: JSON.stringify(chartData),
            chartLabels: JSON.stringify(chartLabels),
            // Truyền lại queryData để giữ giá trị trong ô input sau khi reload
            queryData: req.query
        });

    } catch (err) {
        console.error("Lỗi getRevenuePage:", err);
        res.status(500).send("Lỗi server");
    }
};

// 2. Logic cập nhật trạng thái & Hoàn kho (GIỮ NGUYÊN)
exports.updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const newStatus = req.body.status;
        const order = await Order.findById(orderId);

        if (!order) return res.status(404).send("Không tìm thấy đơn hàng");

        // 🔥 1. LOGIC QUAN TRỌNG: CHẶN HỦY NẾU ĐÃ TRẢ TIỀN MÀ CHƯA HOÀN TIỀN
        // (Kiểm tra kỹ cả chữ hoa/thường)
        if (newStatus === 'cancelled' && order.paymentStatus === 'Paid') {
            return res.send(`
                <script>
                    alert("❌ KHÔNG THỂ HỦY ĐƠN!\\n\\nKhách hàng ĐÃ THANH TOÁN (Paid).\\nBạn VUI LÒNG HOÀN TIỀN (chuyển sang 'Đã hoàn tiền') trước khi hủy đơn hàng này.");
                    window.history.back();
                </script>
            `);
        }

        // 2. Chặn giao hàng nếu chưa trả tiền
        if (newStatus !== 'cancelled' && newStatus !== 'returned' && order.paymentStatus !== 'Paid') {
            return res.send(`
                <script>
                    alert('⛔ CHẶN THAO TÁC!\\nĐơn chưa thanh toán thì không được giao hàng.');
                    window.history.back();
                </script>
            `);
        }

        // 3. Chặn sửa đơn đã xong
        if (order.status === 'cancelled' || order.status === 'returned') {
            return res.send(`<script>alert('❌ Đơn này đã đóng, không thể sửa nữa.'); window.history.back();</script>`);
        }

        // 4. LOGIC HOÀN KHO (Khi Hủy hoặc Trả hàng)
        if ((newStatus === 'cancelled' || newStatus === 'returned') && order.status !== 'cancelled') {
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
        await order.save();
        res.redirect('/admin/orders');

    } catch (err) {
        console.error("Lỗi updateOrderStatus:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};
// 3. Logic API biểu đồ linh hoạt (GIỮ NGUYÊN)
exports.getRevenuePage = async (req, res) => {
    try {
        // --- A. TÍNH TOÁN THỐNG KÊ (ĐÃ CẬP NHẬT LOGIC MỚI) ---
        const today = new Date();
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

        // Chặn sửa nếu đã Refund rồi (như bài trước)
        if (order.paymentStatus === 'Refund') {
            return res.send(`
                <script>
                    alert("❌ Đơn này đã hoàn tiền xong, không thể chỉnh sửa trạng thái thanh toán nữa.");
                    window.history.back();
                </script>
            `);
        }

        // Cập nhật trạng thái thanh toán mới
        order.paymentStatus = paymentStatus;

        // 🔥 LOGIC TỰ ĐỘNG: REFUND => HỦY ĐƠN
        // Nếu chọn "Hoàn tiền", hệ thống tự hiểu đơn này coi như bỏ -> Cancelled
        if (paymentStatus === 'Refund') {
            order.status = 'cancelled';
        }
        if (paymentStatus === 'Paid') {
            order.status = 'pending';
        }
        await order.save();
        res.redirect('/admin/orders');

    } catch (err) {
        console.error(err);
        res.status(500).send("Lỗi cập nhật thanh toán");
    }
};