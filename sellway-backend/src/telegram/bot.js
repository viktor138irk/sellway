const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../config/db');
const notify = require('../services/notify');
const logger = require('../config/logger');
const { createTelegramRequestOptions } = require('./proxy');
const { assertCommercialAccess } = require('../services/commercialAccess');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramToken || telegramToken === 'your_bot_token_from_botfather' || telegramToken.startsWith('your_')) {
  logger.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN is not configured');
  const noop = async () => {};
  if (require.main === module) setInterval(() => {}, 60 * 60 * 1000);
  module.exports = { bot: null, sendToUser: noop, sendToChat: noop };
  return;
}

const pollingEnabled = require.main === module || process.env.TELEGRAM_POLLING === 'true';
const bot = new TelegramBot(telegramToken, {
  polling: false,
  ...createTelegramRequestOptions('Telegram user bot'),
});
const drafts = new Map();
let pollingRetryTimer = null;

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
    logger.info('Telegram bot polling started', { username: me.username, id: me.id });
  } catch (err) {
    logger.error('Telegram bot polling start error', { err: err.message });
    pollingRetryTimer = setTimeout(startPolling, 60 * 1000);
  }
}

if (pollingEnabled) {
  startPolling();
  setInterval(() => {}, 60 * 60 * 1000);
} else {
  logger.info('Telegram bot client ready');
}

async function getUserByChatId(chatId) {
  const { rows } = await query(
    `SELECT u.*, tu.notifications_enabled
     FROM telegram_users tu JOIN users u ON u.id=tu.user_id
     WHERE tu.telegram_id=$1`,
    [chatId]
  );
  return rows[0] || null;
}

async function getTelegramUser(userId) {
  const { rows } = await query('SELECT telegram_id, notifications_enabled FROM telegram_users WHERE user_id=$1', [userId]);
  return rows[0] || null;
}

const fmt = value => `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽`;
const isCommercialRole = role => ['seller', 'freelancer', 'admin'].includes(role);

function mainKb(role) {
  const rows = role === 'seller'
    ? [['Баланс', 'Мои товары'], ['Добавить товар']]
    : role === 'freelancer'
      ? [['Баланс', 'Мои услуги'], ['Добавить услугу']]
      : role === 'admin'
        ? [['Баланс', 'Мои товары'], ['Добавить товар', 'Добавить услугу']]
        : [['Мои покупки']];
  rows.push(['Помощь']);
  return { reply_markup: { keyboard: rows.map(row => row.map(text => ({ text }))), resize_keyboard: true } };
}

async function requireLinkedUser(chatId) {
  const user = await getUserByChatId(chatId);
  if (!user) await bot.sendMessage(chatId, 'Сначала привяжите аккаунт через настройки сайта и команду /start.');
  return user;
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match?.[1]?.trim();
  try {
    const existing = await getUserByChatId(chatId);
    if (existing && !token) {
      return bot.sendMessage(chatId, `Привет, ${existing.username}. Аккаунт уже привязан.`, mainKb(existing.role));
    }
    if (!token) {
      return bot.sendMessage(chatId, 'Откройте настройки Telegram на sellway.pro, получите ссылку привязки и перейдите по ней.');
    }
    const { rows: [user] } = await query(
      `SELECT id, username, role FROM users
       WHERE telegram_link_token=$1
       AND (telegram_link_expires IS NULL OR telegram_link_expires > NOW())`,
      [token]
    );
    if (!user) return bot.sendMessage(chatId, 'Ссылка привязки недействительна или истекла. Создайте новую на сайте.');
    await query(
      `INSERT INTO telegram_users (user_id, telegram_id, username)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET telegram_id=$2, username=$3, notifications_enabled=TRUE`,
      [user.id, chatId, msg.from.username || null]
    );
    await query('UPDATE users SET telegram_link_token=NULL, telegram_link_expires=NULL, telegram_verified=TRUE WHERE id=$1', [user.id]);
    await bot.sendMessage(chatId, `Аккаунт ${user.username} привязан. Уведомления включены.`, mainKb(user.role));
    logger.info('Telegram linked', { userId: user.id, chatId });
  } catch (err) {
    logger.error('Bot /start error', { err: err.message });
    bot.sendMessage(chatId, 'Ошибка привязки. Попробуйте позже.');
  }
});

