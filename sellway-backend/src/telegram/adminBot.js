require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('../config/logger');

const telegramToken = process.env.TELEGRAM_ADMIN_BOT_TOKEN;

function disabled() {
  const noop = async () => {};
  const fail = async () => { throw new Error('TELEGRAM_ADMIN_BOT_TOKEN is not configured'); };
  if (require.main === module) setInterval(() => {}, 60 * 60 * 1000);
  return { bot: null, sendToChat: fail, start: noop };
}

if (!telegramToken || telegramToken === 'your_admin_bot_token_from_botfather' || telegramToken.startsWith('your_')) {
  logger.warn('Telegram admin bot disabled: TELEGRAM_ADMIN_BOT_TOKEN is not configured');
  module.exports = disabled();
  return;
}

function createProxyAgent() {
  if (process.env.PROXY_ENABLED !== 'true') return null;
  const { PROXY_HOST: h, PROXY_PORT: p, PROXY_USERNAME: u, PROXY_PASSWORD: pw } = process.env;
  if (!h || !p) {
    logger.warn('PROXY_ENABLED=true but PROXY_HOST/PORT missing');
    return null;
  }
  const auth = u && pw ? `${u}:${pw}@` : '';
  logger.info(`Telegram admin bot using SOCKS5 proxy: ${h}:${p}`);
  return new SocksProxyAgent(`socks5://${auth}${h}:${p}`);
}

const agent = createProxyAgent();
const pollingEnabled = require.main === module || process.env.TELEGRAM_ADMIN_POLLING === 'true';
const bot = new TelegramBot(telegramToken, {
  polling: pollingEnabled,
  ...(agent && { request: { agent } }),
});

logger.info(pollingEnabled ? 'Telegram admin bot polling started' : 'Telegram admin bot client ready');

bot.onText(/\/start|\/help/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `SellWay Admin Bot\n\nChat ID: ${msg.chat.id}\n\nУкажите этот ID в TELEGRAM_ADMIN_CHAT_ID, чтобы получать админ-уведомления.`
  );
});

bot.onText(/\/id/, async (msg) => {
  await bot.sendMessage(msg.chat.id, String(msg.chat.id));
});

bot.onText(/\/status/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'SellWay Admin Bot работает.');
});

async function sendToChat(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    logger.error('adminBot sendToChat error', { chatId, err: err.message });
    throw err;
  }
}

bot.on('polling_error', err => logger.error('TG admin polling error', { err: err.message }));
bot.on('error', err => logger.error('TG admin bot error', { err: err.message }));

module.exports = { bot, sendToChat };
