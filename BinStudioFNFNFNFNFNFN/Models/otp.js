const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        index: true
    },
    code: {
        type: String,
        required: true
    },
    purpose: {
        type: String,
        enum: ['REGISTER', 'RESET_PASSWORD'],
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    ip: String,
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // TTL index
    }
}, { timestamps: true });

module.exports = mongoose.model('OTP', otpSchema);
