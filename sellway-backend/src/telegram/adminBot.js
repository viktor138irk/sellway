const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const { query, transaction } = require('../config/db');
const notify = require('../services/notify');
const { sendTestEmail } = require('../services/mailer');
const { paySellerReferral } = require('../services/referrals');
const { canUseReferralProgram } = require('../services/referralEligibility');
const { createTelegramRequestOptions } = require('./proxy');

const telegramToken = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const ENV_FILE = path.resolve(__dirname, '..', '..', '.env');
const ENV_SETTINGS = new Set([
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_ADMIN_BOT_TOKEN',
  'TELEGRAM_ADMIN_BOT_USERNAME', 'TELEGRAM_ADMIN_CHAT_ID', 'PROXY_ENABLED',
  'PROXY_SCHEME', 'PROXY_HOST', 'PROXY_PORT', 'PROXY_USERNAME', 'PROXY_PASSWORD',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'SMSPILOT_ENABLED', 'SMSPILOT_API_KEY', 'SMSPILOT_SENDER', 'SMS_CODE_TEMPLATE',
]);
const SECRET_SETTINGS = new Set([
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_BOT_TOKEN', 'PROXY_PASSWORD', 'SMTP_PASS', 'SMSPILOT_API_KEY',
]);
const SETTING_GROUPS = {
  finance: {
    title: 'Финансы, системы вывода и сделки',
    keys: [
      'platform_commission', 'default_seller_commission_rate', 'default_referral_commission_rate',
      'withdrawal_commission', 'min_withdrawal', 'max_withdrawal_daily',
      'auto_payouts_enabled', 'auto_payout_min_balance', 'auto_payout_interval_hours',
      'usdt_rub_rate_fallback', 'withdraw_method_card_enabled', 'withdraw_method_card_commission',
      'withdraw_method_sbp_enabled', 'withdraw_method_sbp_commission',
      'withdraw_method_paypal_enabled', 'withdraw_method_paypal_commission',
      'withdraw_method_crypto_enabled', 'withdraw_method_crypto_commission',
      'escrow_auto_confirm_hours', 'auto_review_rating',
    ],
  },
  telegram: {
    title: 'Telegram и SOCKS5',
    keys: [
      'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_ADMIN_BOT_TOKEN',
      'TELEGRAM_ADMIN_BOT_USERNAME', 'TELEGRAM_ADMIN_CHAT_ID',
      'PROXY_ENABLED', 'PROXY_SCHEME', 'PROXY_HOST', 'PROXY_PORT',
      'PROXY_USERNAME', 'PROXY_PASSWORD',
    ],
  },
  notifications: {
    title: 'SMTP и SMSPilot',
    keys: [
      'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
      'SMSPILOT_ENABLED', 'SMSPILOT_API_KEY', 'SMSPILOT_SENDER', 'SMS_CODE_TEMPLATE',
    ],
  },
  system: {
    title: 'Платформа и опасная зона',
    keys: [
      'maintenance_mode', 'new_seller_requires_verify', 'terms_version', 'terms_title', 'terms_content',
    ],
  },
};
const BOOLEAN_SETTINGS = new Set([
  'auto_payouts_enabled', 'withdraw_method_card_enabled', 'withdraw_method_sbp_enabled',
  'withdraw_method_paypal_enabled', 'withdraw_method_crypto_enabled', 'PROXY_ENABLED',
  'SMTP_SECURE', 'SMSPILOT_ENABLED', 'maintenance_mode', 'new_seller_requires_verify',
  'referral_enabled',
]);
const MENU_TEXT = new Set([
  'Дашборд', 'Модерация', 'Пользователи', 'Заказы', 'Споры', 'Выплаты',
  'Рефералы', 'Поддержка', 'Категории товаров', 'Категории услуг',
  'Настройки', 'Аудит', 'Товары на модерации', 'Аккаунты на модерации',
  'Обращения поддержки', 'Статус',
]);

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
const adminChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
const pendingInputs = new Map();
let pollingRetryTimer = null;

function adminKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: 'Дашборд' }, { text: 'Модерация' }],
        [{ text: 'Пользователи' }, { text: 'Заказы' }],
        [{ text: 'Споры' }, { text: 'Выплаты' }],
        [{ text: 'Рефералы' }, { text: 'Поддержка' }],
        [{ text: 'Категории товаров' }, { text: 'Категории услуг' }],
        [{ text: 'Настройки' }, { text: 'Аудит' }],
      ],
      resize_keyboard: true,
    },
  };
}

function buttons(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

function supportActions(threadId) {
  return buttons([
    [{ text: 'История', callback_data: `support:view:${threadId}` }],
    [{ text: 'Ответить', callback_data: `support:reply:${threadId}` }, { text: 'Закрыть', callback_data: `support:close:${threadId}` }],
  ]);
}

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

function rub(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

function date(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : 'нет';
}

function cut(value, length = 220) {
  const text = String(value || '').trim();
  return text.length > length ? `${text.slice(0, length - 3)}...` : text || 'нет';
}

function yes(value) {
  return value === true || value === 'true' ? 'да' : 'нет';
}

function settingValue(key, value) {
  if (SECRET_SETTINGS.has(key)) return value ? 'настроено (скрыто)' : 'не задано';
  if (key === 'terms_content') return value ? `заполнено, ${String(value).length} симв.` : 'не задано';
  return String(value ?? '') || 'не задано';
}

function setEnvValue(content, key, value) {
  const raw = String(value ?? '').replace(/\r?\n/g, '');
  const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const line = `${key}="${escaped}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, line) : `${content.replace(/\s*$/, '')}\n${line}\n`;
}

function writeEnvSetting(key, value) {
  let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  content = setEnvValue(content, key, value);
  fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
  process.env[key] = String(value ?? '');
}

function slugify(value) {
  const translit = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ы:'y', э:'e', ю:'yu', я:'ya' };
  return String(value || '').toLowerCase().split('').map(char => translit[char] || char)
    .join('').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
}

async function actingAdmin() {
  const linked = await query(
    `SELECT u.id, u.username
     FROM telegram_users tu
     JOIN users u ON u.id=tu.user_id
     WHERE CAST(tu.telegram_id AS TEXT)=$1 AND u.role='admin' AND u.status='active'
     LIMIT 1`,
    [adminChatId]
  );
  if (linked.rows[0]) return linked.rows[0];
  const fallback = await query("SELECT id, username FROM users WHERE role='admin' AND status='active' ORDER BY created_at ASC LIMIT 1");
  if (!fallback.rows[0]) throw new Error('Не найден активный аккаунт администратора');
  return fallback.rows[0];
}

async function audit(adminId, action, entity, entityId, data = {}) {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_data)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [adminId, action, entity, entityId || null, JSON.stringify(data)]
  ).catch(() => {});
}

async function startPolling() {
  try {
    if (pollingRetryTimer) clearTimeout(pollingRetryTimer);
    if (typeof bot.deleteWebHook === 'function') await bot.deleteWebHook({ drop_pending_updates: false });
    else if (typeof bot.deleteWebhook === 'function') await bot.deleteWebhook({ drop_pending_updates: false });
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

async function sendDashboard(chatId) {
  const [money, orders, users, products, disputes, payouts, support] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) gross, COALESCE(SUM(commission),0) commission,
                  COALESCE(SUM(CASE WHEN created_at::date=CURRENT_DATE THEN amount END),0) today
           FROM orders WHERE status='confirmed'`),
    query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status IN ('paid','delivering','delivered')) active FROM orders`),
    query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE role='seller') sellers,
                  COUNT(*) FILTER (WHERE role='freelancer') freelancers FROM users`),
    query(`SELECT COUNT(*) FILTER (WHERE status='pending') pending, COUNT(*) FILTER (WHERE status='active') active FROM products`),
    query(`SELECT COUNT(*) FILTER (WHERE status='open') open FROM disputes`),
    query(`SELECT COUNT(*) FILTER (WHERE status='pending') pending, COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) amount FROM withdrawal_requests`),
    query(`SELECT COUNT(*) FILTER (WHERE status='open') open FROM support_threads`),
  ]);
  const r = money.rows[0]; const o = orders.rows[0]; const u = users.rows[0]; const p = products.rows[0];
  await bot.sendMessage(chatId,
    `Дашборд SellWay\n\n` +
    `Оборот: ${rub(r.gross)} (сегодня ${rub(r.today)})\nКомиссия: ${rub(r.commission)}\n` +
    `Заказы: ${o.total}, активных ${o.active}\n` +
    `Пользователи: ${u.total}, продавцов ${u.sellers}, фрилансеров ${u.freelancers}\n` +
    `Товары/услуги: опубликовано ${p.active}, на модерации ${p.pending}\n` +
    `Открытые споры: ${disputes.rows[0].open}\n` +
    `Выплаты в очереди: ${payouts.rows[0].pending} на ${rub(payouts.rows[0].amount)}\n` +
    `Обращения поддержки: ${support.rows[0].open}`,
    buttons([
      [{ text: 'Обновить', callback_data: 'nav:dashboard:all' }],
      [{ text: 'Модерация', callback_data: 'nav:products:pending' }, { text: 'Споры', callback_data: 'nav:disputes:open' }],
      [{ text: 'Выплаты', callback_data: 'nav:withdrawals:pending' }, { text: 'Поддержка', callback_data: 'nav:support:open' }],
    ])
  );
}

