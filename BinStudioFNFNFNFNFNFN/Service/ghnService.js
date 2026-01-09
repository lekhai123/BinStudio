require('dotenv').config();
const axios = require('axios');

const ghnUrl = 'https://online-gateway.ghn.vn/shiip/public-api';
const headers = {
    'Token': process.env.GHN_TOKEN,
    'ShopId': parseInt(process.env.GHN_SHOP_ID),
    'Content-Type': 'application/json'
};

const ghnService = {
    // 1. Lấy danh sách Tỉnh/Thành
    getProvinces: async () => {
        return axios.get(`${ghnUrl}/master-data/province`, { headers });
    },

    // 2. Lấy danh sách Quận/Huyện theo ProvinceID
    getDistricts: async (provinceId) => {
        return axios.get(`${ghnUrl}/master-data/district?province_id=${provinceId}`, { headers });
    },

    // 3. Lấy danh sách Phường/Xã theo DistrictID
    getWards: async (districtId) => {
        return axios.get(`${ghnUrl}/master-data/ward?district_id=${districtId}`, { headers });
    },

    // 4. Tính phí ship thật (Cho hàng Vest mặc định ~1.5kg)
    calculateFee: async (data) => {
        return axios.post(`${ghnUrl}/shipping-order/fee`, {
            "service_type_id": 2, // Giao hàng chuẩn
            "from_district_id": 1454, // ID Quận của Shop bạn (Ví dụ: Quận 12)
            "to_district_id": parseInt(data.districtId),
            "to_ward_code": data.wardCode,
            "height": 10, "length": 40, "weight": 1500, "width": 30, // Kích thước hộp Vest
            "insurance_value": data.orderAmount // Bảo hiểm hàng giá trị cao
        }, { headers });
    },

    // 5. Tạo đơn hàng thật lên hệ thống GHN
    createOrder: async (orderData) => {
        return axios.post(`${ghnUrl}/shipping-order/create`, orderData, { headers });
    }
};

module.exports = ghnService;