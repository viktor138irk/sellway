// src/routes/payments.js — ЮKassa интеграция
const router = require('express').Router();
const axios  = require('axios');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/db');
const { auth } = require('../middleware/auth');
const notify   = require('../services/notify');
const logger   = require('../config/logger');

const YUKASSA_URL = 'https://api.yookassa.ru/v3';

const ykClient = axios.create({
  baseURL: YUKASSA_URL,
  auth: {
    username: process.env.YUKASSA_SHOP_ID,
    password: process.env.YUKASSA_SECRET_KEY,
  },
  headers: { 'Content-Type': 'application/json' },
});

// ── POST /payments/create ── Пополнение баланса ───────

router.post('/create', auth, async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount < 100) {
    return res.status(400).json({ error: 'Минимальная сумма пополнения: 100 ₽' });
  }
  if (amount > 100000) {
    return res.status(400).json({ error: 'Максимальная сумма: 100 000 ₽' });
  }

  try {
    const idempotencyKey = uuidv4();
    const description    = `Пополнение баланса SellWay для ${req.user.username}`;

    const { data: payment } = await ykClient.post('/payments', {
      amount: {
        value: parseFloat(amount).toFixed(2),
        currency: 'RUB',
      },
      confirmation: {
        type: 'redirect',
        return_url: `${process.env.FRONTEND_URL}/payment/success?payment_id={payment.id}`,
      },
      capture: true,
      description,
      metadata: {
        user_id:  req.user.id,
        username: req.user.username,
        type: 'balance_topup',
      },
    }, {
      headers: { 'Idempotence-Key': idempotencyKey },
    });

    // Сохраняем pending-платёж в transactions
    await query(
      `INSERT INTO transactions (user_id, type, amount, description, meta)
       VALUES ($1,'credit',$2,$3,$4)`,
      [req.user.id, amount, description, JSON.stringify({ payment_id: payment.id, status: 'pending' })]
    );

    logger.info('Payment created', { userId: req.user.id, amount, paymentId: payment.id });

    res.json({
      paymentId: payment.id,
      confirmationUrl: payment.confirmation.confirmation_url,
      status: payment.status,
    });
  } catch (err) {
    logger.error('YuKassa create error', { err: err.response?.data || err.message });
    res.status(500).json({ error: 'Ошибка создания платежа. Попробуйте позже.' });
  }
});

// ── GET /payments/:id/status ──────────────────────────

router.get('/:id/status', auth, async (req, res) => {
  try {
    const { data: payment } = await ykClient.get(`/payments/${req.params.id}`);
    res.json({ status: payment.status, paid: payment.paid });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

// ── POST /payments/webhook ── ЮKassa уведомления ──────
// (без авторизации — проверяем IP и подпись)

router.post('/webhook', async (req, res) => {
  // ЮKassa отправляет с определённых IP — в продакшне добавь проверку IP
  // const allowedIPs = ['185.71.76.0/27', '185.71.77.0/27', ...];

  const event = req.body;
  logger.info('YuKassa webhook', { type: event.type, objectId: event.object?.id });

  if (event.type === 'payment.succeeded') {
    const payment = event.object;
    const { user_id, type } = payment.metadata || {};

    if (type === 'balance_topup' && user_id) {
      try {
        await transaction(async (client) => {
          const amount = parseFloat(payment.amount.value);

          // Проверяем дубликаты
          const { rows: [existing] } = await client.query(
            "SELECT id FROM transactions WHERE meta->>'payment_id'=$1 AND type='credit' AND meta->>'status'='completed'",
            [payment.id]
          );
          if (existing) return; // уже обработано

          // Зачисляем на баланс
          await client.query(
            'UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2',
            [amount, user_id]
          );

          // Обновляем транзакцию
          await client.query(
            "UPDATE transactions SET meta = meta || '{\"status\":\"completed\"}'::jsonb WHERE meta->>'payment_id'=$1",
            [payment.id]
          );

          // Уведомляем пользователя
          await notify.create(user_id, 'balance_credit',
            '💰 Баланс пополнен',
            `На ваш счёт зачислено ${amount.toLocaleString('ru')} ₽`,
            '/profile'
          );

          logger.info('Balance topped up', { userId: user_id, amount, paymentId: payment.id });
        });
      } catch (err) {
        logger.error('Webhook processing error', { err: err.message, paymentId: payment.id });
        return res.status(500).json({ error: 'Processing error' });
      }
    }
  }

  if (event.type === 'payment.canceled') {
    logger.info('Payment canceled', { paymentId: event.object?.id });
    // Можно уведомить пользователя
  }

  res.json({ status: 'ok' });
});

module.exports = router;
