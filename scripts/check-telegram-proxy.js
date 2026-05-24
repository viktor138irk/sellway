#!/usr/bin/env node
const fs = require('fs');
const net = require('net');
const path = require('path');

const envPath = path.resolve(__dirname, '..', 'sellway-backend', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const TelegramBot = require(path.resolve(__dirname, '..', 'sellway-backend', 'node_modules', 'node-telegram-bot-api'));
const { createTelegramRequestOptions, proxySummary } = require('../sellway-backend/src/telegram/proxy');

function checkTcp(host, port, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port), timeout: timeoutMs });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`TCP timeout ${host}:${port}`));
    });
    socket.once('error', reject);
  });
}

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
  if (String(process.env.PROXY_ENABLED || '').toLowerCase() === 'true') {
    const host = process.env.PROXY_HOST;
    const port = process.env.PROXY_PORT;
    if (!host || !port) throw new Error('PROXY_ENABLED=true, but PROXY_HOST/PROXY_PORT are empty');
    await checkTcp(host, port);
    console.log(`SOCKS5 TCP: OK ${host}:${port}`);
  }
  await check('User bot', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME');
  await check('Admin bot', 'TELEGRAM_ADMIN_BOT_TOKEN', 'TELEGRAM_ADMIN_BOT_USERNAME');
})().catch((err) => {
  console.error(`Telegram check failed: ${err.message}`);
  process.exit(1);
});
