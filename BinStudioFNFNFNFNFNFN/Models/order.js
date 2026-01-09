const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    // 1. Định danh đơn hàng (Cần thiết cho Momo/Bank nội dung CK)
    orderCode: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // 2. Thông tin người nhận
    userInfo: {
        fullName: String,
        phone: String,
        address: String
    },

    // 3. Danh sách sản phẩm (Snapshot dữ liệu lúc mua)
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        price: Number, // Giá tại thời điểm mua
        size: String,
        image: String
    }],

    // 4. Chi tiết tài chính (Mới thêm để hỗ trợ tính ship)
    productTotal: { type: Number, default: 0 }, // Tổng tiền hàng
    shippingFee: { type: Number, default: 0 },  // Phí vận chuyển
    totalPrice: { type: Number, required: true }, // Tổng cộng phải trả

    // 5. Thông tin thanh toán & Vận chuyển
    shippingMethod: { type: String, default: 'GHN' }, // GHN, GHTK
    paymentMethod: { type: String, enum: ['MOMO', 'BANK', 'COD', 'SEPAY', 'PAYOS'], default: 'PAYOS' },
    paymentStatus: { type: String, enum: ['Paid', 'Unpaid', 'Failed', 'Refund'], default: 'Unpaid' },
    status: {
        type: String,
        default: 'pending',
        enum: [
            'NoStatus',
            'pending',    // Chờ xác nhận / Chờ thanh toán
            'delivering', // Đang giao hàng
            'delivered',  // Giao thành công (Hoàn thành)
            'cancelled'   // Đã hủy
        ]
    },
    payment_info: {
        method: { type: String }, // Ví dụ: 'PAYOS'
        status: { type: String }, // Ví dụ: 'Paid'
        amount: { type: Number }, // Số tiền
        date: { type: Date, default: Date.now } // Ngày thanh toán
    },
    createdAt: { type: Date, default: Date.now }
});
// 1. Index mã đơn hàng (Tìm kiếm chính xác đơn hàng)

// 2. Index cho khách hàng xem lịch sử đơn
// Giúp tìm: "Lấy tất cả đơn của user A"
orderSchema.index({ userId: 1, createdAt: -1 }); // -1 để đơn mới nhất hiện trước

// 3. Index cho Admin lọc trạng thái và ngày tháng (Báo cáo doanh thu)
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });

// 4. Index tìm kiếm Admin (Tìm theo SĐT hoặc Tên người nhận)
// MongoDB hỗ trợ index trên field con (nested field)
orderSchema.index({ "userInfo.phone": 1 });
orderSchema.index({ "userInfo.fullName": "text" }); // Tìm tên gần đúng
module.exports = mongoose.model('Order', orderSchema);