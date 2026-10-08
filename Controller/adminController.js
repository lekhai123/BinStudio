const User = require('../Models/user');
const Product = require('../Models/product');
const Order = require('../Models/order');
const PageContent = require('../Models/pagecontent');
const upload = require('../config/cloudinary');

// 1. HIỂN THỊ TRANG DASHBOARD (Render HTML)
exports.getDashboard = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(today.getHours() + 7); // Chuyển về giờ VN
        today.setHours(0, 0, 0, 0);

        // --- A. CÁC THẺ THỐNG KÊ ---
        const ordersToday = await Order.find({
            createdAt: { $gte: today },
            paymentStatus: 'Paid',
            status: { $ne: 'cancelled' }
        });
        const dailyRevenue = ordersToday.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

        const pendingOrders = await Order.countDocuments({ status: 'pending' });

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const newCustomers = await User.countDocuments({
            createdAt: { $gte: startOfMonth },
            role: 'user'
        });

        // --- B. CẢNH BÁO KHO ---
        const lowStockProducts = await Product.find({
            "variants.stock": { $lt: 3 }
        }).select('name variants').lean();

        let lowStockAlerts = [];
        lowStockProducts.forEach(p => {
            p.variants.forEach(v => {
                if (v.stock < 3) {
                    lowStockAlerts.push({ name: p.name, size: v.size, stock: v.stock });
                }
            });
        });
       
        // --- C. USER MỚI ---
        const recentUsers = await User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5);

        // --- D. DỮ LIỆU BIỂU ĐỒ MẶC ĐỊNH (7 NGÀY QUA) ---
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // Gọi hàm nội bộ để lấy data cho gọn code
        const chartData = await getChartDataLogic(sevenDaysAgo, new Date());

        // TRẢ VỀ HTML
        res.render('admin/admin', {
            stats: { dailyRevenue, pendingOrders, newCustomers },
            lowStockAlerts,
            recentUsers,
            chartData: JSON.stringify(chartData.data),     // Dữ liệu mặc định
            chartLabels: JSON.stringify(chartData.labels)  // Label mặc định
        });

    } catch (err) {
        console.error("Lỗi Dashboard:", err);
        res.status(500).send("Lỗi hệ thống");
    }
};

// 2. API TRẢ VỀ JSON CHO BIỂU ĐỒ (Khi bấm nút Lọc)
exports.getDashboardChartData = async (req, res) => {
    try {
        const { start, end } = req.query;

        if (!start || !end) {
            return res.status(400).json({ error: "Vui lòng chọn ngày!" });
        }

        const startDate = new Date(start); startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(end); endDate.setHours(23, 59, 59, 999);

        // Lấy dữ liệu
        const result = await getChartDataLogic(startDate, endDate);

        // TRẢ VỀ JSON (Quan trọng)
        return res.json(result);

    } catch (err) {
        console.error("Lỗi API Chart:", err);
        return res.status(500).json({ error: "Lỗi Server" });
    }
};

