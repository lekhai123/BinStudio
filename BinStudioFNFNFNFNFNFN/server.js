require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const app = express();
const systemLog = require('./Middleware/log');
const { injectUserData } = require('./Middleware/userMiddleware');
const userSharedRoutes = require('./route/userIndexRoute');
const adminSharedRoutes = require('./route/adminIndexRoute');
const ghnRouter = require('./Route/ghnRoute');
const flash = require('connect-flash');
const orderController = require('./Controller/userOrderController');


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
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, // Phải đảm bảo biến này là link MongoDB Atlas
        collectionName: 'sessions' // Tên bảng lưu session
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 ngày
        httpOnly: true,
        secure: true // Bật dòng này nếu đã có HTTPS (trên Render thì nên bật, localhost thì tắt)
    }

app.use(flash());

app.use(systemLog);
app.use(injectUserData);

app.use('/', userSharedRoutes); 
app.use('/admin',adminSharedRoutes); 

app.use('/', ghnRouter);


// Thay vì fix cứng 3000, hãy để như này:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
});