bot.onText(/\/balance|^Баланс$/, async (msg) => {
  const user = await requireLinkedUser(msg.chat.id);
  if (!user) return;
  try {
    const { rows: [wallet] } = await query('SELECT balance, held, total_in FROM wallets WHERE user_id=$1', [user.id]);
    const { rows: [seller] } = await query('SELECT total_sales, rating FROM sellers WHERE user_id=$1', [user.id]);
    await bot.sendMessage(
      msg.chat.id,
      `Баланс\n\nДоступно: ${fmt(wallet?.balance)}\nЗаморожено: ${fmt(wallet?.held)}\nПолучено всего: ${fmt(wallet?.total_in)}\nПродаж: ${seller?.total_sales || 0}\nРейтинг: ${seller?.rating || '-'}`
    );
  } catch (err) {
    logger.error('Bot balance error', { err: err.message });
    bot.sendMessage(msg.chat.id, 'Не удалось загрузить баланс.');
  }
});

bot.onText(/\/orders|^Мои покупки$|^Мои товары$|^Мои услуги$/, async (msg) => {
  const user = await requireLinkedUser(msg.chat.id);
  if (!user) return;
  try {
    const sellerView = isCommercialRole(user.role) && msg.text !== 'Мои покупки';
    const field = sellerView ? 'seller_id' : 'buyer_id';
    const { rows } = await query(
      `SELECT o.order_number, o.status, o.amount, p.title
       FROM orders o JOIN products p ON p.id=o.product_id
       WHERE o.${field}=$1 ORDER BY o.created_at DESC LIMIT 5`,
      [user.id]
    );
    if (!rows.length) return bot.sendMessage(msg.chat.id, 'Заказов пока нет.');
    const text = rows.map(o => `${o.order_number}: ${o.title.slice(0, 48)}\n${fmt(o.amount)} / ${o.status}`).join('\n\n');
    bot.sendMessage(msg.chat.id, text);
  } catch (err) {
    logger.error('Bot orders error', { err: err.message });
    bot.sendMessage(msg.chat.id, 'Не удалось загрузить заказы.');
  }
});

async function beginOfferDraft(msg, deliveryType) {
  const chatId = msg.chat.id;
  const user = await requireLinkedUser(chatId);
  if (!user) return;
  const allowedRole = deliveryType === 'service' ? ['freelancer', 'admin'] : ['seller', 'admin'];
  if (!allowedRole.includes(user.role)) {
    return bot.sendMessage(chatId, deliveryType === 'service' ? 'Публиковать услуги может только фрилансер.' : 'Публиковать товары может только продавец.');
  }
  const access = await assertCommercialAccess(user, deliveryType);
  if (!access.ok) return bot.sendMessage(chatId, access.error);
  const categoryType = deliveryType === 'service' ? 'service' : 'product';
  const { rows } = await query(
    `SELECT id, name FROM categories
     WHERE category_type=$1 AND is_active=TRUE
     ORDER BY parent_id NULLS FIRST, sort_order, name
     LIMIT 30`,
    [categoryType]
  );
  if (!rows.length) return bot.sendMessage(chatId, 'Нет доступных категорий. Обратитесь к администратору.');
  drafts.set(String(chatId), { userId: user.id, deliveryType, step: 'category' });
  const keyboard = rows.map(category => [{ text: category.name, callback_data: `draftcat:${category.id}` }]);
  return bot.sendMessage(chatId, 'Выберите категорию:', { reply_markup: { inline_keyboard: keyboard } });
}

bot.onText(/\/new_product|^Добавить товар$/, msg => beginOfferDraft(msg, 'manual').catch(err => logger.error('Bot new product error', { err: err.message })));
bot.onText(/\/new_service|^Добавить услугу$/, msg => beginOfferDraft(msg, 'service').catch(err => logger.error('Bot new service error', { err: err.message })));

