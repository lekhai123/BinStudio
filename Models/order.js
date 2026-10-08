const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    // 1. Định danh đơn hàng (Cần thiết cho Momo/Bank nội dung CK)
    orderCode: { type: String, required: true, unique: true },
    ghn_order_code: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // 2. Thông tin người nhận
    userInfo: {
        fullName: String,
        phone: String,
        address: String,
        provinceId: Number,
        districtId: Number, 
        wardCode: String   
    },

    // 3. Danh sách sản phẩm (Snapshot dữ liệu lúc mua)
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        price: Number, 
        size: String,
        image: String
    }],

    // 4. Chi tiết tài chính (để hỗ trợ tính ship)
    productTotal: { type: Number, default: 0 }, 
    shippingFee: { type: Number, default: 0 }, 
    totalPrice: { type: Number, required: true }, 

    // 5. Thông tin thanh toán & Vận chuyển
    shippingMethod: { type: String, default: 'GHN' }, // GHN, GHTK
    paymentMethod: { type: String, enum: ['MOMO', 'BANK', 'COD', 'SEPAY', 'PAYOS'], default: 'PAYOS' },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Unpaid', 'Failed', 'Refund', 'Partially_Paid'],
        default: 'Unpaid'
    },
    status: {
        type: String,
        default: 'Pending',
        enum: [
            'Pending',   
            'Confirmed',   
            'Processing', 
            'Shipping',    
            'Completed',    
            'Cancelled',    
            'Returned'      
        ]
    },
    trackingLogs: [
        {
            status: String,      
            action_at: Date,   
            note: String        
        }
    ],
    payment_info: {
        method: { type: String },
        status: { type: String },
        paidAmount: Number,     
        remainingAmount: Number, 
        amount: { type: Number },
        isOverpaid: Boolean,   
        note: String,            
        date: { type: Date, default: Date.now }
    },

}, {
    timestamps: true
});
orderSchema.index({ userId: 1, createdAt: -1 }); 
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ "userInfo.phone": 1 });
orderSchema.index({ "userInfo.fullName": "text" }); 
module.exports = mongoose.model('Order', orderSchema);