async function sendProducts(chatId, status = 'pending') {
  const { rows } = await query(
    `SELECT p.id, p.title, p.short_desc, p.price, p.delivery_type, p.created_at,
            c.name category_name, u.username, u.email, u.role
     FROM products p
     LEFT JOIN categories c ON c.id=p.category_id
     JOIN users u ON u.id=p.seller_id
     WHERE p.status=$1 ORDER BY p.created_at DESC LIMIT 10`,
    [status]
  );
  await bot.sendMessage(chatId, `Модерация: ${status}. Найдено: ${rows.length}.`, buttons([[
    { text: 'Ожидают', callback_data: 'nav:products:pending' },
    { text: 'Одобрены', callback_data: 'nav:products:active' },
    { text: 'Отклонены', callback_data: 'nav:products:rejected' },
  ]]));
  if (!rows.length) return;
  for (const product of rows) {
    const controls = status === 'pending' ? [[
      { text: 'Одобрить', callback_data: `product:approve:${product.id}` },
      { text: 'Отклонить', callback_data: `product:reject:${product.id}` },
    ]] : [];
    await bot.sendMessage(chatId,
      `${product.delivery_type === 'service' ? 'Услуга' : 'Товар'}: ${product.title}\n` +
      `Категория: ${product.category_name || 'не указана'}\n` +
      `Автор: ${product.username} (${product.role}), ${product.email}\n` +
      `Цена: ${rub(product.price)}\nСоздан: ${date(product.created_at)}\nОписание: ${cut(product.short_desc)}`,
      controls.length ? buttons(controls) : {}
    );
  }
}

async function sendCommercialApplications(chatId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.email, u.role, u.email_verified, u.phone_verified, u.telegram_verified,
            s.commercial_application_status, s.commercial_requested_at
     FROM sellers s JOIN users u ON u.id=s.user_id
     WHERE u.role IN ('seller','freelancer') AND s.commercial_terms_accepted_at IS NOT NULL
       AND COALESCE(s.commercial_application_status,'not_requested')='pending'
     ORDER BY s.commercial_requested_at ASC NULLS LAST LIMIT 10`
  );
  if (!rows.length) return bot.sendMessage(chatId, 'Новых заявок продавцов и фрилансеров нет.');
  for (const user of rows) {
    await bot.sendMessage(chatId,
      `Коммерческий аккаунт: ${user.username}\nРоль: ${user.role}\nEmail: ${user.email}\n` +
      `Email подтвержден: ${yes(user.email_verified)}\nТелефон: ${yes(user.phone_verified)}\nTelegram: ${yes(user.telegram_verified)}\n` +
      `Подан: ${date(user.commercial_requested_at)}`,
      buttons([[
        { text: 'Одобрить', callback_data: `commercial:approve:${user.id}` },
        { text: 'Отклонить', callback_data: `commercial:reject:${user.id}` },
      ]])
    );
  }
}

async function sendUsers(chatId, role = 'all') {
  const where = role === 'all' ? '' : 'WHERE u.role=$1';
  const args = role === 'all' ? [] : [role];
  const { rows } = await query(
    `SELECT u.id, u.username, u.email, u.role, u.status, w.balance, s.verified, s.rating
     FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN sellers s ON s.user_id=u.id
     ${where} ORDER BY u.created_at DESC LIMIT 10`,
    args
  );
  await bot.sendMessage(chatId, `Пользователи: ${role === 'all' ? 'последние' : role}.`, buttons([
    [{ text: 'Найти пользователя', callback_data: 'input:usersearch:none' }],
    [{ text: 'Все', callback_data: 'nav:users:all' }, { text: 'Продавцы', callback_data: 'nav:users:seller' }, { text: 'Фрилансеры', callback_data: 'nav:users:freelancer' }],
  ]));
  for (const user of rows) {
    await bot.sendMessage(chatId,
      `${user.username} (${user.role})\n${user.email}\nСтатус: ${user.status}; баланс: ${rub(user.balance)}; рейтинг: ${user.rating || 0}`,
      buttons([[{ text: 'Открыть и управлять', callback_data: `user:view:${user.id}` }]])
    );
  }
}

async function sendUserSearch(chatId, search) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.email, u.role, u.status, w.balance
     FROM users u LEFT JOIN wallets w ON w.user_id=u.id
     WHERE u.username ILIKE $1 OR u.email ILIKE $1 ORDER BY u.created_at DESC LIMIT 10`,
    [`%${search}%`]
  );
  if (!rows.length) return bot.sendMessage(chatId, 'Пользователи не найдены.');
  for (const user of rows) {
    await bot.sendMessage(chatId, `${user.username} (${user.role})\n${user.email}\nСтатус: ${user.status}; баланс: ${rub(user.balance)}`,
      buttons([[{ text: 'Открыть и управлять', callback_data: `user:view:${user.id}` }]]));
  }
}

