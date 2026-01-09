const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, default: 1 },
        size: { type: String }
    }]
});
// Tìm giỏ hàng theo User ID
cartSchema.index({ userId: 1 });
module.exports = mongoose.model('Cart', cartSchema);