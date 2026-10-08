const express = require('express');
const router = express.Router();
const ghnService = require('../Service/ghnService');

// Lấy danh sách Tỉnh
router.get('/api/ghn/provinces', async (req, res) => {
    try {
        const response = await ghnService.getProvinces();
        res.json(response.data);
    } catch (err) {
        // In lỗi chi tiết ra console để kiểm tra
        console.error("Chi tiết lỗi GHN:", err.response ? err.response.data : err.message);
        res.status(500).json({
            message: "Lỗi lấy Tỉnh",
            error: err.response ? err.response.data : err.message
        });
    }
});
// Lấy danh sách Quận theo Tỉnh ID
router.get('/api/ghn/districts/:provinceId', async (req, res) => {
    try {
        const response = await ghnService.getDistricts(req.params.provinceId);
        res.json(response.data);
    } catch (err) { res.status(500).send("Lỗi lấy Quận"); }
});

// Lấy danh sách Phường theo Quận ID
router.get('/api/ghn/wards/:districtId', async (req, res) => {
    try {
        const response = await ghnService.getWards(req.params.districtId);
        res.json(response.data);
    } catch (err) { res.status(500).send("Lỗi lấy Phường"); }


});

module.exports = router;