// src/routes/payments.js — ЮKassa интеграция
const router = require('express').Router();
const axios  = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/db');
const { auth, optionalAuth } = require('../middleware/auth');
const notify   = require('../services/notify');
const logger   = require('../config/logger');
const { sendGuestPasswordEmail } = require('../services/mailer');

const YUKASSA_URL = 'https://api.yookassa.ru/v3';
const DEFAULT_FRONTEND_URL = 'https://sellway.pro';
const LEGACY_WRONG_RETURN_HOSTS = new Set(['vpulse.fun', 'www.vpulse.fun', 'pay.vpulse.fun']);

const ykClient = axios.create({
  baseURL: YUKASSA_URL,
  auth: {
    username: process.env.YUKASSA_SHOP_ID,
    password: process.env.YUKASSA_SECRET_KEY,
  },
  headers: { 'Content-Type': 'application/json' },
});

function buildReturnUrl(paymentRef, productId) {
  let base = process.env.PUBLIC_SITE_URL
    ? `${process.env.PUBLIC_SITE_URL.replace(/\/+$/, '')}/payment/success`
    : (process.env.PAYMENT_RETURN_URL || `${process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL}/payment/success`);

  try {
    const url = new URL(base);
    if (LEGACY_WRONG_RETURN_HOSTS.has(url.hostname) && process.env.ALLOW_EXTERNAL_PAYMENT_RETURN !== 'true') {
      url.protocol = 'https:';
      url.hostname = 'sellway.pro';
      url.port = '';
      url.pathname = '/payment/success';
      url.search = '';
    }
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

function parseQuantity(value) {
  const quantity = Number(value || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  return quantity;
}

function generateTokens(userId, role) {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d' }
  );
  return { accessToken, refreshToken };
}

async function saveRefreshToken(userId, refreshToken, ip, userAgent) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5)',
    [userId, refreshToken, ip, userAgent, expiresAt]
  );
}

async function buildUserResponse(client, userId) {
  const { rows: [user] } = await client.query(
    `SELECT u.id, u.email, u.username, u.role, u.status, u.avatar_url,
            u.phone, u.phone_verified, u.telegram_verified, u.email_verified, u.buyer_rating, u.buyer_reviews_count, u.created_at,
            COALESCE(w.balance, 0) AS balance, COALESCE(w.held, 0) AS held,
            s.rating, s.total_sales, s.verified AS seller_verified
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN sellers s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return user;
}

async function issueGuestCheckoutSession(paymentRef, req) {
  if (!paymentRef) return null;

  return transaction(async (client) => {
    const { rows: [tx] } = await client.query(
      `SELECT id, user_id, meta
       FROM transactions
       WHERE meta->>'payment_ref'=$1
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [paymentRef]
    );

    if (!tx || tx.meta?.guest_checkout !== true || tx.meta?.guest_tokens_issued === true) return null;

    const { rows: [user] } = await client.query('SELECT id, role FROM users WHERE id=$1', [tx.user_id]);
    if (!user) return null;

    const tokens = generateTokens(user.id, user.role);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [user.id, tokens.refreshToken, req.ip, req.headers['user-agent'], expiresAt]
    );
    await client.query(
      `UPDATE transactions
       SET meta=COALESCE(meta, '{}'::jsonb) || $2::jsonb
       WHERE id=$1`,
      [tx.id, JSON.stringify({ guest_tokens_issued: true })]
    );
    await client.query('UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2', [req.ip, user.id]);

    return { ...tokens, user: await buildUserResponse(client, user.id) };
  });
}

function randomPassword() {
  return crypto.randomBytes(9).toString('base64url') + 'A1!';
}

async function makeUniqueUsername(client, email) {
  const base = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'buyer';
  for (let i = 0; i < 20; i++) {
    const username = `${base}${i ? i : ''}`.slice(0, 28);
    const { rows } = await client.query('SELECT id FROM users WHERE username=$1', [username]);
    if (!rows.length) return username;
  }
  return `buyer${crypto.randomBytes(4).toString('hex')}`;
}

async function createGuestBuyer(client, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const { rows: [existing] } = await client.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [normalizedEmail]);
  if (existing) throw { status: 409, message: 'Пользователь с таким email уже есть. Войдите в аккаунт для покупки.' };

  const password = randomPassword();
  const username = await makeUniqueUsername(client, normalizedEmail);
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows: [user] } = await client.query(
    `INSERT INTO users (email, username, password_hash, role, status, email_verified, terms_accepted_at, terms_version, registration_ip, registration_user_agent)
     VALUES ($1,$2,$3,'buyer','active',TRUE,NOW(),'guest-checkout',$4,$5)
     RETURNING id, email, username, role`,
    [normalizedEmail, username, passwordHash, null, null]
  );
  await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
  return { user, password };
}

