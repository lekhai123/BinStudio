const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: 'BinStudio_Products', 
            resource_type: 'auto',       
            allowed_formats: ['jpg', 'png', 'mp4', 'mov'],
            transformation: [
                { width: 1000, crop: "limit" }, 
                { quality: "auto" },           
                { fetch_format: "auto" }        
            ]
        };
    },
});

const uploadCloud = multer({ storage });
module.exports = uploadCloud;