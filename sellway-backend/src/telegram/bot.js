require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { query } = require('../config/db');
const logger = require('../config/logger');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramToken || telegramToken === 'your_bot_token_from_botfather' || telegramToken.startsWith('your_')) {
  logger.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN is not configured');
  const noop = async () => {};
  if (require.main === module) setInterval(() => {}, 60 * 60 * 1000);
  module.exports = { bot: null, sendToUser: noop, sendToChat: noop };
  return;
}

// ── SOCKS5 ────────────────────────────────────────────
function createProxyAgent() {
  if (process.env.PROXY_ENABLED !== 'true') return null;
  const { PROXY_HOST: h, PROXY_PORT: p, PROXY_USERNAME: u, PROXY_PASSWORD: pw } = process.env;
  if (!h || !p) { logger.warn('PROXY_ENABLED=true but PROXY_HOST/PORT missing'); return null; }
  const auth = u && pw ? `${u}:${pw}@` : '';
  logger.info(`Telegram bot using SOCKS5 proxy: ${h}:${p}`);
  return new SocksProxyAgent(`socks5://${auth}${h}:${p}`);
}

const agent = createProxyAgent();
const pollingEnabled = require.main === module || process.env.TELEGRAM_POLLING === 'true';
const bot = new TelegramBot(telegramToken, {
  polling: pollingEnabled,
  ...(agent && { request: { agent } }),
});
logger.info(pollingEnabled ? 'Telegram bot polling started' : 'Telegram bot client ready');

// ── Helpers ───────────────────────────────────────────
const EMOJI = { ok: '✅', err: '❌', warn: '⚠️', money: '💰', order: '🛒', key: '🔑', dispute: '🚨', lock: '🔒', bell: '🔔' };

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
  const { rows } = await query(
    'SELECT telegram_id, notifications_enabled FROM telegram_users WHERE user_id=$1',
    [userId]
  );
  return rows[0] || null;
}

const fmt = (a) => parseFloat(a).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₽';

const isSellerRole = role => ['seller', 'freelancer', 'admin'].includes(role);
const mainKb = (role) => ({
  reply_markup: {
    keyboard: [
      isSellerRole(role)
        ? [{ text: '📊 Баланс' }, { text: '📦 Мои товары' }]
        : [{ text: '🛒 Мои заказы' }],
      [{ text: '🔔 Уведомления' }, { text: '❓ Помощь' }],
    ],
    resize_keyboard: true,
  },
});

// ═══════════════════════════════════════════════════
//  /start TOKEN — привязка аккаунта
// ═══════════════════════════════════════════════════
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token  = match?.[1]?.trim();

  try {
    const existing = await getUserByChatId(chatId);
    if (existing && !token) {
      return bot.sendMessage(chatId,
        `👋 Привет, *${existing.username}*!\n\nАккаунт уже привязан.`,
        { parse_mode: 'Markdown', ...mainKb(existing.role) }
      );
    }

    if (!token) {
      return bot.sendMessage(chatId,
        `${EMOJI.lock} *SellWay — Привязка аккаунта*\n\n` +
        `1. Войди на *sellway.pro*\n` +
        `2. Настройки → Telegram → "Получить ссылку"\n` +
        `3. Перейди по ссылке`,
        { parse_mode: 'Markdown' }
      );
    }

    // Проверяем токен из таблицы users (новая колонка)
    const { rows: [user] } = await query(
      `SELECT id, username, role FROM users
       WHERE telegram_link_token=$1
       AND (telegram_link_expires IS NULL OR telegram_link_expires > NOW())`,
      [token]
    );

    if (!user) {
      return bot.sendMessage(chatId,
        `${EMOJI.err} Токен недействителен или истёк.\n\nСгенерируй новый на sellway.pro`
      );
    }

    // Привязываем
    await query(
      `INSERT INTO telegram_users (user_id, telegram_id, username)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET telegram_id=$2, username=$3, notifications_enabled=TRUE`,
      [user.id, chatId, msg.from.username || null]
    );

    // Очищаем токен
    await query(
      'UPDATE users SET telegram_link_token=NULL, telegram_link_expires=NULL, telegram_verified=TRUE WHERE id=$1',
      [user.id]
    );

    await bot.sendMessage(chatId,
      `${EMOJI.ok} *Аккаунт привязан!*\n\nПривет, *${user.username}*! Теперь ты будешь получать уведомления о заказах и важных событиях.`,
      { parse_mode: 'Markdown', ...mainKb(user.role) }
    );

    logger.info('Telegram linked', { userId: user.id, chatId });
  } catch (err) {
    logger.error('Bot /start error', { err: err.message });
    bot.sendMessage(chatId, `${EMOJI.err} Ошибка. Попробуй позже.`);
  }
});

