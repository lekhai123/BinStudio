const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    category: { type: String },
    image: { type: [String] },
    cloudinary_id: { type: String },

    // THAY ĐỔI LỚN Ở ĐÂY:
    // Thay vì stock và sizes riêng lẻ, ta gộp lại thành 'variants' (biến thể)
    variants: [{
        size: { type: String, required: true }, // Ví dụ: "S", "M", "Free Size"
        stock: { type: Number, default: 0 }     // Số lượng riêng của size đó
    }],
    isHidden: { type: Boolean, default: false },
    isHot: { type: Boolean, default: false },

    weight: { type: Number, default: 500 },

    // Kích thước đóng gói: Dài - Rộng - Cao (cm)
    // GHN sẽ tính cước theo: Max(Khối lượng thực, Khối lượng quy đổi từ kích thước)
    length: { type: Number, default: 30 }, // Dài 30cm
    width: { type: Number, default: 20 }, // Rộng 20cm
    height: { type: Number, default: 10 } // Cao 10cm
});

// Tạo một thuộc tính ảo (virtual) để tính TỔNG tồn kho hiển thị ra ngoài danh sách
productSchema.virtual('totalStock').get(function () {
    return this.variants.reduce((total, variant) => total + variant.stock, 0);
});
// 1. Index tìm kiếm văn bản (Full-text Search) cho thanh tìm kiếm
// Giúp tìm theo tên sản phẩm nhanh hơn dùng Regex
productSchema.index({ name: 'text', description: 'text' });

// 2. Index cho trang danh mục (Category)
// Giúp lọc sản phẩm theo danh mục cực nhanh
productSchema.index({ category: 1 });

// 3. Index tổng hợp (Compound Index) cho bộ lọc nâng cao
// Ví dụ: Tìm sản phẩm thuộc category 'vest', giá từ thấp đến cao, và đang hiện (isHidden: false)
productSchema.index({ category: 1, price: 1, isHidden: 1 });

// 4. Index cho sản phẩm nổi bật (Trang chủ thường gọi cái này)
productSchema.index({ isHot: 1, isHidden: 1 });

module.exports = mongoose.model('Product', productSchema);