async function sendUserCard(chatId, userId) {
  const { rows: [user] } = await query(
    `SELECT u.*, w.balance, w.held, s.verified, s.custom_commission_rate, s.referral_commission_rate,
            s.referral_code, s.referral_earnings, s.commercial_application_status
     FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN sellers s ON s.user_id=u.id WHERE u.id=$1`,
    [userId]
  );
  if (!user) throw new Error('Пользователь не найден');
  await bot.sendMessage(chatId,
    `Пользователь: ${user.username}\nEmail: ${user.email}\nРоль: ${user.role}; статус: ${user.status}\n` +
    `Email/телефон/Telegram: ${yes(user.email_verified)} / ${yes(user.phone_verified)} / ${yes(user.telegram_verified)}\n` +
    `Баланс: ${rub(user.balance)}, удержано: ${rub(user.held)}\n` +
    `Магазин одобрен: ${yes(user.verified)} (${user.commercial_application_status || 'нет заявки'})\n` +
    `Комиссия продавца: ${user.custom_commission_rate ?? 'по умолчанию'}; реферальная: ${user.referral_commission_rate ?? 'по умолчанию'}\n` +
    `Код реферала: ${user.referral_code || 'нет'}; доход: ${rub(user.referral_earnings)}`,
    buttons([
      [{ text: user.status === 'banned' ? 'Разблокировать' : 'Заблокировать', callback_data: `user:toggle:${user.id}` }],
      [{ text: 'Роль: продавец', callback_data: `role:seller:${user.id}` }, { text: 'Роль: фрилансер', callback_data: `role:freelancer:${user.id}` }],
      [{ text: 'Роль: покупатель', callback_data: `role:buyer:${user.id}` }, { text: 'Роль: модератор', callback_data: `role:moderator:${user.id}` }],
      [{ text: 'Роль: админ', callback_data: `role:admin:${user.id}` }],
      [{ text: user.verified ? 'Снять одобрение магазина' : 'Одобрить магазин', callback_data: `commercial:${user.verified ? 'revoke' : 'approve'}:${user.id}` }],
      [{ text: 'Комиссия продавца', callback_data: `input:commission:${user.id}` }, { text: 'Реф. комиссия', callback_data: `input:refcommission:${user.id}` }],
      [{ text: 'Назначить реферера', callback_data: `input:referrer:${user.id}` }],
    ])
  );
}

async function sendOrders(chatId, status = 'all') {
  const clause = status === 'all' ? '' : 'WHERE o.status=$1';
  const args = status === 'all' ? [] : [status];
  const { rows } = await query(
    `SELECT o.id, o.order_number, o.status, o.amount, o.created_at, p.title,
            buyer.username buyer_name, seller.username seller_name
     FROM orders o JOIN products p ON p.id=o.product_id
     JOIN users buyer ON buyer.id=o.buyer_id JOIN users seller ON seller.id=o.seller_id
     ${clause} ORDER BY o.created_at DESC LIMIT 10`,
    args
  );
  await bot.sendMessage(chatId, `Заказы: ${status}.`, buttons([[
    { text: 'Все', callback_data: 'nav:orders:all' }, { text: 'Оплачены', callback_data: 'nav:orders:paid' },
    { text: 'Выданы', callback_data: 'nav:orders:delivered' },
  ]]));
  const base = String(process.env.FRONTEND_URL || 'https://sellway.pro').replace(/\/$/, '');
  for (const order of rows) {
    await bot.sendMessage(chatId,
      `${order.order_number}: ${order.title}\n${order.buyer_name} -> ${order.seller_name}\n${rub(order.amount)}, ${order.status}, ${date(order.created_at)}`,
      buttons([[{ text: 'Открыть сделку', url: `${base}/orders/${order.id}` }]])
    );
  }
}

async function sendDisputes(chatId, status = 'open') {
  const { rows } = await query(
    `SELECT d.id, d.status, d.reason, d.created_at, o.order_number, o.amount,
            buyer.username buyer_name, seller.username seller_name, opener.username opener_name
     FROM disputes d JOIN orders o ON o.id=d.order_id
     JOIN users buyer ON buyer.id=o.buyer_id JOIN users seller ON seller.id=o.seller_id
     JOIN users opener ON opener.id=d.opener_id WHERE d.status=$1 ORDER BY d.created_at ASC LIMIT 10`,
    [status]
  );
  await bot.sendMessage(chatId, `Споры: ${status}. Найдено: ${rows.length}.`, buttons([[
    { text: 'Открытые', callback_data: 'nav:disputes:open' },
    { text: 'Покупателю', callback_data: 'nav:disputes:resolved_buyer' },
    { text: 'Продавцу', callback_data: 'nav:disputes:resolved_seller' },
  ]]));
  for (const dispute of rows) {
    const controls = status === 'open' ? [[
      { text: 'Решить покупателю', callback_data: `dispute:buyer:${dispute.id}` },
      { text: 'Решить продавцу', callback_data: `dispute:seller:${dispute.id}` },
    ]] : [];
    await bot.sendMessage(chatId,
      `Спор по ${dispute.order_number}, ${rub(dispute.amount)}\nПокупатель: ${dispute.buyer_name}; продавец: ${dispute.seller_name}\n` +
      `Открыл: ${dispute.opener_name}; ${date(dispute.created_at)}\nПричина: ${cut(dispute.reason, 500)}`,
      controls.length ? buttons(controls) : {}
    );
  }
}

async function sendWithdrawals(chatId, status = 'pending') {
  const { rows } = await query(
    `SELECT w.*, u.username, u.email FROM withdrawal_requests w
     JOIN users u ON u.id=w.user_id WHERE w.status=$1 ORDER BY w.created_at ASC LIMIT 10`,
    [status]
  );
  await bot.sendMessage(chatId, `Выплаты: ${status}. Найдено: ${rows.length}.`, buttons([[
    { text: 'Ожидают', callback_data: 'nav:withdrawals:pending' },
    { text: 'Завершены', callback_data: 'nav:withdrawals:completed' },
    { text: 'Отклонены', callback_data: 'nav:withdrawals:rejected' },
  ]]));
  for (const item of rows) {
    const controls = status === 'pending' ? [[
      { text: 'Одобрить', callback_data: `withdraw:approve:${item.id}` },
      { text: 'Отклонить', callback_data: `withdraw:reject:${item.id}` },
    ]] : [];
    await bot.sendMessage(chatId,
      `${item.username} (${item.email})\nЗапрошено: ${rub(item.amount)}; к выплате: ${rub(item.net_amount)}\n` +
      `Метод: ${item.method}; реквизиты: ${cut(JSON.stringify(item.requisites), 300)}\nСоздана: ${date(item.created_at)}`,
      controls.length ? buttons(controls) : {}
    );
  }
}