// ── /balance ──────────────────────────────────────────
bot.onText(/\/balance|📊 Баланс/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUserByChatId(chatId);
  if (!user) return bot.sendMessage(chatId, '❗ Сначала привяжи аккаунт: /start');

  try {
    const { rows: [w] } = await query('SELECT balance, held, total_in FROM wallets WHERE user_id=$1', [user.id]);
    const { rows: [s] } = await query('SELECT total_sales, rating FROM sellers WHERE user_id=$1', [user.id]);

    bot.sendMessage(chatId,
      `${EMOJI.money} *Баланс*\n\n` +
      `💵 Доступно: *${fmt(w?.balance || 0)}*\n` +
      `🔒 Заморожено: ${fmt(w?.held || 0)}\n` +
      `📈 Получено всего: ${fmt(w?.total_in || 0)}\n\n` +
      `📦 Продаж: ${s?.total_sales || 0}\n` +
      `⭐ Рейтинг: ${s?.rating || '—'}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    bot.sendMessage(chatId, `${EMOJI.err} Ошибка`);
  }
});

// ── /orders ──────────────────────────────────────────
bot.onText(/\/orders|🛒 Мои заказы|📦 Мои товары/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUserByChatId(chatId);
  if (!user) return bot.sendMessage(chatId, '❗ Сначала привяжи аккаунт: /start');

  try {
    const field = isSellerRole(user.role) ? 'seller_id' : 'buyer_id';
    const { rows } = await query(
      `SELECT o.order_number, o.status, o.amount, p.title, o.created_at
       FROM orders o JOIN products p ON p.id=o.product_id
       WHERE o.${field}=$1 ORDER BY o.created_at DESC LIMIT 5`,
      [user.id]
    );

    if (!rows.length) return bot.sendMessage(chatId, '📭 Заказов пока нет');

    const ICON = { pending:'⏳', paid:'💳', delivered:'📦', confirmed:'✅', disputed:'⚠️', cancelled:'❌' };
    const text = rows.map(o =>
      `${ICON[o.status]||'•'} *${o.order_number}*\n  ${o.title.slice(0,40)}\n  ${fmt(o.amount)}`
    ).join('\n\n');

    bot.sendMessage(chatId, `${EMOJI.order} *Последние заказы*\n\n${text}\n\n👉 sellway.pro`, { parse_mode: 'Markdown' });
  } catch (err) { bot.sendMessage(chatId, `${EMOJI.err} Ошибка`); }
});

// ── /stop ─────────────────────────────────────────────
bot.onText(/\/stop|🔕/, async (msg) => {
  await query('UPDATE telegram_users SET notifications_enabled=FALSE WHERE telegram_id=$1', [msg.chat.id]);
  bot.sendMessage(msg.chat.id, `${EMOJI.bell} Уведомления отключены.\n\nВключить обратно: /start`);
});

bot.onText(/\/help|❓ Помощь/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `${EMOJI.bell} *Команды*\n\n` +
    `/start [token] — Привязать аккаунт\n` +
    `/balance — Баланс\n` +
    `/orders — Заказы\n` +
    `/stop — Отключить уведомления\n\n` +
    `🌐 sellway.pro`,
    { parse_mode: 'Markdown' }
  );
});

// ═══════════════════════════════════════════════════
//  Публичный API для отправки уведомлений
// ═══════════════════════════════════════════════════
async function sendToUser(userId, text, options = {}) {
  try {
    const tg = await getTelegramUser(userId);
    if (!tg || !tg.notifications_enabled) return;
    await bot.sendMessage(tg.telegram_id, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    if (err.code === 'ETELEGRAM' && err.message.includes('blocked')) {
      await query('UPDATE telegram_users SET notifications_enabled=FALSE WHERE user_id=$1', [userId]).catch(() => {});
    }
    logger.error('sendToUser error', { userId, err: err.message });
  }
}

async function sendToChat(chatId, text, options = {}) {
  try { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options }); }
  catch (err) { logger.error('sendToChat error', { chatId, err: err.message }); }
}

bot.on('polling_error', err => logger.error('TG polling error', { err: err.message }));
bot.on('error',         err => logger.error('TG bot error',     { err: err.message }));

module.exports = { bot, sendToUser, sendToChat };
