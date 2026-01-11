const TelegramBot = require('node-telegram-bot-api');
const Order = require('../Models/order');
const Product = require('../Models/product');
const ghnService = require('../Service/ghnService'); // Đảm bảo đúng đường dẫn

// --- CẤU HÌNH ---
const TOKEN = '7810306977:AAFxF1enf-aWMYZ2XkZ3IimeUwVX702EQ8M';
const ADMIN_CHAT_ID = '-5281750489';

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("🤖 Bot Telegram: Chế độ An Toàn & Local Ship");

// --- 1. HÀM TẠO BÀN PHÍM ĐỘNG ---
function getKeyboard(order, mode = 'MAIN') {
    const buttons = [];
    const isPaid = order.paymentStatus === 'Paid';
    const isGHN = order.shippingMethod === 'GHN';

    // --- CHẾ ĐỘ XÁC NHẬN ---
    if (mode === 'ASK_REFUND') {
        return {
            inline_keyboard: [
                [{ text: "⚠️ BẠN CHẮC CHẮN HOÀN TIỀN?", callback_data: 'NO_ACTION' }],
                [
                    { text: "✅ ĐỒNG Ý", callback_data: `DO_REFUND_${order._id}` },
                    { text: "🔙 Quay lại", callback_data: `BACK_MAIN_${order._id}` }
                ]
            ]
        };
    }
    if (mode === 'ASK_CANCEL') {
        return {
            inline_keyboard: [
                [{ text: "⚠️ CHẮC CHẮN HỦY ĐƠN?", callback_data: 'NO_ACTION' }],
                [
                    { text: "❌ HỦY NGAY", callback_data: `DO_CANCEL_${order._id}` },
                    { text: "🔙 Quay lại", callback_data: `BACK_MAIN_${order._id}` }
                ]
            ]
        };
    }
    if (mode === 'ASK_FAIL_LOCAL') {
        return {
            inline_keyboard: [
                [{ text: "⚠️ KHÁCH TRẢ HÀNG - XỬ LÝ TIỀN?", callback_data: 'NO_ACTION' }],
                // Lựa chọn 2: Hoàn kho + Hoàn tiền (Paid)
                [{ text: "💸 Hoàn Kho + Hoàn Tiền", callback_data: `DO_FAIL_REFUND_${order._id}` }],
                // Quay lại
                [{ text: "🔙 Quay lại", callback_data: `BACK_MAIN_${order._id}` }]
            ]
        };
    }
    // --- CHẾ ĐỘ CHÍNH ---
    // A. Pending
    if (order.status === 'Pending') {
        buttons.push([{ text: "✅ Xác nhận đơn", callback_data: `CONFIRM_${order._id}` }]);
        buttons.push(isPaid
            ? [{ text: "💸 Yêu cầu Hoàn tiền", callback_data: `ASK_REFUND_${order._id}` }]
            : [{ text: "❌ Yêu cầu Hủy", callback_data: `ASK_CANCEL_${order._id}` }]
        );
    }
    // B. Confirmed
    else if (order.status === 'Confirmed') {
        buttons.push([{ text: "📦 Đóng gói ngay", callback_data: `PACK_${order._id}` }]);
        buttons.push(isPaid
            ? [{ text: "💸 Yêu cầu Hoàn tiền", callback_data: `ASK_REFUND_${order._id}` }]
            : [{ text: "❌ Yêu cầu Hủy", callback_data: `ASK_CANCEL_${order._id}` }]
        );
    }
    // C. Processing
    else if (order.status === 'Processing') {
        if (isGHN) {
            if (!order.ghn_order_code) {
                buttons.push([{ text: "🚚 Tạo đơn GHN ngay", callback_data: `CREATE_GHN_${order._id}` }]);
            } else {
                buttons.push([{ text: "🖨️ (Đã có mã GHN)", callback_data: "NO_ACTION" }]);
            }
        } else {
            buttons.push([{ text: "🛵 Bắt đầu đi giao (Local)", callback_data: `START_LOCAL_${order._id}` }]);
        }

        buttons.push(isPaid
            ? [{ text: "💸 Yêu cầu Hoàn tiền", callback_data: `ASK_REFUND_${order._id}` }]
            : [{ text: "❌ Yêu cầu Hủy", callback_data: `ASK_CANCEL_${order._id}` }]
        );
    }
    // D. Shipping (Local only)
    else if (order.status === 'Shipping' && !isGHN) {
        buttons.push([{ text: "✅ Khách đã nhận (Hoàn thành)", callback_data: `FINISH_LOCAL_${order._id}` }]);
        buttons.push([{ text: "↩️ Khách trả hàng (Thất bại)", callback_data: `FAIL_LOCAL_${order._id}` }]);
    }

    return { inline_keyboard: buttons };
}