// --- HÀM PHỤ TRỢ (Dùng chung cho cả 2 hàm trên để đỡ viết lại code) ---
async function getChartDataLogic(startDate, endDate) {
    const orders = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                paymentStatus: 'Paid',
                status: { $ne: 'cancelled' }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%d/%m", date: "$createdAt" } },
                total: { $sum: "$totalPrice" }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    // Lấp đầy ngày trống
    let labels = [];
    let data = [];
    let tempDate = new Date(startDate);
    const dataMap = {};

    orders.forEach(item => { dataMap[item._id] = item.total; });

    while (tempDate <= endDate) {
        const day = ("0" + tempDate.getDate()).slice(-2);
        const month = ("0" + (tempDate.getMonth() + 1)).slice(-2);
        const key = `${day}/${month}`;

        labels.push(key);
        data.push(dataMap[key] || 0);

        tempDate.setDate(tempDate.getDate() + 1);
    }

    return { labels, data };
}
exports.updateHomepageConfig = async (req, res) => {
    try {
        // 1. Lấy dữ liệu Text từ Form
        const {
            heroTitle, heroSubtitle, heroDesc, heroBtnLink,
            serviceIcon1, serviceTitle1, serviceDesc1,
            serviceIcon2, serviceTitle2, serviceDesc2,
            serviceIcon3, serviceTitle3, serviceDesc3,
            celebTitle, celebDesc, // <--- Lấy tiêu đề và mô tả mới
            celebName1, celebName2, celebName3
        } = req.body;

        // 2. Tìm bản ghi cũ
        let content = await PageContent.findOne();
        if (!content) content = new PageContent();

        // 3. Xử lý Ảnh 
        // [QUAN TRỌNG] Lấy danh sách items cũ từ cấu trúc MỚI (celebSection) để không bị mất ảnh khi update text
        let oldItems = [];
        if (content.celebSection && Array.isArray(content.celebSection.items)) {
            oldItems = content.celebSection.items;
        } else if (Array.isArray(content.celebrities)) {
            oldItems = content.celebrities;
        }
        const files = req.files || {};

        // Ảnh Hero Banner
        const heroImgUrl = files['heroImage'] ? files['heroImage'][0].path : content.hero.backgroundImage;

        // Ảnh Celebs: Ưu tiên ảnh mới upload > Nếu không có thì lấy ảnh cũ trong mảng oldItems
        const celebImg1Url = files['celebImg1'] ? files['celebImg1'][0].path : (oldItems[0]?.image || '');
        const celebImg2Url = files['celebImg2'] ? files['celebImg2'][0].path : (oldItems[1]?.image || '');
        const celebImg3Url = files['celebImg3'] ? files['celebImg3'][0].path : (oldItems[2]?.image || '');

        // 4. Gán dữ liệu mới vào
        // --- Hero ---
        content.hero = {
            title: heroTitle,
            subtitle: heroSubtitle,
            description: heroDesc,
            btnLink: heroBtnLink,
            backgroundImage: heroImgUrl
        };

        // --- Services ---
        content.services = [
            { icon: serviceIcon1, title: serviceTitle1, description: serviceDesc1 },
            { icon: serviceIcon2, title: serviceTitle2, description: serviceDesc2 },
            { icon: serviceIcon3, title: serviceTitle3, description: serviceDesc3 }
        ];

        // --- Celebs (CẬP NHẬT CẤU TRÚC MỚI) ---
        content.celebSection = {
            title: celebTitle,        // Lưu tiêu đề lớn
            description: celebDesc,   // Lưu mô tả nhỏ
            items: [                  // Danh sách ảnh
                { name: celebName1, image: celebImg1Url },
                { name: celebName2, image: celebImg2Url },
                { name: celebName3, image: celebImg3Url }
            ]
        };

        // 5. Lưu và Quay về
        await content.save();
        res.redirect('/aHyIsnxH18Ahpwww/homepage?success=true');

    } catch (err) {
        // 1. In lỗi ra cửa sổ dòng lệnh (Terminal) để bạn đọc
        console.error("LOG LỖI CHI TIẾT:", err);

        // 2. Trả về JSON để trình duyệt hiển thị rõ ràng
        res.status(500).json({
            message: "Đã xảy ra lỗi khi lưu",
            error_details: err.message || err, // Lấy thông điệp lỗi
            full_error: err // Trả về toàn bộ object lỗi
        });
    }
};
exports.getHomepageConfig = async (req, res) => {
    try {
        let content = await PageContent.findOne();
        // Nếu chưa có dữ liệu thì tạo mới (để form không bị lỗi)
        if (!content) content = new PageContent();

        res.render('admin/homepage-config', { content });
    }
    catch (err) {
        // 1. In lỗi ra cửa sổ dòng lệnh (Terminal) để bạn đọc
        console.error("LOG LỖI CHI TIẾT:", err);

        // 2. Trả về JSON để trình duyệt hiển thị rõ ràng
        res.status(500).json({
            message: "Đã xảy ra lỗi khi lưu",
            error_details: err.message || err, // Lấy thông điệp lỗi
            full_error: err // Trả về toàn bộ object lỗi
        });
    }
};