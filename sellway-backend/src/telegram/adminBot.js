const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const TelegramBot = require('node-telegram-bot-api');
const logger = require('../config/logger');
const { query } = require('../config/db');
const notify = require('../services/notify');
const { createTelegramRequestOptions } = require('./proxy');

const telegramToken = process.env.TELEGRAM_ADMIN_BOT_TOKEN;

function disabled() {
  const noop = async () => {};
  const fail = async () => { throw new Error('TELEGRAM_ADMIN_BOT_TOKEN is not configured'); };
  if (require.main === module) setInterval(() => {}, 60 * 60 * 1000);
  return { bot: null, sendToChat: fail, sendSupportMessage: fail, start: noop };
}

if (!telegramToken || telegramToken === 'your_admin_bot_token_from_botfather' || telegramToken.startsWith('your_')) {
  logger.warn('Telegram admin bot disabled: TELEGRAM_ADMIN_BOT_TOKEN is not configured');
  module.exports = disabled();
  return;
}

const pollingEnabled = require.main === module || process.env.TELEGRAM_ADMIN_POLLING === 'true';
const bot = new TelegramBot(telegramToken, {
  polling: false,
  ...createTelegramRequestOptions('Telegram admin bot'),
});

let pollingRetryTimer = null;
const adminChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();

function chatIdOf(msgOrQuery) {
  return msgOrQuery?.message?.chat?.id || msgOrQuery?.chat?.id;
}

function isAdminChat(msgOrQuery) {
  const chatId = chatIdOf(msgOrQuery);
  return Boolean(adminChatId) && String(chatId) === adminChatId;
}

async function rejectIfNotAdmin(msgOrQuery) {
  if (isAdminChat(msgOrQuery)) return false;
  const chatId = chatIdOf(msgOrQuery);
  if (chatId) await bot.sendMessage(chatId, 'Доступ только для администратора.');
  return true;
}

async function startPolling() {
  try {
    if (pollingRetryTimer) {
      clearTimeout(pollingRetryTimer);
      pollingRetryTimer = null;
    }
    if (typeof bot.deleteWebHook === 'function') {
      await bot.deleteWebHook({ drop_pending_updates: false });
    } else if (typeof bot.deleteWebhook === 'function') {
      await bot.deleteWebhook({ drop_pending_updates: false });
    }
    await bot.startPolling({ restart: true });
    const me = await bot.getMe();
    logger.info('Telegram admin bot polling started', { username: me.username, id: me.id });
  } catch (err) {
    logger.error('Telegram admin bot polling start error', { err: err.message });
    pollingRetryTimer = setTimeout(startPolling, 60 * 1000);
  }
}

if (pollingEnabled) {
  startPolling();
  setInterval(() => {}, 60 * 60 * 1000);
} else {
  logger.info('Telegram admin bot client ready');
}

bot.onText(/\/start|\/help/, async (msg) => {
  if (await rejectIfNotAdmin(msg)) return;
  await bot.sendMessage(
    msg.chat.id,
    `SellWay Admin Bot\n\nChat ID: ${msg.chat.id}\n\nКоманды:\n/pending_products - товары и услуги на модерации\n/pending_users - продавцы и фрилансеры на модерации\n/status - статус бота`
  );
});

bot.onText(/\/id/, async (msg) => {
  await bot.sendMessage(msg.chat.id, String(msg.chat.id));
});

bot.onText(/\/status/, async (msg) => {
  if (await rejectIfNotAdmin(msg)) return;
  await bot.sendMessage(msg.chat.id, 'SellWay Admin Bot работает.');
});

