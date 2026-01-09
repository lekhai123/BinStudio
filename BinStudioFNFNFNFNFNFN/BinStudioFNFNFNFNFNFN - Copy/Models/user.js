const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, default: '' },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String },
    role: { type: String, default: 'user' }, // 'user' hoặc 'admin'
    createdAt: { type: Date, default: Date.now },
    resetOTP: Number,
    resetOTPExpires: Date,
    isLocked: { type: Boolean, default: false }
});
module.exports = mongoose.model('User', userSchema);