const mongoose = require('mongoose');

const pageContentSchema = new mongoose.Schema({
    hero: {
        title: { type: String, default: 'SALE OFF 50%' },
        subtitle: { type: String, default: 'EXCLUSIVE COLLECTION' },
        description: { type: String, default: 'Nâng tầm phong cách quý ông với những thiết kế Vest thượng lưu.' },
        backgroundImage: { type: String, default: '' }, 
        btnText: { type: String, default: 'Khám Phá Ngay' },
        btnLink: { type: String, default: '/Vest' }
    },

    services: [{
        icon: { type: String, default: '👔' },
        title: String,
        description: String
    }],

    celebSection: {
        title: { type: String, default: 'BINSTUDIO & SAO VIỆT' },
        description: { type: String, default: 'Lựa chọn hàng đầu của các quý ông lịch lãm' },

        items: [{
            name: String,
            image: String
        }]
    },


    contactInfo: {
        address: { type: String, default: '202/2 Huỳnh Văn Bánh...' },
        phone: { type: String, default: '090.xxx.xxxx' },
        email: { type: String, default: 'contact@binstudio.vn' }
    }
});

module.exports = mongoose.model('PageContent', pageContentSchema);