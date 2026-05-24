#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'sellway-backend', '.env') });

const TelegramBot = require(path.resolve(__dirname, '..', 'sellway-backend', 'node_modules', 'node-telegram-bot-api'));
const { createTelegramRequestOptions, proxySummary } = require('../sellway-backend/src/telegram/proxy');

async function check(label, tokenKey, usernameKey) {
  const token = process.env[tokenKey];
  if (!token || token.startsWith('your_')) {
    throw new Error(`${tokenKey} is not configured`);
  }
  const bot = new TelegramBot(token, {
    polling: false,
    ...createTelegramRequestOptions(label),
  });
  const me = await bot.getMe();
  const expected = String(process.env[usernameKey] || '').replace(/^@+/, '');
  const suffix = expected && expected !== me.username
    ? `, WARNING: ${usernameKey}=${expected}, actual=${me.username}`
    : '';
  console.log(`${label}: OK @${me.username} id=${me.id}${suffix}`);
}

(async () => {
  console.log(`SOCKS5: ${proxySummary()}`);
  await check('User bot', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME');
  await check('Admin bot', 'TELEGRAM_ADMIN_BOT_TOKEN', 'TELEGRAM_ADMIN_BOT_USERNAME');
})().catch((err) => {
  console.error(`Telegram check failed: ${err.message}`);
  process.exit(1);
});
