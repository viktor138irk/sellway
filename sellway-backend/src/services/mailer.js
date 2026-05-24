const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const BASE = process.env.FRONTEND_URL || 'https://sellway.pro';

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function mailFrom() {
  return `"SellWay" <${process.env.SMTP_USER}>`;
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
  await createTransporter().sendMail({
    from: mailFrom(),
    to: email,
    subject: 'SellWay — тест SMTP',
    html: '<h2>SellWay</h2><p>SMTP настроен корректно. Это тестовое письмо из админ-панели.</p>',
  });
}

module.exports = { sendVerifyEmail, sendResetEmail, sendGuestPasswordEmail, sendTestEmail };
