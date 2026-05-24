const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('../config/logger');

function proxyEnabled() {
  return String(process.env.PROXY_ENABLED || '').toLowerCase() === 'true';
}

function proxySummary() {
  if (!proxyEnabled()) return 'disabled';
  const host = process.env.PROXY_HOST || '';
  const port = process.env.PROXY_PORT || '';
  const auth = process.env.PROXY_USERNAME ? 'auth' : 'no-auth';
  return `${host}:${port} (${auth})`;
}

function createTelegramRequestOptions(label = 'Telegram') {
  if (!proxyEnabled()) return {};

  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;

  if (!host || !port) {
    logger.warn(`${label}: PROXY_ENABLED=true but PROXY_HOST/PROXY_PORT missing`);
    return {};
  }

  const auth = username && password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : '';
  const proxyUrl = `socks5://${auth}${host}:${port}`;
  logger.info(`${label} using SOCKS5 proxy`, { host, port, auth: Boolean(username && password) });

  return {
    request: {
      agent: new SocksProxyAgent(proxyUrl),
      proxy: null,
      timeout: 30000,
      forever: true,
    },
  };
}

module.exports = { createTelegramRequestOptions, proxyEnabled, proxySummary };
