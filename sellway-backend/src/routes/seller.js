const router = require('express').Router();
const crypto = require('crypto');
const { query, transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');

router.use(auth, requireRole('seller', 'admin'));

// ── Dashboard ────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [wallet, seller, recentOrders, products, referralStats] = await Promise.all([
      query('SELECT * FROM wallets WHERE user_id=$1', [req.user.id]),
      query('SELECT * FROM sellers WHERE user_id=$1', [req.user.id]),
      query(
        `SELECT o.*, p.title AS product_title FROM orders o
         JOIN products p ON p.id=o.product_id
         WHERE o.seller_id=$1 ORDER BY o.created_at DESC LIMIT 10`,
        [req.user.id]
      ),
      query(
        "SELECT id, title, price, status, keys_count, sales_count FROM products WHERE seller_id=$1 AND status!='archived' ORDER BY created_at DESC",
        [req.user.id]
      ),
      query(
        `SELECT COUNT(*) AS referred_count,
                COALESCE(SUM(CASE WHEN child.created_at >= NOW()-INTERVAL '30 days' THEN 1 ELSE 0 END),0) AS referred_30d
         FROM sellers child
         WHERE child.referred_by_seller_id=$1`,
        [req.user.id]
      ),
    ]);
    res.json({
      wallet: wallet.rows[0],
      seller: seller.rows[0],
      recentOrders: recentOrders.rows,
      products: products.rows,
      referral: {
        code: seller.rows[0]?.referral_code || null,
        link: seller.rows[0]?.referral_code ? `${process.env.FRONTEND_URL || 'https://sellway.pro'}/register?role=seller&ref=${seller.rows[0].referral_code}` : null,
        referredCount: parseInt(referralStats.rows[0]?.referred_count || 0),
        referred30d: parseInt(referralStats.rows[0]?.referred_30d || 0),
        earnings: seller.rows[0]?.referral_earnings || '0.00',
        referralRate: seller.rows[0]?.referral_commission_rate || '0.0100',
        commissionRate: seller.rows[0]?.custom_commission_rate || null,
      },
    });
  } catch (err) {
    logger.error('Seller dashboard error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Withdrawal: правильная комиссия по методу ────────
const WITHDRAW_COMMISSION = { card: 0.02, paypal: 0.02, sbp: 0.01, crypto: 0.01 };

router.post('/withdrawal', async (req, res) => {
  const { amount, method, requisites } = req.body;
  const amt = parseFloat(amount);

  if (!amt || amt < 500) return res.status(400).json({ error: 'Минимальная сумма 500 ₽' });
  if (!WITHDRAW_COMMISSION[method]) return res.status(400).json({ error: 'Неверный метод вывода' });
  if (!requisites?.account?.trim()) return res.status(400).json({ error: 'Укажите реквизиты' });

  try {
    const w = await transaction(async (client) => {
      const { rows: [wallet] } = await client.query(
        'SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',
        [req.user.id]
      );
      if (!wallet || parseFloat(wallet.balance) < amt) {
        throw { status: 402, message: 'Недостаточно средств' };
      }

      const commission = parseFloat((amt * WITHDRAW_COMMISSION[method]).toFixed(2));
      const netAmount  = parseFloat((amt - commission).toFixed(2));

      const { rows: [w] } = await client.query(
        `INSERT INTO withdrawal_requests (user_id, amount, commission, net_amount, method, requisites)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, amt, commission, netAmount, method, JSON.stringify(requisites)]
      );
      await client.query('UPDATE wallets SET balance=balance-$1 WHERE user_id=$2', [amt, req.user.id]);

      return w;
    });

    notify.notifyAdmins('system',
      '💸 Новая заявка на вывод',
      `${req.user.username}: ${amt.toLocaleString('ru')} ₽ через ${method}`,
      '/admin/withdrawals'
    ).catch(() => {});

    logger.info('Withdrawal requested', { userId: req.user.id, amount: amt, method });
    res.status(201).json({ withdrawal: w });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Withdrawal error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Telegram link: используем настоящую колонку ──────
router.post('/telegram-link', async (req, res) => {
  try {
    const token   = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    await query(
      'UPDATE users SET telegram_link_token=$1, telegram_link_expires=$2 WHERE id=$3',
      [token, expires, req.user.id]
    );

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'SellWayBot';
    res.json({
      link: `https://t.me/${botUsername}?start=${token}`,
      token,
      expiresAt: expires,
    });
  } catch (err) {
    logger.error('Telegram link error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
