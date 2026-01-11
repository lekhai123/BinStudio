const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    type: { type: String, default: 'INFO' },
    message: String,
    metadata: Object, // Lưu chi tiết lỗi API hoặc ID đơn hàng
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Log', logSchema);