async function sendReferrals(chatId) {
  const [summary, applications, settings] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) paid, COUNT(*) count FROM transactions WHERE meta->>'source'='seller_referral'`),
    query(`SELECT s.user_id, u.username, u.email, u.email_verified, u.phone_verified, u.telegram_verified
           FROM sellers s JOIN users u ON u.id=s.user_id WHERE s.referral_application_status='pending'
           ORDER BY s.referral_requested_at ASC NULLS LAST LIMIT 10`),
    query(`SELECT key, value FROM settings WHERE key IN ('referral_enabled','default_referral_commission_rate','max_referral_commission_rate','referral_payout_basis')`),
  ]);
  const config = Object.fromEntries(settings.rows.map(row => [row.key, row.value]));
  await bot.sendMessage(chatId,
    `Реферальная программа\n\nВыплачено: ${rub(summary.rows[0].paid)} (${summary.rows[0].count} начислений)\n` +
    `Включена: ${config.referral_enabled || 'true'}\nСтавка по умолчанию: ${config.default_referral_commission_rate || '0.0100'}\n` +
    `Максимум: ${config.max_referral_commission_rate || '0.0500'}\nБаза: ${config.referral_payout_basis || 'turnover'}\n` +
    `Заявок ожидает: ${applications.rows.length}`,
    buttons([
      [{ text: 'Вкл/выкл программу', callback_data: 'refsetting:toggle:referral_enabled' }],
      [{ text: 'Ставка по умолчанию', callback_data: 'refsetting:edit:default_referral_commission_rate' }, { text: 'Максимум', callback_data: 'refsetting:edit:max_referral_commission_rate' }],
      [{ text: 'База выплат', callback_data: 'refsetting:edit:referral_payout_basis' }],
    ])
  );
  for (const user of applications.rows) {
    await bot.sendMessage(chatId,
      `${user.username} (${user.email})\nПроверки email/телефон/Telegram: ${yes(user.email_verified)} / ${yes(user.phone_verified)} / ${yes(user.telegram_verified)}`,
      buttons([[
        { text: 'Одобрить', callback_data: `referral:approve:${user.user_id}` },
        { text: 'Отклонить', callback_data: `referral:reject:${user.user_id}` },
      ]])
    );
  }
}

async function sendSupport(chatId) {
  const { rows } = await query(
    `SELECT st.id, st.updated_at, u.username, u.email,
            (SELECT sm.message FROM support_messages sm WHERE sm.thread_id=st.id ORDER BY sm.created_at DESC LIMIT 1) last_message
     FROM support_threads st JOIN users u ON u.id=st.user_id WHERE st.status='open'
     ORDER BY st.updated_at DESC LIMIT 10`
  );
  if (!rows.length) return bot.sendMessage(chatId, 'Открытых обращений поддержки нет.');
  for (const thread of rows) {
    await bot.sendMessage(chatId,
      `Обращение [${String(thread.id).slice(0, 8)}]\nОт: ${thread.username} (${thread.email})\nОбновлено: ${date(thread.updated_at)}\n\n${cut(thread.last_message, 500)}`,
      supportActions(thread.id)
    );
  }
}

async function sendSupportThread(chatId, id) {
  const { rows: [thread] } = await query(
    `SELECT st.id, st.status, u.username, u.email FROM support_threads st JOIN users u ON u.id=st.user_id WHERE st.id=$1`,
    [id]
  );
  if (!thread) throw new Error('Обращение не найдено');
  const { rows } = await query(
    `SELECT sender_type, message, created_at FROM support_messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 10`,
    [id]
  );
  const history = rows.reverse().map(item => `[${date(item.created_at)}] ${item.sender_type === 'admin' ? 'Поддержка' : thread.username}: ${cut(item.message, 220)}`).join('\n\n');
  await bot.sendMessage(chatId, `Диалог ${String(id).slice(0, 8)} (${thread.status})\n${thread.username} (${thread.email})\n\n${history || 'Сообщений нет.'}`, supportActions(id));
}

async function sendCategories(chatId, type) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.parent_id, c.is_active, c.product_count,
            (SELECT COUNT(*) FROM categories sub WHERE sub.parent_id=c.id) child_count
     FROM categories c WHERE c.category_type=$1 ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name LIMIT 60`,
    [type]
  );
  const roots = rows.filter(row => !row.parent_id);
  await bot.sendMessage(chatId,
    `${type === 'service' ? 'Категории услуг' : 'Категории товаров'}: ${roots.length} основных, ${rows.length - roots.length} подкатегорий.`,
    buttons([[{ text: 'Добавить категорию', callback_data: `category:new:${type}:root` }]])
  );
  for (const root of roots) {
    const subs = rows.filter(row => row.parent_id === root.id).map(row => row.name).join(', ');
    await bot.sendMessage(chatId,
      `${root.is_active ? 'Активна' : 'Скрыта'}: ${root.name} (${root.slug})\nПодкатегорий: ${root.child_count}; товары: ${root.product_count || 0}\n${subs ? `Список: ${cut(subs, 300)}` : ''}`,
      buttons([[{ text: 'Управлять', callback_data: `category:view:${root.id}` }, { text: 'Добавить подкатегорию', callback_data: `category:new:${type}:${root.id}` }]])
    );
  }
}

async function sendCategoryCard(chatId, id) {
  const { rows: [category] } = await query(
    `SELECT c.*, parent.name parent_name, COALESCE(c.image_url,parent.image_url) display_image_url
     FROM categories c LEFT JOIN categories parent ON parent.id=c.parent_id WHERE c.id=$1`,
    [id]
  );
  if (!category) throw new Error('Категория не найдена');
  const { rows: children } = await query('SELECT id, name, is_active FROM categories WHERE parent_id=$1 ORDER BY sort_order, name LIMIT 30', [id]);
  await bot.sendMessage(chatId,
    `${category.parent_id ? 'Подкатегория' : 'Категория'}: ${category.name}\nТип: ${category.category_type}; slug: ${category.slug}\n` +
    `Родитель: ${category.parent_name || 'нет'}; активна: ${yes(category.is_active)}\nИконка: ${category.image_url || `наследуется: ${category.display_image_url || 'нет'}`}\nОписание: ${cut(category.description)}`,
    buttons([
      [{ text: 'Название и описание', callback_data: `category:edit:${category.id}` }, { text: 'Иконка', callback_data: `category:icon:${category.id}` }],
      [{ text: category.is_active ? 'Скрыть' : 'Включить', callback_data: `category:toggle:${category.id}` }],
      ...(!category.parent_id ? [[{ text: 'Добавить подкатегорию', callback_data: `category:new:${category.category_type}:${category.id}` }]] : []),
      ...children.map(child => [{ text: `${child.is_active ? '' : '(скрыта) '}${child.name}`, callback_data: `category:view:${child.id}` }]),
    ])
  );
}

async function sendSettingsMenu(chatId) {
  await bot.sendMessage(chatId, 'Настройки платформы. Секреты отображаются только как наличие значения.', buttons([
    [{ text: 'Финансы и сделки', callback_data: 'settings:show:finance' }],
    [{ text: 'Telegram и SOCKS5', callback_data: 'settings:show:telegram' }],
    [{ text: 'SMTP и SMSPilot', callback_data: 'settings:show:notifications' }],
    [{ text: 'Система и правила', callback_data: 'settings:show:system' }],
  ]));
}

async function sendSettingsGroup(chatId, groupKey) {
  const group = SETTING_GROUPS[groupKey];
  if (!group) return;
  const dbKeys = group.keys.filter(key => !ENV_SETTINGS.has(key));
  const { rows } = dbKeys.length ? await query('SELECT key, value FROM settings WHERE key = ANY($1)', [dbKeys]) : { rows: [] };
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const current = key => ENV_SETTINGS.has(key) ? process.env[key] : values[key];
  const text = group.keys.map(key => `${key}: ${settingValue(key, current(key))}`).join('\n');
  const editButtons = group.keys.map(key => BOOLEAN_SETTINGS.has(key)
    ? [{ text: `${String(current(key)) === 'true' ? 'Выключить' : 'Включить'} ${key}`, callback_data: `setting:toggle:${key}` }]
    : [{ text: `Изменить ${key}`, callback_data: `setting:edit:${key}` }]
  );
  const actions = groupKey === 'telegram'
    ? [[{ text: 'Тест Telegram/SOCKS5', callback_data: 'action:telegram:test' }, { text: 'Тестовое сообщение', callback_data: 'action:telegram:send' }]]
    : groupKey === 'notifications'
      ? [[{ text: 'Отправить тест SMTP', callback_data: 'action:smtp:test' }]]
      : groupKey === 'system'
        ? [[{ text: 'Завершить просроченные сделки', callback_data: 'danger:ask:autoconfirm' }], [{ text: 'Сбросить статистику модерации', callback_data: 'danger:ask:reset' }]]
        : [];
  await bot.sendMessage(chatId, `${group.title}\n\n${text}`, buttons([...editButtons, ...actions]));
}

