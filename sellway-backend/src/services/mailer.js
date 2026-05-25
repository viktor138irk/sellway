const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const BASE = process.env.FRONTEND_URL || 'https://sellway.pro';

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
  const family = parseInt(process.env.SMTP_FAMILY || '4', 10);
  const connectionTimeout = parseInt(process.env.SMTP_CONNECTION_TIMEOUT || '15000', 10);
  if (!host) throw new Error('SMTP_HOST не указан');
  if (!user) throw new Error('SMTP_USER не указан');
  if (!pass) throw new Error('SMTP_PASS не указан');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT указан неверно');
  return { host, user, pass, port, secure, family: family === 6 ? 6 : 4, connectionTimeout };
}

function createTransporter() {
  const cfg = smtpConfig();
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    family: cfg.family,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: cfg.connectionTimeout,
    greetingTimeout: cfg.connectionTimeout,
    socketTimeout: Math.max(cfg.connectionTimeout * 2, 20000),
    tls: { servername: cfg.host },
  });
}

function explainError(err, cfg) {
  const text = String(err?.message || err || 'Неизвестная ошибка');
  if (/timeout|ETIMEDOUT/i.test(text)) {
    return `Таймаут подключения к ${cfg.host}:${cfg.port} по IPv${cfg.family}. Проверьте порт и TLS (465 + secure=true или 587 + secure=false), а также доступ сервера к SMTP`;
  }
  if (/ECONNREFUSED|ESOCKET|ECONNECTION/i.test(text)) {
    return `SMTP ${cfg.host}:${cfg.port} отклонил соединение: ${text}`;
  }
  return text;
}

function mailFrom() {
  return `"SellWay" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
}

async function sendVerifyEmail(email, username, token) {
  const link = `${BASE}/verify-email/${token}`;
  await createTransporter().sendMail({
    from: mailFrom(), to: email,
    subject: 'SellWay — Подтверждение email',
    html: `<h2>Привет, ${username}!</h2><p>Подтверди email: <a href="${link}">${link}</a></p><p>Ссылка действует 24 часа.</p>`,
  });
}

async function sendResetEmail(email, username, token) {
  const link = `${BASE}/reset-password/${token}`;
  await createTransporter().sendMail({
    from: mailFrom(), to: email,
    subject: 'SellWay — Сброс пароля',
    html: `<h2>Привет, ${username}!</h2><p>Сбросить пароль: <a href="${link}">${link}</a></p><p>Ссылка действует 1 час.</p>`,
  });
}

async function sendGuestPasswordEmail(email, username, password) {
  const loginLink = `${BASE}/login`;
  await createTransporter().sendMail({
    from: mailFrom(),
    to: email,
    subject: 'SellWay — Доступ к покупке',
    html: `<h2>Привет, ${username}!</h2><p>Мы создали аккаунт для вашей покупки на SellWay.</p><p><b>Email:</b> ${email}<br/><b>Пароль:</b> ${password}</p><p>Войти можно здесь: <a href="${loginLink}">${loginLink}</a></p><p>После входа рекомендуем сменить пароль в настройках профиля.</p>`,
  });
}

async function sendTestEmail(email) {
  const cfg = smtpConfig();
  const transporter = createTransporter();
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: mailFrom(),
      to: email,
      subject: 'SellWay — тест SMTP',
      html: '<h2>SellWay</h2><p>SMTP настроен корректно. Это тестовое письмо из админ-панели.</p>',
    });
    return { host: cfg.host, port: cfg.port, secure: cfg.secure, family: cfg.family };
  } catch (err) {
    throw new Error(explainError(err, cfg));
  } finally {
    transporter.close();
  }
}

module.exports = { sendVerifyEmail, sendResetEmail, sendGuestPasswordEmail, sendTestEmail };
