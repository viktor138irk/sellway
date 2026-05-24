// src/routes/payments.js — ЮKassa интеграция
const router = require('express').Router();
const axios  = require('axios');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/db');
const { auth } = require('../middleware/auth');
const notify   = require('../services/notify');
const logger   = require('../config/logger');

const YUKASSA_URL = 'https://api.yookassa.ru/v3';
const DEFAULT_FRONTEND_URL = 'https://sellway.pro';

const ykClient = axios.create({
  baseURL: YUKASSA_URL,
  auth: {
    username: process.env.YUKASSA_SHOP_ID,
    password: process.env.YUKASSA_SECRET_KEY,
  },
  headers: { 'Content-Type': 'application/json' },
});

function buildReturnUrl(paymentRef, productId) {
  const base = process.env.PAYMENT_RETURN_URL || `${process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL}/payment/success`;

  try {
    const url = new URL(base);
    url.searchParams.set('payment_ref', paymentRef);
    if (productId) url.searchParams.set('product_id', productId);
    return url.toString();
  } catch {
    const glue = base.includes('?') ? '&' : '?';
    const extra = productId ? `&product_id=${encodeURIComponent(productId)}` : '';
    return `${base}${glue}payment_ref=${encodeURIComponent(paymentRef)}${extra}`;
  }
}

function paymentStatus(payment) {
  if (payment?.paid || payment?.status === 'succeeded') return 'completed';
  if (payment?.status === 'canceled') return 'canceled';
  return payment?.status || 'pending';
}

async function markPaymentStatus(paymentId, status) {
  await query(
    `UPDATE transactions
     SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
     WHERE meta->>'payment_id'=$1`,
    [paymentId, JSON.stringify({ status })]
  );
}