async function sendAudit(chatId) {
  const { rows } = await query(
    `SELECT a.action, a.entity, a.entity_id, a.created_at, u.username
     FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 15`
  );
  if (!rows.length) return bot.sendMessage(chatId, 'Записей аудита пока нет.');
  await bot.sendMessage(chatId, `Последние действия:\n\n${rows.map(row =>
    `${date(row.created_at)} | ${row.username || 'system'} | ${row.action} | ${row.entity}${row.entity_id ? ` ${String(row.entity_id).slice(0, 8)}` : ''}`
  ).join('\n')}`);
}

async function saveSupportReply(threadId, message) {
  const admin = await actingAdmin();
  const { rows: [thread] } = await query("SELECT id, user_id FROM support_threads WHERE id=$1 AND status='open'", [threadId]);
  if (!thread) throw new Error('Обращение закрыто или не найдено');
  await query(
    `INSERT INTO support_messages (thread_id, sender_type, sender_id, message) VALUES ($1,'admin',$2,$3)`,
    [thread.id, admin.id, message]
  );
  await query('UPDATE support_threads SET updated_at=NOW() WHERE id=$1', [thread.id]);
  await notify.create(thread.user_id, 'system', 'Ответ поддержки', message, null).catch(() => {});
  return thread;
}

async function approveProduct(id) {
  const admin = await actingAdmin();
  const { rows: [product] } = await query(
    "UPDATE products SET status='active', reject_reason=NULL, moderated_by=$1, moderated_at=NOW() WHERE id=$2 AND status='pending' RETURNING *",
    [admin.id, id]
  );
  if (!product) throw new Error('Товар уже обработан или не найден');
  await notify.create(product.seller_id, 'system', 'Товар одобрен', `Ваш товар "${product.title}" опубликован.`, `/seller/products/${product.id}`).catch(() => {});
  await audit(admin.id, 'product_approved', 'product', product.id);
}

async function rejectProduct(id, reason) {
  const admin = await actingAdmin();
  const { rows: [product] } = await query(
    "UPDATE products SET status='rejected', reject_reason=$1, moderated_by=$2, moderated_at=NOW() WHERE id=$3 AND status='pending' RETURNING *",
    [reason, admin.id, id]
  );
  if (!product) throw new Error('Товар уже обработан или не найден');
  await notify.create(product.seller_id, 'system', 'Товар отклонен', `Товар "${product.title}" отклонен. Причина: ${reason}`, `/seller/products/${product.id}`).catch(() => {});
  await audit(admin.id, 'product_rejected', 'product', product.id, { reason });
}

async function decideCommercial(id, approved, reason = '') {
  const admin = await actingAdmin();
  const { rows: [user] } = await query('SELECT id, username, role FROM users WHERE id=$1', [id]);
  if (!user) throw new Error('Пользователь не найден');
  const { rows: [seller] } = await query(
    `UPDATE sellers SET verified=$1, verified_at=CASE WHEN $1 THEN NOW() ELSE NULL END,
       commercial_application_status=CASE WHEN $1 THEN 'approved' ELSE 'rejected' END,
       commercial_reviewed_at=NOW(), commercial_reviewed_by=$2, commercial_reject_reason=$3, updated_at=NOW()
     WHERE user_id=$4 AND (NOT $1 OR commercial_terms_accepted_at IS NOT NULL) RETURNING user_id`,
    [approved, admin.id, approved ? null : reason, id]
  );
  if (!seller) throw new Error('Пользователь не принял дополнительные условия или заявка отсутствует');
  await notify.create(id, 'system', approved ? 'Коммерческий аккаунт одобрен' : 'Коммерческий аккаунт отклонен',
    approved ? 'Теперь можно публиковать товары или услуги.' : reason, '/seller/products').catch(() => {});
  await audit(admin.id, approved ? 'commercial_approved' : 'commercial_rejected', 'seller', id, { reason });
}

async function revokeCommercial(id) {
  const admin = await actingAdmin();
  const { rows: [seller] } = await query(
    `UPDATE sellers SET verified=FALSE, verified_at=NULL, commercial_application_status='pending',
       commercial_reviewed_at=NOW(), commercial_reviewed_by=$1, commercial_reject_reason=NULL, updated_at=NOW()
     WHERE user_id=$2 RETURNING user_id`,
    [admin.id, id]
  );
  if (!seller) throw new Error('Профиль магазина не найден');
  await notify.create(id, 'system', 'Одобрение магазина снято', 'Публикация новых товаров требует повторной проверки.', '/seller/products').catch(() => {});
  await audit(admin.id, 'commercial_revoked', 'seller', id);
}

async function resolveDispute(id, winner, resolution) {
  const admin = await actingAdmin();
  const result = await transaction(async client => {
    const { rows: [dispute] } = await client.query(
      "SELECT d.*, o.* FROM disputes d JOIN orders o ON o.id=d.order_id WHERE d.id=$1 AND d.status='open' FOR UPDATE",
      [id]
    );
    if (!dispute) throw new Error('Открытый спор не найден');
    await client.query('UPDATE disputes SET status=$1, resolution=$2, admin_id=$3, resolved_at=NOW() WHERE id=$4',
      [winner === 'buyer' ? 'resolved_buyer' : 'resolved_seller', resolution, admin.id, id]);
    if (winner === 'buyer') {
      await client.query("UPDATE orders SET status='refunded' WHERE id=$1", [dispute.order_id]);
      await client.query('UPDATE wallets SET balance=balance+$1, held=GREATEST(held-$1,0) WHERE user_id=$2', [dispute.amount, dispute.buyer_id]);
    } else {
      await client.query("UPDATE orders SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [dispute.order_id]);
      await client.query('UPDATE wallets SET held=GREATEST(held-$1,0) WHERE user_id=$2', [dispute.amount, dispute.buyer_id]);
      await client.query('UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2', [dispute.seller_amount, dispute.seller_id]);
    }
    return dispute;
  });
  if (winner === 'buyer') {
    await notify.create(result.buyer_id, 'order_confirmed', 'Спор решен в вашу пользу', `Возврат ${rub(result.amount)}`, `/orders/${result.order_id}`).catch(() => {});
    await notify.create(result.seller_id, 'system', 'Спор решен', 'Решение принято в пользу покупателя.', `/orders/${result.order_id}`).catch(() => {});
  } else {
    await notify.create(result.seller_id, 'balance_credit', 'Спор решен в вашу пользу', `Зачислено ${rub(result.seller_amount)}`, `/orders/${result.order_id}`).catch(() => {});
    await notify.create(result.buyer_id, 'system', 'Спор решен', 'Решение принято в пользу продавца.', `/orders/${result.order_id}`).catch(() => {});
  }
  await audit(admin.id, 'dispute_resolved', 'dispute', id, { winner, resolution });
}

async function approveWithdrawal(id) {
  const admin = await actingAdmin();
  const { rows: [withdrawal] } = await query(
    "UPDATE withdrawal_requests SET status='completed', admin_id=$1, processed_at=NOW() WHERE id=$2 AND status='pending' RETURNING *",
    [admin.id, id]
  );
  if (!withdrawal) throw new Error('Заявка уже обработана или не найдена');
  await notify.sellerWithdrawApproved(withdrawal.user_id, withdrawal);
  await audit(admin.id, 'withdrawal_approved', 'withdrawal', id);
}

async function rejectWithdrawal(id, reason) {
  const admin = await actingAdmin();
  const withdrawal = await transaction(async client => {
    const { rows: [item] } = await client.query(
      "UPDATE withdrawal_requests SET status='rejected', admin_id=$1, admin_note=$2, processed_at=NOW() WHERE id=$3 AND status='pending' RETURNING *",
      [admin.id, reason, id]
    );
    if (!item) throw new Error('Заявка уже обработана или не найдена');
    await client.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2', [item.amount, item.user_id]);
    return item;
  });
  await notify.sellerWithdrawRejected(withdrawal.user_id, withdrawal, reason);
  await audit(admin.id, 'withdrawal_rejected', 'withdrawal', id, { reason });
}

async function decideReferral(userId, approved, reason = '') {
  const admin = await actingAdmin();
  const { rows: [user] } = await query(
    `SELECT u.id, u.email_verified, u.phone_verified, u.telegram_verified FROM users u JOIN sellers s ON s.user_id=u.id WHERE u.id=$1`,
    [userId]
  );
  if (!user) throw new Error('Пользователь не найден');
  if (approved && !canUseReferralProgram(user)) throw new Error('Нужно подтвердить email, телефон и Telegram');
  await query(
    `UPDATE sellers SET referral_enabled=$1, referral_application_status=$2, referral_reviewed_at=NOW(),
       referral_reviewed_by=$3, referral_reject_reason=$4 WHERE user_id=$5`,
    [approved, approved ? 'approved' : 'rejected', admin.id, approved ? null : reason, userId]
  );
  await notify.create(userId, 'system', approved ? 'Реферальная программа одобрена' : 'Заявка на реферальную программу отклонена',
    approved ? 'Администратор одобрил ваше участие в реферальной программе.' : reason, '/seller/referrals').catch(() => {});
  await audit(admin.id, approved ? 'referral_approved' : 'referral_rejected', 'seller', userId, { reason });
}

async function setSetting(key, value) {
  if (ENV_SETTINGS.has(key)) {
    writeEnvSetting(key, value);
    return true;
  }
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [key, String(value)]
  );
  return false;
}

