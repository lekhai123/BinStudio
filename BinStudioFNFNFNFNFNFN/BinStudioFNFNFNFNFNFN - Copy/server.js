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
    secret: 'binstudio_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(flash());

app.use(systemLog);
app.use(injectUserData);

app.use('/', userSharedRoutes); 
app.use('/admin',adminSharedRoutes); 

app.use('/', ghnRouter);


server.listen(3000, () => {
    console.log('Server running');
});