async function completePaidPayment(payment, source) {
  const metadata = payment.metadata || {};
  const userId = metadata.user_id;
  const type = metadata.type || 'balance_topup';
  const amount = parseFloat(payment.amount?.value || 0);

  if (!userId || !['balance_topup', 'product_purchase'].includes(type) || !Number.isFinite(amount) || amount <= 0) {
    return { credited: false, reason: 'ignored' };
  }

  const result = await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [payment.id]);

    const { rows: [existing] } = await client.query(
      "SELECT id FROM transactions WHERE meta->>'payment_id'=$1 AND type='credit' AND meta->>'status'='completed'",
      [payment.id]
    );
    if (existing) return { credited: false, alreadyCompleted: true };

    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    await client.query(
      'UPDATE wallets SET balance=balance+$1, total_in=total_in+$1, updated_at=NOW() WHERE user_id=$2',
      [amount, userId]
    );

    const completedMeta = {
      status: 'completed',
      paid_at: new Date().toISOString(),
      source,
      payment_ref: metadata.payment_ref || null,
      purpose: type,
      product_id: metadata.product_id || null,
    };
    const updated = await client.query(
      `UPDATE transactions
       SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
       WHERE meta->>'payment_id'=$1
       RETURNING id`,
      [payment.id, JSON.stringify(completedMeta)]
    );

    if (updated.rowCount === 0) {
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, meta)
         VALUES ($1,'credit',$2,$3,$4)`,
        [
          userId,
          amount,
          type === 'product_purchase' ? 'Пополнение для покупки' : 'Пополнение баланса',
          JSON.stringify({ payment_id: payment.id, ...completedMeta }),
        ]
      );
    }

    return { credited: true, amount };
  });

  if (result.credited) {
    await notify.create(
      userId,
      'balance_credit',
      '💰 Баланс пополнен',
      `На ваш счёт зачислено ${amount.toLocaleString('ru')} ₽`,
      metadata.product_id ? `/product/${metadata.product_id}` : '/profile'
    ).catch(() => {});
    logger.info('Balance topped up', { userId, amount, paymentId: payment.id, source });
  }

  return result;
}

// ── POST /payments/create ── Пополнение баланса ───────

router.post('/create', auth, async (req, res) => {
  const amount = parseFloat(req.body.amount);
  const productId = req.body.product_id || req.body.productId || null;

  if (!Number.isFinite(amount) || amount < 100) {
    return res.status(400).json({ error: 'Минимальная сумма пополнения: 100 ₽' });
  }
  if (amount > 100000) {
    return res.status(400).json({ error: 'Максимальная сумма: 100 000 ₽' });
  }

  try {
    const idempotencyKey = uuidv4();
    const paymentRef = uuidv4();
    const purpose = productId ? 'product_purchase' : 'balance_topup';
    const description = productId
      ? `Пополнение для покупки SellWay (${req.user.username})`
      : `Пополнение баланса SellWay для ${req.user.username}`;

    const { data: payment } = await ykClient.post('/payments', {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB',
      },
      confirmation: {
        type: 'redirect',
        return_url: buildReturnUrl(paymentRef, productId),
      },
      capture: true,
      description,
      metadata: {
        user_id: req.user.id,
        username: req.user.username,
        type: purpose,
        payment_ref: paymentRef,
        product_id: productId,
      },
    }, {
      headers: { 'Idempotence-Key': idempotencyKey },
    });

    await query(
      `INSERT INTO transactions (user_id, type, amount, description, meta)
       VALUES ($1,'credit',$2,$3,$4)`,
      [
        req.user.id,
        amount,
        description,
        JSON.stringify({
          payment_id: payment.id,
          payment_ref: paymentRef,
          status: 'pending',
          purpose,
          product_id: productId,
        }),
      ]
    );

    logger.info('Payment created', { userId: req.user.id, amount, paymentId: payment.id, paymentRef });

    res.json({
      paymentId: payment.id,
      paymentRef,
      confirmationUrl: payment.confirmation.confirmation_url,
      status: payment.status,
    });
  } catch (err) {
    logger.error('YuKassa create error', { err: err.response?.data || err.message });
    res.status(500).json({ error: 'Ошибка создания платежа. Попробуйте позже.' });
  }
});

// ── GET /payments/return/:ref ── Проверка после возврата из ЮKassa ───────

router.get('/return/:ref', async (req, res) => {
  try {
    const { rows: [tx] } = await query(
      "SELECT meta FROM transactions WHERE meta->>'payment_ref'=$1 ORDER BY created_at DESC LIMIT 1",
      [req.params.ref]
    );
    const paymentId = tx?.meta?.payment_id;
    if (!paymentId) return res.status(404).json({ error: 'Платёж не найден' });

    const { data: payment } = await ykClient.get(`/payments/${paymentId}`);
    const status = paymentStatus(payment);
    let completion = { credited: false };

    if (status === 'completed') {
      completion = await completePaidPayment(payment, 'return');
    } else if (status === 'canceled') {
      await markPaymentStatus(payment.id, 'canceled');
    }

    res.json({
      status,
      paid: Boolean(payment.paid),
      credited: Boolean(completion.credited || completion.alreadyCompleted),
    });
  } catch (err) {
    logger.error('Payment return sync error', { err: err.response?.data || err.message, ref: req.params.ref });
    res.status(500).json({ error: 'Ошибка проверки платежа' });
  }
});

// ── GET /payments/:id/status ──────────────────────────

router.get('/:id/status', auth, async (req, res) => {
  try {
    const { data: payment } = await ykClient.get(`/payments/${req.params.id}`);
    const status = paymentStatus(payment);
    let completion = { credited: false };

    if (status === 'completed') {
      completion = await completePaidPayment(payment, 'status');
    } else if (status === 'canceled') {
      await markPaymentStatus(payment.id, 'canceled');
    }

    res.json({
      status,
      paid: Boolean(payment.paid),
      credited: Boolean(completion.credited || completion.alreadyCompleted),
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

// ── POST /payments/webhook ── ЮKassa уведомления ──────
// (без авторизации — проверяем IP и подпись)

router.post('/webhook', async (req, res) => {
  const event = req.body;
  logger.info('YuKassa webhook', { type: event.type, objectId: event.object?.id });

  if (event.type === 'payment.succeeded') {
    try {
      await completePaidPayment(event.object, 'webhook');
    } catch (err) {
      logger.error('Webhook processing error', { err: err.message, paymentId: event.object?.id });
      return res.status(500).json({ error: 'Processing error' });
    }
  }

  if (event.type === 'payment.canceled' && event.object?.id) {
    await markPaymentStatus(event.object.id, 'canceled').catch(() => {});
    logger.info('Payment canceled', { paymentId: event.object.id });
  }

  res.json({ status: 'ok' });
});

module.exports = router;
