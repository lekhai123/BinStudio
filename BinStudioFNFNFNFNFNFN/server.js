require('dotenv').config();
const orderController = require('./Controller/userOrderController');
if (process.env.NODE_ENV === 'production') {
    console.log = function () { };
    console.info = function () { };
    console.warn = function () { };
    // console.error = function () {}; // Nên giữ lại console.error để biết nếu web bị sập
}
app.post(
    '/api/payos-webhook',
    express.raw({ type: 'application/json' }),
    orderController.payosWebhook
);
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const app = express();
const systemLog = require('./Middleware/log');
const { injectUserData } = require('./Middleware/userMiddleware');
const userSharedRoutes = require('./route/userIndexRoute');
const adminSharedRoutes = require('./route/adminIndexRoute');
const ghnRouter = require('./route/ghnRoute');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo'); // THÊM DÒNG NÀY VÀO ĐÂY
app.set('trust proxy', 1);
const cors = require('cors');
const helmet = require('helmet');
// --- CẤU HÌNH GỬI EMAIL ---

app.use(cors({
    origin: 'https://binstudio.onrender.com', // Domain thật của bạn
    credentials: true
}));
app.use(helmet({
    // ❌ TẮT CHẶN SCRIPT & CSS (CSP)
    // Giúp các nút bấm, icon Zalo, giỏ hàng, style inline chạy bình thường
    contentSecurityPolicy: false,

    // ❌ TẮT CHẶN NHÚNG CHÉO
    // Giúp ảnh Cloudinary và CDN bên thứ 3 load thoải mái
    crossOriginEmbedderPolicy: false,

    // ✅ GIỮ LẠI CÁC BẢO MẬT CƠ BẢN (Không gây lỗi web)
    // 1. Chống Clickjacking (Không cho web khác nhúng web bạn vào iframe)
    frameguard: { action: 'deny' },

    // 2. Chống ép kiểu MIME (Ngăn trình duyệt đoán sai định dạng file)
    noSniff: true,

    // 3. Bảo vệ XSS cơ bản của trình duyệt
    xssFilter: true,

    // 4. Ép buộc dùng HTTPS (Tốt cho SSL)
    hsts: true,

    // 5. Ẩn thông tin server (X-Powered-By: Express) để hacker khó đoán công nghệ
    hidePoweredBy: true,
}));
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

app.use((req, res, next) => {
    req.io = io;
    next();
});
app.use((req, res, next) => {
    console.log(`👉 [REQUEST] ${req.method} ${req.url}`);
    next();
});
io.on('connection', socket => {
    console.log('Admin connected:', socket.id);

    socket.join('admin');
});

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB Atlas Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'view'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'binstudio_secret',
    resave: false,
    saveUninitialized: false, // Để false là đúng để tránh rác DB
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax' // Đổi 'none' thành 'lax' nếu cùng domain
    }
}));
app.use(flash());

app.use(systemLog);
app.use(injectUserData);

app.use('/', userSharedRoutes); 
app.use('/admin',adminSharedRoutes); 

app.use('/', ghnRouter);


// Thay vì fix cứng 3000, hãy để như này:
const PORT = process.env.PORT || 3000;

// 🔥 QUAN TRỌNG: Phải dùng server.listen thay vì app.listen để Socket.io chạy được
server.listen(PORT, () => {
    // Dòng này vẫn sẽ hiện ở máy bạn khi test (development)
    // Nhưng sẽ biến mất hoàn toàn khi bạn set NODE_ENV=production trên Render
    process.stdout.write(`🚀 BinStudio is running on port ${PORT}\n`);
});