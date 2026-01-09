const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    category: { type: String, enum: ['vest', 'quan', 'aosomi', 'aodai', 'phukien'] },
    image: { type: [String] },
    cloudinary_id: { type: String },

    // THAY ĐỔI LỚN Ở ĐÂY:
    // Thay vì stock và sizes riêng lẻ, ta gộp lại thành 'variants' (biến thể)
    variants: [{
        size: { type: String, required: true }, // Ví dụ: "S", "M", "Free Size"
        stock: { type: Number, default: 0 }     // Số lượng riêng của size đó
    }],
    isHidden: { type: Boolean, default: false },
    isHot: { type: Boolean, default: false }
});

// Tạo một thuộc tính ảo (virtual) để tính TỔNG tồn kho hiển thị ra ngoài danh sách
productSchema.virtual('totalStock').get(function () {
    return this.variants.reduce((total, variant) => total + variant.stock, 0);
});

module.exports = mongoose.model('Product', productSchema);