async function commissionForSeller(client, sellerId, price) {
  const { rows: [seller] } = await client.query('SELECT custom_commission_rate FROM sellers WHERE user_id=$1', [sellerId]);
  const { rows: [setting] } = await client.query("SELECT value FROM settings WHERE key IN ('default_seller_commission_rate','platform_commission') ORDER BY CASE WHEN key='default_seller_commission_rate' THEN 0 ELSE 1 END LIMIT 1");
  const rate = seller?.custom_commission_rate != null ? Number(seller.custom_commission_rate) : Number(setting?.value || process.env.PLATFORM_COMMISSION || 0.07);
  const commission = Number((Number(price) * rate).toFixed(2));
  return { commission, sellerAmount: Number((Number(price) - commission).toFixed(2)) };
}

async function markPaymentStatus(paymentId, status) {
  await query(
    `UPDATE transactions
     SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
     WHERE meta->>'payment_id'=$1`,
    [paymentId, JSON.stringify({ status })]
  );
}

async function completeDirectPurchase(payment, source) {
  const metadata = payment.metadata || {};
  const userId = metadata.user_id;
  const productId = metadata.product_id;
  const quantity = parseQuantity(metadata.quantity) || 1;
  const amount = parseFloat(payment.amount?.value || 0);

  if (!userId || !productId || !Number.isFinite(amount) || amount <= 0) {
    return { credited: false, reason: 'invalid_direct_purchase' };
  }

  const result = await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [payment.id]);

    const { rows: [completed] } = await client.query(
      "SELECT order_id, meta FROM transactions WHERE meta->>'payment_id'=$1 AND meta->>'status'='completed' ORDER BY created_at DESC LIMIT 1",
      [payment.id]
    );
    if (completed?.order_id) return { credited: false, alreadyCompleted: true, orderId: completed.order_id };

    const { rows: [product] } = await client.query(
      `SELECT p.*, u.id AS seller_user_id
       FROM products p
       JOIN users u ON u.id=p.seller_id
       WHERE p.id=$1 AND p.status='active'
       FOR UPDATE OF p`,
      [productId]
    );
    if (!product) throw new Error('Product unavailable for direct checkout');
    if (product.seller_user_id === userId) throw new Error('Self purchase is not allowed');
    const baseAmount = Number((Number(product.price) * quantity).toFixed(2));
    let promo = null;
    if (metadata.promo_id) {
      const { rows: [candidate] } = await client.query(
        'SELECT * FROM promo_codes WHERE id=$1 AND created_by=$2 FOR UPDATE',
        [metadata.promo_id, product.seller_user_id]
      );
      promo = candidate || null;
    }
    const promoDiscount = promo ? Number(metadata.promo_discount || 0) : 0;
    const expectedAmount = Number(Math.max(1, baseAmount - promoDiscount).toFixed(2));
    if (expectedAmount.toFixed(2) !== amount.toFixed(2)) throw new Error('Payment amount mismatch');
    if (product.delivery_type === 'auto' && product.keys_count < quantity) throw new Error('No keys in stock');

    let productFile = null;
    if (product.delivery_type === 'file') {
      const { rows: [file] } = await client.query('SELECT id, url, filename, mime_type, size_bytes FROM product_files WHERE product_id=$1 ORDER BY created_at DESC LIMIT 1', [productId]);
      if (!file) throw new Error('Product file is missing');
      productFile = file;
    }

    const { commission, sellerAmount } = await commissionForSeller(client, product.seller_user_id, amount);
    const meta = product.delivery_type === 'service'
      ? { service: true, direct_checkout: true, negotiation_status: 'accepted', accepted_at: new Date().toISOString(), customer_message: metadata.message || '' }
      : {};
    const initialStatus = product.delivery_type === 'service' ? 'paid' : 'pending';
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (buyer_id, seller_id, product_id, status, quantity, amount, commission, seller_amount, delivery_type, meta, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW()) RETURNING *`,
      [userId, product.seller_user_id, productId, initialStatus, quantity, amount, commission, sellerAmount, product.delivery_type, JSON.stringify(meta)]
    );

    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await client.query('UPDATE wallets SET held=held+$1, total_in=total_in+$1, updated_at=NOW() WHERE user_id=$2', [amount, userId]);

    let finalStatus = initialStatus;
    let keys = [];
    if (product.delivery_type === 'auto') {
      const { rows: soldKeys } = await client.query(
        `UPDATE product_keys SET is_sold=TRUE, sold_at=NOW(), order_id=$1
         WHERE id IN (SELECT id FROM product_keys WHERE product_id=$2 AND NOT is_sold ORDER BY created_at ASC LIMIT $3 FOR UPDATE SKIP LOCKED)
         RETURNING id, key_value`,
        [order.id, productId, quantity]
      );
      if (soldKeys.length !== quantity) throw new Error('Could not reserve keys');
      keys = soldKeys;
      finalStatus = 'delivered';
      await client.query("UPDATE orders SET status='delivered', key_id=$1, delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours', meta=COALESCE(meta,'{}'::jsonb) || $2::jsonb WHERE id=$3", [keys[0].id, JSON.stringify({ keys: keys.map(k => k.key_value), auto_delivery_message: product.meta?.auto_delivery_message || '' }), order.id]);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, product.seller_user_id, `Ключи переданы автоматически: ${keys.length} шт.`]);
    } else if (product.delivery_type === 'file') {
      finalStatus = 'delivered';
      await client.query(`UPDATE orders SET status='delivered', delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours', meta=$1::jsonb WHERE id=$2`, [JSON.stringify({ file: productFile, direct_checkout: true }), order.id]);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, product.seller_user_id, `Файл передан автоматически: ${productFile.filename}`]);
    } else {
      await client.query("UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1", [order.id]);
      finalStatus = 'paid';
    }

    const message = product.delivery_type === 'service'
      ? 'Оплата услуги получена. Средства зарезервированы на платформе.'
      : 'Оплата получена. Средства зарезервированы на платформе.';
    await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, userId, message]);
    if (metadata.message && product.delivery_type === 'service') {
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3)`, [order.id, userId, metadata.message]);
    }

    const completedMeta = {
      status: 'completed',
      paid_at: new Date().toISOString(),
      source,
      payment_ref: metadata.payment_ref || null,
      purpose: 'direct_purchase',
      product_id: productId,
      order_id: order.id,
      quantity,
      guest_checkout: metadata.guest_checkout === 'true',
    };
    const updated = await client.query(
      `UPDATE transactions
       SET order_id=$2, meta=COALESCE(meta, '{}'::jsonb) || $3::jsonb
       WHERE meta->>'payment_id'=$1
       RETURNING id`,
      [payment.id, order.id, JSON.stringify(completedMeta)]
    );
    if (promo) await client.query('UPDATE promo_codes SET used_count=used_count+1 WHERE id=$1', [promo.id]);
    if (updated.rowCount === 0) {
      await client.query(
        `INSERT INTO transactions (user_id, order_id, type, amount, description, meta)
         VALUES ($1,$2,'hold',$3,$4,$5)`,
        [userId, order.id, amount, `Оплата заказа ${order.order_number}`, JSON.stringify({ payment_id: payment.id, ...completedMeta })]
      );
    }

    await notify.buyerOrderCreated(userId, { ...order, status: finalStatus }).catch(() => {});
    await notify.sellerNewOrder(product.seller_user_id, order, product).catch(() => {});
    logger.info('Direct checkout completed', { orderId: order.id, buyerId: userId, paymentId: payment.id, quantity, keysDelivered: keys.length });
    return { credited: true, amount, orderId: order.id };
  });

  return result;
}

async function completePaidPayment(payment, source) {
  const metadata = payment.metadata || {};
  const userId = metadata.user_id;
  const type = metadata.type || 'balance_topup';
  const amount = parseFloat(payment.amount?.value || 0);

  if (type === 'direct_purchase') {
    return completeDirectPurchase(payment, source);
  }

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
      'Баланс пополнен',
      `На ваш счёт зачислено ${amount.toLocaleString('ru')} ₽`,
      metadata.product_id ? `/product/${metadata.product_id}` : '/profile'
    ).catch(() => {});
    logger.info('Balance topped up', { userId, amount, paymentId: payment.id, source });
  }

  return result;
}

// ── POST /payments/create ── Пополнение баланса ───────

router.post('/checkout', optionalAuth, async (req, res) => {
  const productId = req.body.product_id || req.body.productId;
  const email = String(req.body.email || '').trim().toLowerCase();
  const message = String(req.body.message || '').trim().slice(0, 2000);
  const quantity = parseQuantity(req.body.quantity);
  const promoCode = String(req.body.promo_code || '').trim().toUpperCase();

  if (!productId) return res.status(400).json({ error: 'product_id обязателен' });
  if (!quantity) return res.status(400).json({ error: 'Укажите корректное количество' });
  if (!req.user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Укажите корректный email для отправки доступа' });
  }

  let guestPassword = null;
  let checkoutUser = req.user || null;

  try {
    const prepared = await transaction(async (client) => {
      const { rows: [product] } = await client.query(
        `SELECT p.*, u.username AS seller_name
         FROM products p
         JOIN users u ON u.id=p.seller_id
         WHERE p.id=$1 AND p.status='active'`,
        [productId]
      );
      if (!product) throw { status: 404, message: 'Позиция не найдена или недоступна' };
      if (product.delivery_type === 'auto' && product.keys_count < quantity) throw { status: 400, message: `В наличии только ${product.keys_count} шт.` };
      if (product.delivery_type === 'file') {
        const { rows: [file] } = await client.query('SELECT id FROM product_files WHERE product_id=$1 LIMIT 1', [productId]);
        if (!file) throw { status: 400, message: 'Файл для выдачи пока не загружен' };
      }

      let createdAccount = false;
      if (!checkoutUser) {
        const created = await createGuestBuyer(client, email);
        checkoutUser = created.user;
        guestPassword = created.password;
        createdAccount = true;
      }
      if (product.seller_id === checkoutUser.id) throw { status: 400, message: 'Нельзя купить свою позицию' };

      let promo = null;
      if (promoCode) {
        const { rows: [validPromo] } = await client.query(
          `SELECT id, code, discount_pct, discount_fixed FROM promo_codes
           WHERE code=$1 AND created_by=$2 AND is_active=TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (max_uses IS NULL OR used_count < max_uses)`,
          [promoCode, product.seller_id]
        );
        if (!validPromo) throw { status: 400, message: 'Промокод недействителен или закончился' };
        promo = validPromo;
      }
      return { product, user: checkoutUser, createdAccount, promo };
    });

    const baseAmount = Number((Number(prepared.product.price) * quantity).toFixed(2));
    const discount = prepared.promo
      ? prepared.promo.discount_pct
        ? baseAmount * Number(prepared.promo.discount_pct) / 100
        : Number(prepared.promo.discount_fixed || 0)
      : 0;
    const amount = Number(Math.max(1, baseAmount - discount).toFixed(2));
    if (!Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: 'Некорректная стоимость позиции' });

    const idempotencyKey = uuidv4();
    const paymentRef = uuidv4();
    const description = `${prepared.product.delivery_type === 'service' ? 'Оплата услуги' : 'Оплата товара'} SellWay`;

    const { data: payment } = await ykClient.post('/payments', {
      amount: { value: amount.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: buildReturnUrl(paymentRef, productId) },
      capture: true,
      description,
      metadata: {
        user_id: prepared.user.id,
        username: prepared.user.username,
        type: 'direct_purchase',
        payment_ref: paymentRef,
        product_id: productId,
        quantity: String(quantity),
        guest_checkout: prepared.createdAccount ? 'true' : 'false',
        message,
        promo_code: prepared.promo?.code || '',
        promo_id: prepared.promo?.id || '',
        promo_discount: discount.toFixed(2),
      },
    }, {
      headers: { 'Idempotence-Key': idempotencyKey },
    });

    await query(
      `INSERT INTO transactions (user_id, type, amount, description, meta)
       VALUES ($1,'hold',$2,$3,$4)`,
      [
        prepared.user.id,
        amount,
        description,
        JSON.stringify({
          payment_id: payment.id,
          payment_ref: paymentRef,
          status: 'pending',
          purpose: 'direct_purchase',
          product_id: productId,
          quantity,
          guest_checkout: prepared.createdAccount,
          promo_code: prepared.promo?.code || '',
          promo_id: prepared.promo?.id || '',
          promo_discount: discount.toFixed(2),
        }),
      ]
    );

    if (prepared.createdAccount) {
      sendGuestPasswordEmail(prepared.user.email, prepared.user.username, guestPassword).catch(err => {
        logger.error('Guest password email error', { err: err.message, email: prepared.user.email });
      });
    }

    logger.info('Checkout payment created', { userId: prepared.user.id, productId, amount, quantity, paymentId: payment.id, paymentRef, guest: prepared.createdAccount });
    res.json({
      paymentId: payment.id,
      paymentRef,
      confirmationUrl: payment.confirmation.confirmation_url,
      status: payment.status,
      createdAccount: prepared.createdAccount,
      email: prepared.user.email,
    });
  } catch (err) {
    if (guestPassword && checkoutUser?.email) {
      sendGuestPasswordEmail(checkoutUser.email, checkoutUser.username, guestPassword).catch(mailErr => {
        logger.error('Guest password email error after checkout failure', { err: mailErr.message, email: checkoutUser.email });
      });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Пользователь с таким email уже есть. Войдите в аккаунт для покупки.' });
    logger.error('Checkout create error', { err: err.response?.data || err.message });
    res.status(500).json({ error: 'Ошибка создания платежа. Попробуйте позже.' });
  }
});

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
    const guestSession = status === 'completed' ? await issueGuestCheckoutSession(req.params.ref, req) : null;

    res.json({
      status,
      paid: Boolean(payment.paid),
      credited: Boolean(completion.credited || completion.alreadyCompleted),
      orderId: completion.orderId || null,
      ...(guestSession || {}),
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
      orderId: completion.orderId || null,
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
