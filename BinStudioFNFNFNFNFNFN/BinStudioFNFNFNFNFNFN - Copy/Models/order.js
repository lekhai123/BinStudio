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
    paymentStatus: { type: String, enum: ['Paid', 'Unpaid', 'Failed'], default: 'Unpaid' },
    status: {
        type: String,
        default: 'pending',
        enum: [
            'pending',    // Chờ xác nhận / Chờ thanh toán
            'delivering', // Đang giao hàng
            'delivered',  // Giao thành công (Hoàn thành)
            'cancelled'   // Đã hủy
        ]
    },
    payment_info: {
        method: { type: String, default: 'VietQR' },
        status: { type: String, enum: ['unpaid', 'paid', 'partially_paid'], default: 'unpaid' },
        sepay_transaction_id: String, // Lưu ID giao dịch từ SePay để đối soát
        payment_date: Date,
        content: String,              // Nội dung chuyển khoản đã tạo (ví dụ: DH12345)
        amount_paid: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);