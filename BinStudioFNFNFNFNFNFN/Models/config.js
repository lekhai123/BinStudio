const mongoose = require('mongoose');
const configSchema = new mongoose.Schema({
    momo: { partnerCode: String, accessKey: String, isEnabled: Boolean },
    vietqr: { bankAccount: String, bankName: String, isEnabled: Boolean },
    ghn: { token: String, shopId: String, isEnabled: Boolean }
});
module.exports = mongoose.model('Config', configSchema);