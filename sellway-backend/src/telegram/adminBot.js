const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const TelegramBot = require('node-telegram-bot-api');
const logger = require('../config/logger');
const { createTelegramRequestOptions } = require('./proxy');

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

const pollingEnabled = require.main === module || process.env.TELEGRAM_ADMIN_POLLING === 'true';
const bot = new TelegramBot(telegramToken, {
  polling: false,
  ...createTelegramRequestOptions('Telegram admin bot'),
});
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
    logger.info('Telegram admin bot polling started', { username: me.username, id: me.id });
  } catch (err) {
    logger.error('Telegram admin bot polling start error', { err: err.message });
    pollingRetryTimer = setTimeout(startPolling, 60 * 1000);
  }
}

if (pollingEnabled) {
  startPolling();
  setInterval(() => {}, 60 * 60 * 1000);
}
else logger.info('Telegram admin bot client ready');

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
