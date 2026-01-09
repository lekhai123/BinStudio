const mongoose = require('mongoose');

const pageContentSchema = new mongoose.Schema({
    // 1. Cấu hình Hero Banner (Phần ảnh to đầu trang)
    hero: {
        title: { type: String, default: 'SALE OFF 50%' },
        subtitle: { type: String, default: 'EXCLUSIVE COLLECTION' },
        description: { type: String, default: 'Nâng tầm phong cách quý ông với những thiết kế Vest thượng lưu.' },
        backgroundImage: { type: String, default: '' }, // Link ảnh nền
        btnText: { type: String, default: 'Khám Phá Ngay' },
        btnLink: { type: String, default: '/Vest' }
    },

    // 2. Cấu hình Dịch vụ (3 ô tròn bên dưới banner)
    services: [{
        icon: { type: String, default: '👔' }, // Có thể là emoji hoặc class FontAwesome
        title: String,
        description: String
    }],

    // 3. Cấu hình Celebs (Người nổi tiếng)
    celebSection: {
        title: { type: String, default: 'BINSTUDIO & SAO VIỆT' },
        description: { type: String, default: 'Lựa chọn hàng đầu của các quý ông lịch lãm' },

        // Items bên trong mới là mảng []
        items: [{
            name: String,
            image: String
        }]
    },


    // 4. Các thông tin khác (Footer, LH...) - Để mở rộng sau này
    contactInfo: {
        address: { type: String, default: '202/2 Huỳnh Văn Bánh...' },
        phone: { type: String, default: '090.xxx.xxxx' },
        email: { type: String, default: 'contact@binstudio.vn' }
    }
});

module.exports = mongoose.model('PageContent', pageContentSchema);