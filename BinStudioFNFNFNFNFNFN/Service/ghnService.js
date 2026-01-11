require('dotenv').config();
const axios = require('axios');

// Chọn Link API (Bật/Tắt comment tùy môi trường)
// const BASE_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api'; // Môi trường Test
const BASE_URL = 'https://online-gateway.ghn.vn/shiip/public-api'; // Môi trường Thật (Production)

const getNextDayPickTime = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1); // Tăng thêm 1 ngày (Ngày mai)

    // Set giờ mong muốn: 10 giờ 00 phút sáng
    // (Bạn có thể đổi thành 14 để lấy chiều)
    date.setHours(14, 0, 0, 0);

    // GHN dùng Unix Timestamp (giây), JS dùng milisecond nên phải chia 1000
    return Math.floor(date.getTime() / 1000);
};

// Hàm lấy Headers (Gọi trong từng request để đảm bảo env đã load & ShopId không bị NaN)
const getHeaders = () => {
    return {
        'Token': process.env.GHN_TOKEN,
        'ShopId': process.env.GHN_SHOP_ID ? parseInt(process.env.GHN_SHOP_ID) : 0, // Fallback về 0 nếu thiếu
        'Content-Type': 'application/json'
    };
};

// --- LOGIC TÍNH CÂN NẶNG & KÍCH THƯỚC ---
const getCategorySpecs = (categoryName, productName) => {
    // Chuyển về chữ thường để so sánh chính xác
    const cat = categoryName ? categoryName.toLowerCase().trim() : 'khac';
    const name = productName ? productName.toLowerCase() : '';

    // 1. Nhóm Đồ bộ / Vest (Nặng nhất, hộp to)
    if (cat === 'vest' || cat.includes('bộ')) {
        return { weight: 1200, l: 35, w: 28, h: 10 };
    }

    // 2. Nhóm Quần hoặc Áo dài (Cần hộp dài hoặc túi lớn)
    if (cat === 'quan' || cat === 'aodai') {
        return { weight: 500, l: 30, w: 20, h: 5 };
    }

    // 3. Nhóm Áo sơ mi (Nhẹ, gấp gọn được)
    if (cat === 'aosomi') {
        return { weight: 300, l: 28, w: 18, h: 4 };
    }

    // 4. Nhóm Phụ kiện (Nhỏ gọn)
    if (cat === 'phukien') {
        // Nếu tên là Giày thì lấy kích thước giày, còn lại lấy kích thước phụ kiện nhỏ
        if (name.includes('giay') || name.includes('giày') || name.includes('boot')) {
            return { weight: 1000, l: 32, w: 22, h: 12 };
        }
        return { weight: 150, l: 15, w: 10, h: 5 };
    }

    // 5. Mặc định an toàn cho các trường hợp khác
    return { weight: 400, l: 25, w: 20, h: 5 };
};
const ghnService = {
    // 1. Lấy danh sách Tỉnh
    getProvinces: async () => {
        try {
            // 
            const response = await axios.get(`${BASE_URL}/master-data/province`, { headers: getHeaders() });
            return response.data;
        } catch (error) {
            console.error("❌ GHN Service Error (Provinces):", error.message);
            // Trả về cấu trúc giả để không làm sập Frontend
            return { code: 500, data: [] };
        }
    },

    // 2. Lấy danh sách Quận (Có kiểm tra ID)
    getDistricts: async (provinceId) => {
        try {
            // Nếu không có ID tỉnh thì không gọi API đỡ lỗi
            if (!provinceId || provinceId === 'undefined') return { code: 200, data: [] };

            const response = await axios.get(`${BASE_URL}/master-data/district`, {
                headers: getHeaders(),
                params: { province_id: parseInt(provinceId) } // Dùng params chuẩn của axios
            });
            return response.data;
        } catch (error) {
            console.error(`❌ GHN Service Error (Districts of ${provinceId}):`, error.message);
            return { code: 500, data: [] };
        }
    },

    // 3. Lấy danh sách Phường/Xã (Có kiểm tra ID)
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

    // 4. Tính phí ship
    calculateFee: async (data) => {
        try {
            const weight = data.weight || 1500;
            const response = await axios.post(`${BASE_URL}/v2/shipping-order/fee`, {
                "service_type_id": 2,
                "from_district_id": 1454, // Sửa thành ID Quận kho hàng của bạn
                "to_district_id": parseInt(data.districtId),
                "to_ward_code": data.wardCode,
                "height": 10, "length": 30, "width": 20,
                "weight": weight,
                "insurance_value": parseInt(data.orderAmount) || 0
            }, { headers: getHeaders() });
            return response.data;
        } catch (error) {
            // Log chi tiết lỗi từ GHN trả về để debug
            console.error("❌ GHN Fee Error:", error.response?.data?.message || error.message);
            return null;
        }
    },

    // 5. Tạo đơn hàng
    createOrder: async (orderData, items) => {
        try {
            let totalWeight = 0, maxLength = 0, maxWidth = 0, totalHeight = 0;

            const ghnItems = items.map(item => {
                const specs = getCategorySpecs(item.category || item.productCategory, item.name || item.productName);
                const qty = parseInt(item.quantity);
                totalWeight += (specs.weight * qty);
                totalHeight += (specs.h * qty);
                if (specs.l > maxLength) maxLength = specs.l;
                if (specs.w > maxWidth) maxWidth = specs.w;

                return {
                    name: item.name || item.productName,
                    code: item.productId ? item.productId.toString() : 'CODE',
                    quantity: qty,
                    price: parseInt(item.price),
                    weight: specs.weight
                };
            });

            if (totalHeight > 50) totalHeight = 50;
            const pickTime = getNextDayPickTime();

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
                weight: totalWeight,
                length: maxLength || 20,
                width: maxWidth || 15,
                height: totalHeight || 10,
                service_type_id: 2,
                pick_time: pickTime,

                // (Tùy chọn) Chọn ca lấy: [1] = Sáng, [2] = Chiều
                // Nếu set pick_time là 10h sáng thì nên để shift là [1]
                pick_shift: [1],
                items: ghnItems
            };
            console.log("📦 Dữ liệu gửi GHN:", JSON.stringify(payload.to_ward_code));
            const response = await axios.post(`${BASE_URL}/v2/shipping-order/create`, payload, { headers: getHeaders() });
            return response.data;
        } catch (error) {
            console.error("❌ GHN Create Order Error:", error.response?.data?.message || error.message);
            return null;
        }
    },

    // 6. Lấy hành trình đơn
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