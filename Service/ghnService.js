require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://online-gateway.ghn.vn/shiip/public-api';

const getHeaders = () => {
    return {
        'Token': process.env.GHN_TOKEN,
        'ShopId': process.env.GHN_SHOP_ID ? parseInt(process.env.GHN_SHOP_ID) : 0,
        'Content-Type': 'application/json'
    };
};

const ghnService = {

    getProvinces: async () => {
        try {
            const response = await axios.get(`${BASE_URL}/master-data/province`, { headers: getHeaders() });
            return response.data;
        } catch (error) {
            console.error("❌ GHN Service Error (Provinces):", error.message);
            return { code: 500, data: [] };
        }
    },

    getDistricts: async (provinceId) => {
        try {
            if (!provinceId || provinceId === 'undefined') return { code: 200, data: [] };
            const response = await axios.get(`${BASE_URL}/master-data/district`, {
                headers: getHeaders(),
                params: { province_id: parseInt(provinceId) }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ GHN Service Error (Districts of ${provinceId}):`, error.message);
            return { code: 500, data: [] };
        }
    },

    getWards: async (districtId) => {
        try {
            if (!districtId || districtId === 'undefined') return { code: 200, data: [] };
            const response = await axios.get(`${BASE_URL}/master-data/ward`, {
                headers: getHeaders(),
                params: { district_id: parseInt(districtId) }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ GHN Service Error (Wards of ${districtId}):`, error.message);
            return { code: 500, data: [] };
        }
    },

    calculateFee: async (data) => {
        try {
            const weight = data.weight || 2000;

            const payload = {
                "service_type_id": 2, 
                "from_district_id": 1454, 
                "to_district_id": parseInt(data.districtId),
                "to_ward_code": data.wardCode.toString(),
                "height": data.height || 10,
                "length": data.length || 30,
                "width": data.width || 20,
                "weight": weight,
                "insurance_value": parseInt(data.orderAmount) || 0
            };

            const response = await axios.post(`${BASE_URL}/v2/shipping-order/fee`, payload, { headers: getHeaders() });
            return response.data;
        } catch (error) {
            console.error("❌ GHN Fee Error:", error.response?.data?.message || error.message);
            return null;
        }
    },

    createOrder: async (orderData, items) => {
        try {
            let totalWeight = 0, maxLength = 0, maxWidth = 0, totalHeight = 0;

            const ghnItems = items.map(item => {
                const qty = parseInt(item.quantity);
                const iWeight = item.weight || 500;
                const iLength = item.length || 30;
                const iWidth = item.width || 20;
                const iHeight = item.height || 10;

                totalWeight += (iWeight * qty);
                totalHeight += (iHeight * qty); 
                if (iLength > maxLength) maxLength = iLength;
                if (iWidth > maxWidth) maxWidth = iWidth;

                return {
                    name: item.name,
                    code: item.productId ? item.productId.toString() : 'CODE',
                    quantity: qty,
                    price: parseInt(item.price),
                    weight: iWeight
                };
            });

            if (totalHeight > 50) totalHeight = 50;
            const date = new Date();
            date.setDate(date.getDate() + 1);
            date.setHours(10, 0, 0, 0);
            const pickTime = Math.floor(date.getTime() / 1000);

            const payload = {
                payment_type_id: 1,
                note: "Cho xem hàng, không thử",
                required_note: "CHOXEMHANGKHONGTHU",
                to_name: orderData.fullName,
                to_phone: orderData.phone,
                to_address: orderData.address,
                to_ward_code: String(orderData.wardCode),
                to_district_id: parseInt(orderData.districtId),
                cod_amount: orderData.isPrepaid ? 0 : parseInt(orderData.totalPrice),
                content: `BinStudio #${orderData.orderCode || ''}`,
                weight: totalWeight || 2000,
                length: maxLength || 30,
                width: maxWidth || 20,
                height: totalHeight || 10,
                service_type_id: 2,
                pick_time: pickTime,
                pick_shift: [1],
                items: ghnItems
            };

            const response = await axios.post(`${BASE_URL}/v2/shipping-order/create`, payload, { headers: getHeaders() });
            return response.data;
        } catch (error) {
            console.error("❌ GHN Create Order Error:", error.response?.data?.message || error.message);
            return null;
        }
    },

    getOrderDetail: async (orderCode) => {
        try {
            const response = await axios.post(
                `${BASE_URL}/v2/shipping-order/detail`,
                { order_code: orderCode },
                { headers: getHeaders() }
            );
            return response.data;
        } catch (error) {
            console.error("❌ GHN Detail Error:", error.message);
            return null;
        }
    }
};

module.exports = ghnService;