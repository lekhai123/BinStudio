const Log = require('../Models/log');
const Config = require('../Models/config');

// --- 1. HIỂN THỊ TRANG CẤU HÌNH & LOG ---
exports.getConfigPage = async (req, res) => {
    try {
        // Lấy cấu hình (nếu chưa có thì tạo mới mặc định)
        let config = await Config.findOne();
        if (!config) {
            config = new Config({
                momo: { partnerCode: '', accessKey: '', isEnabled: true },
                vietqr: { bankAccount: '', bankName: 'Vietcombank', isEnabled: true },
                ghn: { token: '', shopId: '', isEnabled: false }
            });
            await config.save();
        }

        // Lấy 50 log mới nhất
        const logs = await Log.find().sort({ createdAt: -1 }).limit(50);

        res.render('admin/API&&Log', { config, logs });
    } catch (err) {
        console.error("Lỗi getConfigPage:", err);
        res.status(500).send("Lỗi tải trang cấu hình");
    }
};

// --- 2. LƯU CẤU HÌNH API ---
exports.saveConfig = async (req, res) => {
    try {
        const {
            momo_code, momo_key, momo_on,
            vqr_acc, vqr_bank, vqr_on,
            ghn_token, ghn_id, ghn_on
        } = req.body;

        const updateData = {
            momo: { partnerCode: momo_code, accessKey: momo_key, isEnabled: momo_on === 'on' },
            vietqr: { bankAccount: vqr_acc, bankName: vqr_bank, isEnabled: vqr_on === 'on' },
            ghn: { token: ghn_token, shopId: ghn_id, isEnabled: ghn_on === 'on' }
        };

        await Config.findOneAndUpdate({}, updateData, { upsert: true });

        // Tạo log khi admin thay đổi cấu hình
        await new Log({ type: 'INFO', message: "Admin đã cập nhật cấu hình hệ thống API." }).save();

        // Chú ý: Redirect viết liền mạch để tránh lỗi %20
        res.redirect('/admin/config?success=true');
    } catch (err) {
        console.error("Lỗi saveConfig:", err);
        res.status(500).send("Lỗi khi lưu cấu hình");
    }
};

// --- 3. XÓA TOÀN BỘ NHẬT KÝ ---
exports.clearLogs = async (req, res) => {
    try {
        await Log.deleteMany({});
        // Ghi lại hành động xóa log vào một bản ghi mới
        await new Log({ type: 'WARNING', message: "Toàn bộ nhật ký hệ thống đã bị xóa bởi Admin." }).save();

        res.redirect('/admin/config');
    } catch (err) {
        console.error("Lỗi clearLogs:", err);
        res.status(500).send("Lỗi khi xóa log");
    }
};

// --- 4. API LẤY LOG MỚI (Dùng cho Polling ở FE) ---
exports.getLogsStream = async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 }).limit(10);
        res.json(logs);
    } catch (err) {
        res.status(500).json([]);
    }
};