async function autoConfirmExpired() {
  const admin = await actingAdmin();
  const confirmed = await transaction(async client => {
    const { rows: orders } = await client.query(
      `SELECT * FROM orders WHERE status='delivered' AND auto_confirm_at IS NOT NULL AND auto_confirm_at<=NOW()
       ORDER BY auto_confirm_at ASC FOR UPDATE SKIP LOCKED`
    );
    for (const order of orders) {
      await client.query("UPDATE orders SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [order.id]);
      await client.query('UPDATE wallets SET held=GREATEST(held-$1,0) WHERE user_id=$2', [order.amount, order.buyer_id]);
      await client.query('UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2', [order.seller_amount, order.seller_id]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'release',$3,$4)`,
        [order.buyer_id, order.id, order.amount, `Авто-подтверждение заказа ${order.order_number}`]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'credit',$3,$4)`,
        [order.seller_id, order.id, order.seller_amount, `Выплата за заказ ${order.order_number}`]);
      await client.query('UPDATE sellers SET total_sales=total_sales+1 WHERE user_id=$1', [order.seller_id]);
      await client.query('UPDATE products SET sales_count=sales_count+1 WHERE id=$1', [order.product_id]);
      await paySellerReferral(client, order);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`,
        [order.id, admin.id, 'Сделка автоматически завершена администратором после истечения срока подтверждения.']);
    }
    return orders;
  });
  for (const order of confirmed) {
    await notify.create(order.buyer_id, 'order_confirmed', 'Сделка завершена автоматически', `Заказ ${order.order_number} закрыт после истечения срока подтверждения.`, `/orders/${order.id}`).catch(() => {});
    await notify.create(order.seller_id, 'order_confirmed', 'Сделка завершена автоматически', `Средства по заказу ${order.order_number} зачислены.`, `/orders/${order.id}`).catch(() => {});
  }
  await audit(admin.id, 'auto_confirm_expired', 'system', null, { count: confirmed.length });
  return confirmed.length;
}

async function resetModerationStats() {
  const admin = await actingAdmin();
  const { rows } = await query(
    `UPDATE products SET moderated_by=NULL, moderated_at=NULL, reject_reason=NULL
     WHERE moderated_by IS NOT NULL OR moderated_at IS NOT NULL OR reject_reason IS NOT NULL RETURNING id`
  );
  await audit(admin.id, 'reset_moderation_stats', 'system', null, { affected_products: rows.length });
  return rows.length;
}

function prompt(chatId, state, text) {
  pendingInputs.set(String(chatId), state);
  return bot.sendMessage(chatId, text, buttons([[{ text: 'Отменить', callback_data: 'input:cancel:none' }]]));
}

bot.onText(/\/start|\/help/, async msg => {
  if (await rejectIfNotAdmin(msg)) return;
  await bot.sendMessage(msg.chat.id, `SellWay Admin Bot\n\nChat ID: ${msg.chat.id}\nВсе разделы панели доступны кнопками ниже.`, adminKeyboard());
  await sendDashboard(msg.chat.id);
});

bot.onText(/\/id/, msg => bot.sendMessage(msg.chat.id, String(msg.chat.id)));

bot.onText(/\/status|^Статус$/, async msg => {
  if (await rejectIfNotAdmin(msg)) return;
  const me = await bot.getMe();
  await bot.sendMessage(msg.chat.id, `Бот работает: @${me.username}. База и Telegram API доступны.`, adminKeyboard());
});

bot.onText(/^Дашборд$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendDashboard(msg.chat.id); });
bot.onText(/^Модерация$|^Товары на модерации$|\/pending_products/, async msg => {
  if (await rejectIfNotAdmin(msg)) return;
  await sendProducts(msg.chat.id, 'pending');
  await sendCommercialApplications(msg.chat.id);
});
bot.onText(/^Аккаунты на модерации$|\/pending_users/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendCommercialApplications(msg.chat.id); });
bot.onText(/^Пользователи$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendUsers(msg.chat.id); });
bot.onText(/^Заказы$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendOrders(msg.chat.id); });
bot.onText(/^Споры$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendDisputes(msg.chat.id); });
bot.onText(/^Выплаты$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendWithdrawals(msg.chat.id); });
bot.onText(/^Рефералы$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendReferrals(msg.chat.id); });
bot.onText(/^Поддержка$|^Обращения поддержки$|\/support/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendSupport(msg.chat.id); });
bot.onText(/^Категории товаров$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendCategories(msg.chat.id, 'product'); });
bot.onText(/^Категории услуг$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendCategories(msg.chat.id, 'service'); });
bot.onText(/^Настройки$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendSettingsMenu(msg.chat.id); });
bot.onText(/^Аудит$/, async msg => { if (!await rejectIfNotAdmin(msg)) await sendAudit(msg.chat.id); });

bot.on('callback_query', async cq => {
  if (await rejectIfNotAdmin(cq)) return bot.answerCallbackQuery(cq.id).catch(() => {});
  const chatId = cq.message.chat.id;
  const [entity, action, id, extra] = String(cq.data || '').split(':');
  try {
    await bot.answerCallbackQuery(cq.id).catch(() => {});
    if (entity === 'nav') {
      if (action === 'dashboard') return sendDashboard(chatId);
      if (action === 'products') return sendProducts(chatId, id);
      if (action === 'users') return sendUsers(chatId, id);
      if (action === 'orders') return sendOrders(chatId, id);
      if (action === 'disputes') return sendDisputes(chatId, id);
      if (action === 'withdrawals') return sendWithdrawals(chatId, id);
      if (action === 'support') return sendSupport(chatId);
    }
    if (entity === 'product' && action === 'approve') {
      await approveProduct(id);
      return bot.sendMessage(chatId, 'Товар опубликован.');
    }
    if (entity === 'product' && action === 'reject') return prompt(chatId, { kind: 'product_reject', id }, 'Введите причину отклонения товара:');
    if (entity === 'commercial' && action === 'approve') {
      await decideCommercial(id, true);
      return bot.sendMessage(chatId, 'Коммерческий аккаунт одобрен.');
    }
    if (entity === 'commercial' && action === 'revoke') {
      await revokeCommercial(id);
      return bot.sendMessage(chatId, 'Одобрение магазина снято, заявка возвращена на проверку.');
    }
    if (entity === 'commercial' && action === 'reject') return prompt(chatId, { kind: 'commercial_reject', id }, 'Введите причину отклонения аккаунта:');
    if (entity === 'user' && action === 'view') return sendUserCard(chatId, id);
    if (entity === 'user' && action === 'toggle') {
      const admin = await actingAdmin();
      const { rows: [user] } = await query(
        `UPDATE users SET status=CASE WHEN status='banned' THEN 'active'::user_status ELSE 'banned'::user_status END WHERE id=$1 RETURNING status`,
        [id]
      );
      if (!user) throw new Error('Пользователь не найден');
      await audit(admin.id, 'user_status_changed', 'user', id, { status: user.status });
      await bot.sendMessage(chatId, `Статус изменен: ${user.status}.`);
      return sendUserCard(chatId, id);
    }
    if (entity === 'role') {
      const admin = await actingAdmin();
      const role = action;
      const { rows: [user] } = await query('UPDATE users SET role=$1 WHERE id=$2 RETURNING id, username', [role, id]);
      if (!user) throw new Error('Пользователь не найден');
      if (['seller', 'freelancer'].includes(role)) {
        await query(`INSERT INTO sellers (user_id, display_name, referral_code) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING`,
          [id, user.username, uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()]);
      }
      await audit(admin.id, 'user_role_changed', 'user', id, { role });
      await bot.sendMessage(chatId, `Роль изменена: ${role}.`);
      return sendUserCard(chatId, id);
    }
    if (entity === 'input' && action === 'cancel') {
      pendingInputs.delete(String(chatId));
      return bot.sendMessage(chatId, 'Ввод отменен.', adminKeyboard());
    }
    if (entity === 'input' && ['commission', 'refcommission', 'referrer'].includes(action)) {
      const labels = { commission: 'Введите индивидуальную комиссию продавца от 0 до 0.5 или "-" для сброса:', refcommission: 'Введите реферальную комиссию от 0 до 0.5 или "-" для сброса:', referrer: 'Введите email, username или реферальный код реферера; "-" для удаления:' };
      return prompt(chatId, { kind: `user_${action}`, id }, labels[action]);
    }
    if (entity === 'input' && action === 'usersearch') return prompt(chatId, { kind: 'user_search' }, 'Введите часть email или логина пользователя:');
    if (entity === 'dispute' && ['buyer', 'seller'].includes(action)) {
      return prompt(chatId, { kind: 'dispute', id, winner: action }, `Введите решение по спору в пользу ${action === 'buyer' ? 'покупателя' : 'продавца'}:`);
    }
    if (entity === 'withdraw' && action === 'approve') {
      await approveWithdrawal(id);
      return bot.sendMessage(chatId, 'Выплата одобрена.');
    }
    if (entity === 'withdraw' && action === 'reject') return prompt(chatId, { kind: 'withdraw_reject', id }, 'Введите причину отклонения выплаты:');
    if (entity === 'referral' && action === 'approve') {
      await decideReferral(id, true);
      return bot.sendMessage(chatId, 'Участие в реферальной программе одобрено.');
    }
    if (entity === 'referral' && action === 'reject') return prompt(chatId, { kind: 'referral_reject', id }, 'Введите причину отклонения реферальной заявки:');
    if (entity === 'refsetting') {
      if (action === 'toggle') {
        const { rows: [row] } = await query('SELECT value FROM settings WHERE key=$1', [id]);
        await setSetting(id, String(row?.value) !== 'false' ? 'false' : 'true');
        return sendReferrals(chatId);
      }
      return prompt(chatId, { kind: 'setting', key: id, group: 'referrals' }, `Введите новое значение ${id}:`);
    }
    if (entity === 'support' && action === 'view') return sendSupportThread(chatId, id);
    if (entity === 'support' && action === 'reply') return prompt(chatId, { kind: 'support_reply', id }, `Напишите ответ по обращению ${String(id).slice(0, 8)}:`);
    if (entity === 'support' && action === 'close') {
      const { rows: [thread] } = await query("UPDATE support_threads SET status='closed', updated_at=NOW() WHERE id=$1 AND status='open' RETURNING user_id", [id]);
      if (!thread) throw new Error('Обращение уже закрыто');
      await notify.create(thread.user_id, 'system', 'Обращение закрыто', 'Поддержка завершила обращение. Если вопрос остался, напишите новое сообщение.', null).catch(() => {});
      return bot.sendMessage(chatId, 'Обращение закрыто.');
    }
    if (entity === 'category' && action === 'view') return sendCategoryCard(chatId, id);
    if (entity === 'category' && action === 'new') {
      return prompt(chatId, { kind: 'category_new', type: id, parentId: extra === 'root' ? null : extra },
        'Введите категорию форматом:\nНазвание | slug (необязательно) | описание (необязательно)');
    }
    if (entity === 'category' && action === 'edit') return prompt(chatId, { kind: 'category_edit', id }, 'Введите новое значение форматом:\nНазвание | slug | описание');
    if (entity === 'category' && action === 'icon') return prompt(chatId, { kind: 'category_icon', id }, 'Отправьте изображение в этот чат или укажите URL иконки. Символ "-" убирает собственную иконку подкатегории.');
    if (entity === 'category' && action === 'toggle') {
      const { rows: [category] } = await query('UPDATE categories SET is_active=NOT is_active WHERE id=$1 RETURNING is_active', [id]);
      if (!category) throw new Error('Категория не найдена');
      await bot.sendMessage(chatId, category.is_active ? 'Категория включена.' : 'Категория скрыта.');
      return sendCategoryCard(chatId, id);
    }
    if (entity === 'settings' && action === 'show') return sendSettingsGroup(chatId, id);
    if (entity === 'setting' && action === 'edit') return prompt(chatId, { kind: 'setting', key: id }, `Введите новое значение ${id}:`);
    if (entity === 'setting' && action === 'toggle') {
      const current = ENV_SETTINGS.has(id)
        ? process.env[id]
        : (await query('SELECT value FROM settings WHERE key=$1', [id])).rows[0]?.value;
      const restart = await setSetting(id, String(current) === 'true' ? 'false' : 'true');
      await bot.sendMessage(chatId, restart ? 'Переключено. Для применения перезапустите backend и Telegram-ботов через PM2.' : 'Переключено.');
      const group = Object.keys(SETTING_GROUPS).find(key => SETTING_GROUPS[key].keys.includes(id));
      if (group) return sendSettingsGroup(chatId, group);
      return;
    }
    if (entity === 'action' && action === 'telegram' && id === 'test') {
      const userBot = require('./bot');
      if (!userBot.bot) throw new Error('Пользовательский Telegram bot не настроен');
      const [userMe, adminMe] = await Promise.all([userBot.bot.getMe(), bot.getMe()]);
      return bot.sendMessage(chatId, `Telegram API доступен через текущую сеть/SOCKS5: user @${userMe.username}, admin @${adminMe.username}.`);
    }
    if (entity === 'action' && action === 'telegram' && id === 'send') return bot.sendMessage(chatId, 'Тестовое сообщение SellWay Admin получено успешно.');
    if (entity === 'action' && action === 'smtp') return prompt(chatId, { kind: 'smtp_test' }, 'Введите email, на который отправить тестовое письмо:');
    if (entity === 'danger' && action === 'ask') {
      const title = id === 'autoconfirm' ? 'завершить все просроченные выданные сделки' : 'сбросить поля статистики модерации товаров';
      return bot.sendMessage(chatId, `Подтвердите действие: ${title}.`, buttons([[{ text: 'Подтвердить', callback_data: `danger:confirm:${id}` }, { text: 'Отмена', callback_data: 'input:cancel:none' }]]));
    }
    if (entity === 'danger' && action === 'confirm') {
      const count = id === 'autoconfirm' ? await autoConfirmExpired() : await resetModerationStats();
      return bot.sendMessage(chatId, id === 'autoconfirm' ? `Просроченные сделки завершены: ${count}.` : `Статистика модерации сброшена. Товаров: ${count}.`);
    }
  } catch (err) {
    logger.error('Admin bot callback error', { err: err.message, data: cq.data });
    await bot.sendMessage(chatId, `Ошибка: ${err.message}`).catch(() => {});
  }
});

async function handlePendingInput(msg, pending) {
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  if (!text && pending.kind !== 'category_icon') return;
  if (pending.kind === 'support_reply') {
    await saveSupportReply(pending.id, text.slice(0, 2000));
    return bot.sendMessage(chatId, 'Ответ поддержки отправлен.');
  }
  if (pending.kind === 'product_reject') {
    await rejectProduct(pending.id, text.slice(0, 500));
    return bot.sendMessage(chatId, 'Товар отклонен.');
  }
  if (pending.kind === 'commercial_reject') {
    await decideCommercial(pending.id, false, text.slice(0, 500));
    return bot.sendMessage(chatId, 'Коммерческий аккаунт отклонен.');
  }
  if (pending.kind === 'withdraw_reject') {
    await rejectWithdrawal(pending.id, text.slice(0, 500));
    return bot.sendMessage(chatId, 'Выплата отклонена, средства возвращены.');
  }
  if (pending.kind === 'referral_reject') {
    await decideReferral(pending.id, false, text.slice(0, 500));
    return bot.sendMessage(chatId, 'Реферальная заявка отклонена.');
  }
  if (pending.kind === 'dispute') {
    await resolveDispute(pending.id, pending.winner, text.slice(0, 1000));
    return bot.sendMessage(chatId, 'Спор разрешен.');
  }
  if (pending.kind === 'user_commission' || pending.kind === 'user_refcommission') {
    const column = pending.kind === 'user_commission' ? 'custom_commission_rate' : 'referral_commission_rate';
    const value = text === '-' ? null : Number(text.replace(',', '.'));
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 0.5)) throw new Error('Допустимое значение от 0 до 0.5');
    await query(`UPDATE sellers SET ${column}=$1 WHERE user_id=$2`, [value, pending.id]);
    return sendUserCard(chatId, pending.id);
  }
  if (pending.kind === 'user_search') return sendUserSearch(chatId, text.slice(0, 100));
  if (pending.kind === 'user_referrer') {
    let referrerId = null;
    if (text !== '-') {
      const { rows: [referrer] } = await query(
        `SELECT s.user_id FROM sellers s JOIN users u ON u.id=s.user_id
         WHERE LOWER(s.referral_code)=LOWER($1) OR LOWER(u.email)=LOWER($1) OR LOWER(u.username)=LOWER($1) LIMIT 1`,
        [text]
      );
      if (!referrer || referrer.user_id === pending.id) throw new Error('Реферер не найден или совпадает с пользователем');
      referrerId = referrer.user_id;
    }
    await query('UPDATE sellers SET referred_by_seller_id=$1 WHERE user_id=$2', [referrerId, pending.id]);
    return sendUserCard(chatId, pending.id);
  }
  if (pending.kind === 'category_new' || pending.kind === 'category_edit') {
    const [nameRaw, slugRaw, descriptionRaw] = text.split('|').map(value => String(value || '').trim());
    if (!nameRaw) throw new Error('Введите название категории');
    const slug = slugRaw || slugify(nameRaw);
    if (pending.kind === 'category_new') {
      await query(
        `INSERT INTO categories (category_type, name, slug, description, parent_id, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,TRUE,0)`,
        [pending.type, nameRaw, slug, descriptionRaw || null, pending.parentId]
      );
      return bot.sendMessage(chatId, 'Категория добавлена.');
    }
    await query('UPDATE categories SET name=$1, slug=$2, description=$3 WHERE id=$4', [nameRaw, slug, descriptionRaw || null, pending.id]);
    return sendCategoryCard(chatId, pending.id);
  }
  if (pending.kind === 'category_icon') {
    let imageUrl = text;
    if (msg.photo?.length) {
      const uploadDir = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const filePath = await bot.downloadFile(msg.photo[msg.photo.length - 1].file_id, uploadDir);
      imageUrl = `${String(process.env.UPLOAD_URL || '/uploads').replace(/\/$/, '')}/${path.basename(filePath)}`;
    } else if (text === '-') {
      imageUrl = null;
    }
    if (imageUrl === undefined || imageUrl === '') throw new Error('Отправьте изображение или URL');
    await query('UPDATE categories SET image_url=$1 WHERE id=$2', [imageUrl, pending.id]);
    return sendCategoryCard(chatId, pending.id);
  }
  if (pending.kind === 'setting') {
    if (['default_referral_commission_rate', 'max_referral_commission_rate'].includes(pending.key)) {
      const value = Number(text.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0 || value > 0.5) throw new Error('Реферальная ставка должна быть от 0 до 0.5');
    }
    if (pending.key === 'referral_payout_basis' && !['turnover', 'platform_commission'].includes(text)) {
      throw new Error('База выплат: turnover или platform_commission');
    }
    const restart = await setSetting(pending.key, text);
    await bot.sendMessage(chatId, restart ? 'Настройка сохранена. Для применения переменных перезапустите backend и Telegram-ботов через PM2.' : 'Настройка сохранена.');
    if (pending.group === 'referrals') return sendReferrals(chatId);
    return;
  }
  if (pending.kind === 'smtp_test') {
    await sendTestEmail(text);
    return bot.sendMessage(chatId, `Тестовое письмо отправлено на ${text}.`);
  }
}

bot.on('message', async msg => {
  if (!isAdminChat(msg)) return;
  const text = String(msg.text || '').trim();
  if ((text.startsWith('/') || MENU_TEXT.has(text)) && !msg.photo?.length) return;
  const pending = pendingInputs.get(String(msg.chat.id));
  if (!pending) return;
  try {
    await handlePendingInput(msg, pending);
    pendingInputs.delete(String(msg.chat.id));
  } catch (err) {
    logger.error('Admin bot input error', { err: err.message, kind: pending.kind });
    await bot.sendMessage(msg.chat.id, `Ошибка: ${err.message}\nПопробуйте еще раз или нажмите "Отменить".`);
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
  await bot.sendMessage(adminChatId,
    `Новое сообщение поддержки [${String(threadId).slice(0, 8)}]\nОт: ${user.username} (${user.email})\n\n${cut(message, 1500)}`,
    supportActions(threadId)
  );
}

bot.on('polling_error', err => logger.error('TG admin polling error', { err: err.message }));
bot.on('error', err => logger.error('TG admin bot error', { err: err.message }));

module.exports = { bot, sendToChat, sendSupportMessage };