bot.onText(/\/pending_products/, async (msg) => {
  if (await rejectIfNotAdmin(msg)) return;
  try {
    const { rows } = await query(
      `SELECT p.id, p.title, p.price, p.delivery_type, u.username, u.role
       FROM products p
       JOIN users u ON u.id=p.seller_id
       WHERE p.status='pending'
       ORDER BY p.created_at ASC
       LIMIT 10`
    );
    if (!rows.length) return bot.sendMessage(msg.chat.id, 'Товаров и услуг на модерации нет.');
    for (const p of rows) {
      await bot.sendMessage(
        msg.chat.id,
        `${p.delivery_type === 'service' ? 'Услуга' : 'Товар'}: ${p.title}\nАвтор: ${p.username} (${p.role})\nЦена: ${Number(p.price).toLocaleString('ru-RU')} ₽`,
        { reply_markup: { inline_keyboard: [[
          { text: 'Одобрить', callback_data: `product:approve:${p.id}` },
          { text: 'Отклонить', callback_data: `product:reject:${p.id}` },
        ]] } }
      );
    }
  } catch (err) {
    logger.error('Admin bot pending products error', { err: err.message });
    bot.sendMessage(msg.chat.id, 'Ошибка загрузки товаров.');
  }
});

bot.onText(/\/pending_users/, async (msg) => {
  if (await rejectIfNotAdmin(msg)) return;
  try {
    const { rows } = await query(
      `SELECT u.id, u.username, u.email, u.role, u.phone_verified, u.telegram_verified,
              s.commercial_application_status
       FROM sellers s
       JOIN users u ON u.id=s.user_id
       WHERE u.role IN ('seller','freelancer')
         AND s.commercial_terms_accepted_at IS NOT NULL
         AND COALESCE(s.commercial_application_status,'not_requested') = 'pending'
       ORDER BY s.commercial_requested_at ASC NULLS LAST, s.created_at ASC
       LIMIT 10`
    );
    if (!rows.length) return bot.sendMessage(msg.chat.id, 'Заявок продавцов и фрилансеров нет.');
    for (const u of rows) {
      await bot.sendMessage(
        msg.chat.id,
        `${u.role === 'freelancer' ? 'Фрилансер' : 'Продавец'}: ${u.username}\nEmail: ${u.email}\nТелефон: ${u.phone_verified ? 'OK' : 'нет'}\nTelegram: ${u.telegram_verified ? 'OK' : 'нет'}\nСтатус: ${u.commercial_application_status || 'not_requested'}`,
        { reply_markup: { inline_keyboard: [[
          { text: 'Одобрить', callback_data: `user:approve:${u.id}` },
          { text: 'Отклонить', callback_data: `user:reject:${u.id}` },
        ]] } }
      );
    }
  } catch (err) {
    logger.error('Admin bot pending users error', { err: err.message });
    bot.sendMessage(msg.chat.id, 'Ошибка загрузки заявок.');
  }
});

bot.onText(/\/reply\s+([0-9a-f-]{8,36})\s+([\s\S]+)/i, async (msg, match) => {
  if (await rejectIfNotAdmin(msg)) return;
  const reference = String(match?.[1] || '').trim();
  const message = String(match?.[2] || '').trim().slice(0, 2000);
  if (!message) return bot.sendMessage(msg.chat.id, 'Формат: /reply ID текст ответа');
  try {
    const { rows } = await query(
      `SELECT st.id, st.user_id
       FROM support_threads st
       WHERE st.status='open' AND CAST(st.id AS TEXT) LIKE $1
       ORDER BY st.updated_at DESC LIMIT 2`,
      [`${reference}%`]
    );
    if (rows.length !== 1) return bot.sendMessage(msg.chat.id, rows.length ? 'Уточните ID диалога полностью.' : 'Диалог не найден.');
    const thread = rows[0];
    await query(
      `INSERT INTO support_messages (thread_id, sender_type, message)
       VALUES ($1,'admin',$2)`,
      [thread.id, message]
    );
    await query('UPDATE support_threads SET updated_at=NOW() WHERE id=$1', [thread.id]);
    await notify.create(thread.user_id, 'system', 'Ответ поддержки', message, null).catch(() => {});
    await bot.sendMessage(msg.chat.id, `Ответ отправлен в диалог ${String(thread.id).slice(0, 8)}.`);
  } catch (err) {
    logger.error('Admin bot support reply error', { err: err.message, reference });
    bot.sendMessage(msg.chat.id, 'Не удалось отправить ответ.');
  }
});

