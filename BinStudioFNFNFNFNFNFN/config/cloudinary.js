const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cấu hình tài khoản Cloudinary của bạn
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Thiết lập lưu trữ: Hỗ trợ cả ảnh và video
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: 'BinStudio_Products', // Thư mục trên Cloudinary
            resource_type: 'auto',       // Tự động nhận diện ảnh hoặc video
            allowed_formats: ['jpg', 'png', 'mp4', 'mov'],
            transformation: [
                { width: 1000, crop: "limit" }, // Giới hạn kích thước ảnh
                { quality: "auto" },            // Tự động nén để load nhanh
                { fetch_format: "auto" }        // Tự động chuyển sang WebP nếu trình duyệt hỗ trợ
            ]
        };
    },
});

const uploadCloud = multer({ storage });
module.exports = uploadCloud;