bot.on('callback_query', async cq => {
  if (!String(cq.data || '').startsWith('draftcat:')) return;
  const draft = drafts.get(String(cq.message.chat.id));
  if (!draft || draft.step !== 'category') return bot.answerCallbackQuery(cq.id, { text: 'Создайте новую публикацию еще раз' });
  draft.categoryId = cq.data.slice('draftcat:'.length);
  draft.step = 'title';
  drafts.set(String(cq.message.chat.id), draft);
  await bot.answerCallbackQuery(cq.id);
  await bot.sendMessage(cq.message.chat.id, 'Введите название (не менее 5 символов):');
});

bot.on('message', async msg => {
  const text = String(msg.text || '').trim();
  if (!text || text.startsWith('/')) return;
  const key = String(msg.chat.id);
  const draft = drafts.get(key);
  if (!draft || ['Добавить товар', 'Добавить услугу'].includes(text)) return;
  try {
    if (draft.step === 'title') {
      if (text.length < 5) return bot.sendMessage(msg.chat.id, 'Название должно быть не короче 5 символов.');
      draft.title = text.slice(0, 255);
      draft.step = 'price';
      drafts.set(key, draft);
      return bot.sendMessage(msg.chat.id, 'Введите стоимость в рублях:');
    }
    if (draft.step === 'price') {
      const price = Number(text.replace(',', '.'));
      if (!Number.isFinite(price) || price < 1) return bot.sendMessage(msg.chat.id, 'Введите корректную сумму больше нуля.');
      draft.price = price;
      draft.step = 'description';
      drafts.set(key, draft);
      return bot.sendMessage(msg.chat.id, 'Введите описание или отправьте "-" без описания:');
    }
    if (draft.step === 'description') {
      const { rows: [product] } = await query(
        `INSERT INTO products (seller_id, category_id, title, description, short_desc, price, delivery_type, guarantee_days, tags, meta, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,'{}',$8::jsonb,'pending')
         RETURNING *`,
        [
          draft.userId,
          draft.categoryId,
          draft.title,
          text === '-' ? '' : text,
          text === '-' ? '' : text.slice(0, 240),
          draft.price,
          draft.deliveryType,
          JSON.stringify(draft.deliveryType === 'service' ? { service: true, service_price_mode: 'from' } : {}),
        ]
      );
      drafts.delete(key);
      await notify.adminNewProduct(product).catch(() => {});
      return bot.sendMessage(msg.chat.id, `${draft.deliveryType === 'service' ? 'Услуга' : 'Товар'} отправлен на модерацию.`);
    }
  } catch (err) {
    drafts.delete(key);
    logger.error('Bot draft save error', { err: err.message });
    bot.sendMessage(msg.chat.id, 'Не удалось сохранить публикацию. Попробуйте еще раз.');
  }
});

bot.onText(/\/stop/, async msg => {
  await query('UPDATE telegram_users SET notifications_enabled=FALSE WHERE telegram_id=$1', [msg.chat.id]);
  bot.sendMessage(msg.chat.id, 'Уведомления отключены. Включить обратно: /start');
});

bot.onText(/\/help|^Помощь$/, msg => {
  bot.sendMessage(
    msg.chat.id,
    '/start [token] - привязать аккаунт\n/balance - баланс\n/orders - заказы\n/new_product - новый товар продавца\n/new_service - новая услуга фрилансера\n/stop - отключить уведомления'
  );
});

async function sendToUser(userId, text, options = {}) {
  try {
    const telegramUser = await getTelegramUser(userId);
    if (!telegramUser || !telegramUser.notifications_enabled) return;
    await bot.sendMessage(telegramUser.telegram_id, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    if (err.code === 'ETELEGRAM' && err.message.includes('blocked')) {
      await query('UPDATE telegram_users SET notifications_enabled=FALSE WHERE user_id=$1', [userId]).catch(() => {});
    }
    logger.error('sendToUser error', { userId, err: err.message });
  }
}

async function sendToChat(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    logger.error('sendToChat error', { chatId, err: err.message });
  }
}

bot.on('polling_error', err => logger.error('TG polling error', { err: err.message }));
bot.on('error', err => logger.error('TG bot error', { err: err.message }));

module.exports = { bot, sendToUser, sendToChat };