bot.on('callback_query', async (cq) => {
  if (await rejectIfNotAdmin(cq)) return bot.answerCallbackQuery(cq.id).catch(() => {});
  const [entity, action, id] = String(cq.data || '').split(':');
  if (!['product', 'user'].includes(entity) || !['approve', 'reject'].includes(action) || !id) return;
  try {
    if (entity === 'product') {
      const status = action === 'approve' ? 'active' : 'rejected';
      const reason = action === 'reject' ? 'Отклонено администратором в Telegram' : null;
      const { rows: [product] } = await query(
        `UPDATE products
         SET status=$1, reject_reason=$2, moderated_at=NOW()
         WHERE id=$3
         RETURNING id, title, seller_id, delivery_type`,
        [status, reason, id]
      );
      if (!product) throw new Error('Product not found');
      await notify.create(
        product.seller_id,
        'system',
        action === 'approve' ? 'Товар одобрен' : 'Товар отклонен',
        `${product.delivery_type === 'service' ? 'Услуга' : 'Товар'} "${product.title}" ${action === 'approve' ? 'опубликован' : 'отклонен'}.`,
        `/seller/products/${product.id}`
      ).catch(() => {});
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: cq.message.chat.id, message_id: cq.message.message_id }).catch(() => {});
      await bot.sendMessage(cq.message.chat.id, action === 'approve' ? 'Опубликовано.' : 'Отклонено.');
    }

    if (entity === 'user') {
      const approved = action === 'approve';
      const reason = approved ? null : 'Отклонено администратором в Telegram';
      const { rows: [user] } = await query(
        `UPDATE sellers s
         SET verified=$1,
             verified_at=CASE WHEN $1 THEN NOW() ELSE NULL END,
             commercial_application_status=CASE WHEN $1 THEN 'approved' ELSE 'rejected' END,
             commercial_reviewed_at=NOW(),
             commercial_reject_reason=$2,
             updated_at=NOW()
         FROM users u
         WHERE u.id=s.user_id AND s.user_id=$3
           AND (NOT $1 OR s.commercial_terms_accepted_at IS NOT NULL)
         RETURNING u.id, u.username, u.email, u.role`,
        [approved, reason, id]
      );
      if (!user) throw new Error('User not found');
      await notify.create(
        user.id,
        'system',
        approved ? 'Коммерческий аккаунт одобрен' : 'Коммерческий аккаунт отклонен',
        approved ? 'Теперь можно публиковать товары или услуги.' : reason,
        '/seller/products'
      ).catch(() => {});
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: cq.message.chat.id, message_id: cq.message.message_id }).catch(() => {});
      await bot.sendMessage(cq.message.chat.id, approved ? 'Аккаунт одобрен.' : 'Аккаунт отклонен.');
    }
    await bot.answerCallbackQuery(cq.id, { text: 'Готово' });
  } catch (err) {
    logger.error('Admin bot callback error', { err: err.message, data: cq.data });
    await bot.answerCallbackQuery(cq.id, { text: 'Ошибка', show_alert: true }).catch(() => {});
  }
});

async function sendToChat(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    logger.error('adminBot sendToChat error', { chatId, err: err.message });
    throw err;
  }
}

async function sendSupportMessage(threadId, user, message) {
  if (!adminChatId) throw new Error('TELEGRAM_ADMIN_CHAT_ID is not configured');
  const shortId = String(threadId).slice(0, 8);
  const body = String(message).slice(0, 1500);
  await bot.sendMessage(
    adminChatId,
    `Новое сообщение поддержки [${shortId}]\nОт: ${user.username} (${user.email})\n\n${body}\n\nОтвет: /reply ${shortId} текст`
  );
}

bot.on('polling_error', err => logger.error('TG admin polling error', { err: err.message }));
bot.on('error', err => logger.error('TG admin bot error', { err: err.message }));

module.exports = { bot, sendToChat, sendSupportMessage };
