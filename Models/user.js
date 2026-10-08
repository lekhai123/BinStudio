const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, default: '' },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String },
    role: { type: String, default: 'user' }, 
    createdAt: { type: Date, default: Date.now },
    isLocked: { type: Boolean, default: false }
});
userSchema.index({ phone: 1 });
userSchema.index({ fullName: 'text' });
module.exports = mongoose.model('User', userSchema);