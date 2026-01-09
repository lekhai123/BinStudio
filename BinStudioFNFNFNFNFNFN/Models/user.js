const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, default: '' },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String },
    role: { type: String, default: 'user' }, // 'user' hoặc 'admin'
    createdAt: { type: Date, default: Date.now },
    isLocked: { type: Boolean, default: false }
});
// 1. Đảm bảo Email là duy nhất và tìm nhanh (Login)
// (Trong schema bạn đã có unique: true, mongoose sẽ tự tạo index này, nhưng khai báo lại cũng không sao)

// 2. Tìm theo số điện thoại (Login bằng SĐT hoặc Admin tìm)
userSchema.index({ phone: 1 });

// 3. Tìm kiếm người dùng theo tên (Admin search)
userSchema.index({ fullName: 'text' });
module.exports = mongoose.model('User', userSchema);