// --- 2. GỬI TIN NHẮN MỚI ---
const sendOrderNotify = async (order) => {
    try {
        if (!ADMIN_CHAT_ID) {
            console.error("⚠️ CHƯA CẤU HÌNH ADMIN_CHAT_ID CHO TELEGRAM!");
            return;
        }

        const isPaid = order.paymentStatus === 'Paid';
        const paymentText = isPaid ? '✅ DA THANH TOAN' : '❌ COD / CHUA TRA';

        const message = `🚨 DON HANG MOI: #${order.orderCode}\n` +
            `-----------------------------\n` +
            `👤 Khach: ${order.userInfo.fullName}\n` +
            `📞 SDT: ${order.userInfo.phone}\n` +
            `🏠 DC: ${order.userInfo.address}\n` +
            `💰 Tong: ${order.totalPrice.toLocaleString('vi-VN')}d\n` +
            `💳 TT: ${paymentText}\n` +
            `🚚 Status: ${order.status.toUpperCase()}\n` +
            `🛵 Ship: ${order.shippingMethod}\n` +
            `-----------------------------\n` +
            `👇 XU LY DON HANG 👇`;

        await bot.sendMessage(ADMIN_CHAT_ID, message, {
            reply_markup: getKeyboard(order)
        });
    } catch (error) { console.error("Lỗi gửi Tele:", error.message); }
};

