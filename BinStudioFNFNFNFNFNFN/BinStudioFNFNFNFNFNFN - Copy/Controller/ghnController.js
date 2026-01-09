exports.checkAndCalculateFee = async (req, res) => {
    const { districtId, wardCode } = req.body;

    try {
        // Gọi API GHN tính phí. 
        // Nếu ID quận hoặc mã phường sai, GHN sẽ trả về lỗi 400 hoặc 404
        const ghnRes = await ghnService.calculateFee({
            districtId,
            wardCode,
            orderAmount: 2000000 // Ví dụ đơn 2 triệu
        });

        res.json({ success: true, fee: ghnRes.data.data.total });
    } catch (err) {
        // Nếu địa chỉ lung tung, GHN sẽ báo lỗi ở đây
        console.error("GHN Error:", err.response.data.message);
        res.status(400).json({
            success: false,
            message: "Địa chỉ không hợp lệ hoặc không được GHN hỗ trợ. Vui lòng kiểm tra lại!"
        });
    }
};