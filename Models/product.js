const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    category: { type: String },
    image: { type: [String] },
    cloudinary_id: { type: String },

    variants: [{
        size: { type: String, required: true }, 
        stock: { type: Number, default: 0 }    
    }],
    isHidden: { type: Boolean, default: false },
    isHot: { type: Boolean, default: false },

    weight: { type: Number, default: 500 },
    length: { type: Number, default: 30 }, 
    width: { type: Number, default: 20 }, 
    height: { type: Number, default: 10 } 
});
productSchema.virtual('totalStock').get(function () {
    return this.variants.reduce((total, variant) => total + variant.stock, 0);
});
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ category: 1, price: 1, isHidden: 1 });
productSchema.index({ isHot: 1, isHidden: 1 });

module.exports = mongoose.model('Product', productSchema);