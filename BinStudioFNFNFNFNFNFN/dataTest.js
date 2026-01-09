/*require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./Models/product');
const Cart = require('./Models/cart');
const Order = require('./Models/order');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        await Product.deleteMany({});
        await Cart.deleteMany({});
        await Order.deleteMany({});
        console.log("🗑️ Đã dọn dẹp dữ liệu cũ.");

        const categories = ['vest', 'quan', 'aosomi', 'aodai', 'phukien'];
        const productsToInsert = [];
        const imageLink = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmTlBeb9V8KAENRylvEDKdnF866qi7EhKACA&s";

        categories.forEach(cat => {
            let variantsData = [];

            // CẤU HÌNH SỐ LƯỢNG CHO TỪNG SIZE
            if (cat === 'vest') {
                // Vest chỉ có Free Size, số lượng 10
                variantsData = [{ size: 'Free Size', stock: 10 }];
            } else if (cat === 'phukien') {
                // Phụ kiện mặc định Free Size hoặc N/A, số lượng 20
                variantsData = [{ size: 'N/A', stock: 20 }];
            } else {
                // Quần, Áo: Chia đều mỗi size 5 cái
                variantsData = [
                    { size: 'S', stock: 5 },
                    { size: 'M', stock: 5 },
                    { size: 'L', stock: 5 }
                ];
            }

            for (let i = 1; i <= 5; i++) {
                productsToInsert.push({
                    name: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Luxury Mẫu ${i}`,
                    price: 2500000,
                    description: `Sản phẩm ${cat} cao cấp.`,
                    category: cat,
                    image: [imageLink, imageLink, imageLink, imageLink, imageLink],
                    // Lưu cấu trúc mới
                    variants: variantsData
                });
            }
        });

        await Product.insertMany(productsToInsert);
        console.log(`✅ Thành công! Đã nạp ${productsToInsert.length} sản phẩm với tồn kho chi tiết theo Size.`);

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
        process.exit();
    }
});*/
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./Models/user');
const bcrypt = require('bcrypt');
async function createAdmin() {
    try {
        // 1. Kết nối - Dùng await trực tiếp thay vì .then() để tránh disconnect sớm
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Đã kết nối MongoDB...");
        
        // 2. Kiểm tra admin tồn tại
        const existingAdmin = await User.findOne({ email: 'admin@binstudio.vn' });
        if (existingAdmin) {
            console.log("Tài khoản admin đã tồn tại!");
            return;
        }
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash('admin123', saltRounds);
        // 3. Khởi tạo đối tượng admin
        const adminUser = new User({
            fullName: 'Quản trị viên BinStudio',
            email: 'admin@binstudio.vn',
            password: hashedPassword,
            phone: '0901234567',
            address: '202/2 Huỳnh Văn Bánh, Phú Nhuận',
            role: 'admin'
        });

        // 4. LƯU DỮ LIỆU: Phải dùng instance.save()
        await adminUser.save();

        console.log("-----------------------------------------");
        console.log("Tạo tài khoản Admin thành công!");
        console.log("Email: admin@binstudio.vn");
        console.log("Pass: admin123");
        console.log("-----------------------------------------");

    } catch (err) {
        console.error("Lỗi khi tạo admin:", err);
    } finally {
        // Chỉ ngắt kết nối khi mọi tác vụ ở trên đã hoàn tất
        await mongoose.disconnect();
        console.log("Đã đóng kết nối database.");
    }
}

createAdmin();