// --- 3. XỬ LÝ SỰ KIỆN BẤM NÚT ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id; // Dùng thống nhất biến chatId
    const messageId = query.message.message_id;
    const data = query.data;

    // Parse Data
    const lastIndex = data.lastIndexOf('_');
    const action = data.substring(0, lastIndex);
    const orderId = data.substring(lastIndex + 1);

    if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
    if (action === 'NO_ACTION') return bot.answerCallbackQuery(query.id);

    try {
        const order = await Order.findById(orderId);
        if (!order) return bot.answerCallbackQuery(query.id, { text: "❌ Không tìm thấy đơn!", show_alert: true });

        let notifyText = "";
        let shouldUpdateDB = false;
        let shouldRestock = false;

        // ================= XỬ LÝ LOGIC =================

        // 1. NHÓM ĐIỀU HƯỚNG
        if (action === 'ASK_REFUND') {
            bot.editMessageReplyMarkup(getKeyboard(order, 'ASK_REFUND'), { chat_id: chatId, message_id: messageId });
            return;
        }
        if (action === 'ASK_CANCEL') {
            bot.editMessageReplyMarkup(getKeyboard(order, 'ASK_CANCEL'), { chat_id: chatId, message_id: messageId });
            return;
        }
        if (action === 'ASK_FAIL_LOCAL') return bot.editMessageReplyMarkup(getKeyboard(order, 'ASK_FAIL_LOCAL'), { chat_id: chatId, message_id: messageId });
        if (action === 'BACK_MAIN') return bot.editMessageReplyMarkup(getKeyboard(order, 'MAIN'), { chat_id: chatId, message_id: messageId });

        // 2. NHÓM THỰC THI
        if (action === 'CONFIRM') {
            if (order.status === 'Pending') { order.status = 'Confirmed'; shouldUpdateDB = true; notifyText = "✅ Đã xác nhận!"; }
        }
        else if (action === 'PACK') {
            if (['Pending', 'Confirmed'].includes(order.status)) { order.status = 'Processing'; shouldUpdateDB = true; notifyText = "📦 Đang đóng gói..."; }
        }

        // 3. GHN
        else if (action === 'CREATE_GHN') {
            if (order.status !== 'Processing') return bot.answerCallbackQuery(query.id, { text: "⚠️ Sai trạng thái!", show_alert: true });
            if (order.ghn_order_code) return bot.answerCallbackQuery(query.id, { text: "⚠️ Đã có mã rồi!", show_alert: true });

            bot.answerCallbackQuery(query.id, { text: "⏳ Đang gọi GHN..." });

            const ghnRes = await ghnService.createOrder({
                ...order.userInfo, totalPrice: order.totalPrice, isPrepaid: order.paymentStatus === 'Paid', orderCode: order.orderCode
            }, order.items);

            if (ghnRes && ghnRes.code === 200) {
                order.ghn_order_code = ghnRes.data.order_code;
                order.expected_delivery_time = ghnRes.data.expected_delivery_time;
                order.status = 'Shipping';
                shouldUpdateDB = true;
                notifyText = `✅ Mã GHN: ${ghnRes.data.order_code}`;
            } else {
                return bot.sendMessage(chatId, `❌ Lỗi GHN: ${ghnRes.message || 'Không xác định'}`);
            }
        }

        // 4. LOCAL SHIP
        else if (action === 'START_LOCAL') {
            if (order.status === 'Processing') { order.status = 'Shipping'; shouldUpdateDB = true; notifyText = "🛵 Bắt đầu đi giao!"; }
        }
        else if (action === 'FINISH_LOCAL') {
            if (order.status === 'Shipping') {
                order.status = 'Completed';
                if (order.paymentMethod === 'COD') {
                    order.paymentStatus = 'Paid';
                    order.payment_info = { method: 'COD_LOCAL', status: 'Paid', date: new Date() };
                }
                shouldUpdateDB = true;
                notifyText = "✅ Đơn Local đã giao xong!";
            }
        }
        else if (action === 'DO_FAIL_REFUND') {
            if (order.status === 'Shipping') {
                order.status = 'Returned';
                order.paymentStatus = 'Refund'; // Đánh dấu đã trả tiền khách
                shouldUpdateDB = true;
                shouldRestock = true; // Cộng lại kho
                notifyText = "💸 Đã hoàn hàng & Hoàn tiền.";
            }
        }

        // 5. HỦY / HOÀN TIỀN
        else if (action === 'DO_REFUND' || action === 'DO_CANCEL') {
            if (!['Cancelled', 'Returned'].includes(order.status)) {
                if (order.ghn_order_code) bot.sendMessage(chatId, `⚠️ Nhớ hủy đơn trên App GHN: ${order.ghn_order_code}`);
                order.status = 'Cancelled';
                if (action === 'DO_REFUND') order.paymentStatus = 'Refund';
                shouldUpdateDB = true;
                shouldRestock = true;
                notifyText = "❌ Đã xử lý Hủy/Hoàn tiền.";
            }
        }

        // ================= CẬP NHẬT =================
        if (shouldUpdateDB) {
            await order.save();

            if (shouldRestock) {
                for (const item of order.items) {
                    const prod = await Product.findById(item.productId);
                    if (prod) {
                        const v = prod.variants.find(v => v.size === item.size);
                        if (v) { v.stock += item.quantity; await prod.save(); }
                    }
                }
            }

            bot.answerCallbackQuery(query.id, { text: notifyText });

            const isPaid = order.paymentStatus === 'Paid';
            const paymentText = order.paymentStatus === 'Refund' ? '⚠️ DA HOAN TIEN' : (isPaid ? '✅ DA THANH TOAN' : '❌ COD');

            let extraLine = '';
            if (order.ghn_order_code) extraLine = `📦 GHN CODE: <b>${order.ghn_order_code}</b>\n`;
            if (order.shippingMethod === 'LOCAL') extraLine = `🛵 Giao hang noi bo (Local)\n`;

            const newMessage = `🚨 DON HANG #${order.orderCode}\n` +
                `-----------------------------\n` +
                `👤 Khach: ${order.userInfo.fullName}\n` +
                `📞 SDT: ${order.userInfo.phone}\n` +
                `🏠 DC: ${order.userInfo.address}\n` +
                `💰 Tong: ${order.totalPrice.toLocaleString('vi-VN')}d\n` +
                `💳 TT: ${paymentText}\n` +
                `🔄 Status: ${order.status.toUpperCase()}\n` +
                `${extraLine}` +
                `-----------------------------\n` +
                `👇 TIEP TUC XU LY 👇`;

            // 🔥 SỬA QUAN TRỌNG: Dùng chat_id (có gạch dưới)
            bot.editMessageText(newMessage, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getKeyboard(order)
            });
        }
        else {
            bot.answerCallbackQuery(query.id, { text: "⚠️ Trạng thái đã thay đổi" });
            // 🔥 SỬA QUAN TRỌNG: Dùng chat_id (có gạch dưới)
            bot.editMessageReplyMarkup(getKeyboard(order), { chat_id: chatId, message_id: messageId });
        }

    } catch (e) {
        console.error("Bot Error:", e);
        bot.answerCallbackQuery(query.id, { text: "Lỗi hệ thống" });
    }
});

bot.on("polling_error", console.log); // Log lỗi polling nếu có

module.exports = { sendOrderNotify };