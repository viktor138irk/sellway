const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { query, transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');
const { canUseReferralProgram, referralRequirements } = require('../services/referralEligibility');

router.use(auth, requireRole('seller', 'freelancer', 'admin'));

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
    filename: (req, file, cb) => cb(null, `seller-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10) },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype);
    cb(ok ? null : new Error('Можно загрузить только изображение'), ok);
  },
});

function roleForLink(role) { return role === 'freelancer' ? 'freelancer' : 'seller'; }
function referralLink(code, role) { return code ? `${process.env.FRONTEND_URL || 'https://sellway.pro'}/register?role=${roleForLink(role)}&ref=${code}` : null; }

router.post('/avatar', avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const baseUrl = process.env.UPLOAD_URL || '/uploads';
    const avatarUrl = `${baseUrl}/${req.file.filename}`;
    await query('UPDATE users SET avatar_url=$1 WHERE id=$2', [avatarUrl, req.user.id]);
    await query('UPDATE sellers SET updated_at=NOW() WHERE user_id=$1', [req.user.id]).catch(() => {});
    logger.info('Seller avatar updated', { userId: req.user.id, avatarUrl });
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    logger.error('Seller avatar upload error', { err: err.message });
    res.status(500).json({ error: 'Ошибка загрузки логотипа' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [wallet, seller, recentOrders, products, referralStats] = await Promise.all([
      query('SELECT * FROM wallets WHERE user_id=$1', [req.user.id]),
      query('SELECT * FROM sellers WHERE user_id=$1', [req.user.id]),
      query(`SELECT o.*, p.title AS product_title FROM orders o JOIN products p ON p.id=o.product_id WHERE o.seller_id=$1 ORDER BY o.created_at DESC LIMIT 10`, [req.user.id]),
      query("SELECT id, title, price, status, delivery_type, keys_count, sales_count FROM products WHERE seller_id=$1 AND status!='archived' ORDER BY created_at DESC", [req.user.id]),
      query(`SELECT COUNT(*) AS referred_count, COALESCE(SUM(CASE WHEN child.created_at >= NOW()-INTERVAL '30 days' THEN 1 ELSE 0 END),0) AS referred_30d FROM sellers child WHERE child.referred_by_seller_id=$1`, [req.user.id]),
    ]);
    const s = seller.rows[0] || {};
    const requirements = referralRequirements(req.user);
    const canUseReferral = Boolean(s.referral_enabled && s.referral_application_status === 'approved' && canUseReferralProgram(req.user));
    res.json({
      wallet: wallet.rows[0], seller: s, recentOrders: recentOrders.rows, products: products.rows,
      referral: {
        code: s.referral_code || null,
        link: canUseReferral ? referralLink(s.referral_code, req.user.role) : null,
        referredCount: parseInt(referralStats.rows[0]?.referred_count || 0),
        referred30d: parseInt(referralStats.rows[0]?.referred_30d || 0),
        earnings: s.referral_earnings || '0.00',
        referralRate: s.referral_commission_rate || '0.0100',
        commissionRate: s.custom_commission_rate || null,
        role: roleForLink(req.user.role),
        enabled: canUseReferral,
        applicationStatus: s.referral_application_status || 'not_requested',
        requirements,
      },
    });
  } catch (err) { logger.error('Seller dashboard error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/referrals', async (req, res) => {
  try {
    const { rows: [seller] } = await query('SELECT * FROM sellers WHERE user_id=$1', [req.user.id]);
    if (!seller) return res.status(404).json({ error: 'Профиль продавца/фрилансера не найден' });
    const requirements = referralRequirements(req.user);
    const canUseReferral = Boolean(seller.referral_enabled && seller.referral_application_status === 'approved' && canUseReferralProgram(req.user));
    const { rows: referred } = await query(`SELECT child.user_id, u.username, u.email, u.role, child.created_at, child.referral_commission_rate, child.total_sales, COALESCE(SUM(o.amount),0) AS turnover, COUNT(o.id)::int AS orders_count, COALESCE(SUM(rt.amount),0) AS paid_to_you FROM sellers child JOIN users u ON u.id=child.user_id LEFT JOIN orders o ON o.seller_id=child.user_id AND o.status='confirmed' LEFT JOIN transactions rt ON rt.order_id=o.id AND rt.user_id=$1 AND rt.meta->>'source'='seller_referral' WHERE child.referred_by_seller_id=$1 GROUP BY child.user_id, u.username, u.email, u.role, child.created_at, child.referral_commission_rate, child.total_sales ORDER BY child.created_at DESC`, [req.user.id]);
    const { rows: payments } = await query(`SELECT t.id, t.amount, t.description, t.created_at, t.order_id, o.order_number, p.title AS product_title, seller_u.username AS seller_name FROM transactions t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN products p ON p.id=o.product_id LEFT JOIN users seller_u ON seller_u.id=o.seller_id WHERE t.user_id=$1 AND t.meta->>'source'='seller_referral' ORDER BY t.created_at DESC LIMIT 50`, [req.user.id]);
    const summary = referred.reduce((acc, r) => { acc.referredCount += 1; acc.turnover += Number(r.turnover || 0); acc.ordersCount += Number(r.orders_count || 0); acc.paidToYou += Number(r.paid_to_you || 0); return acc; }, { referredCount: 0, turnover: 0, ordersCount: 0, paidToYou: 0 });
    res.json({
      referral: { code: seller.referral_code, link: canUseReferral ? referralLink(seller.referral_code, req.user.role) : null, rate: seller.referral_commission_rate || '0.0100', earnings: seller.referral_earnings || '0.00', role: roleForLink(req.user.role), enabled: canUseReferral, applicationStatus: seller.referral_application_status || 'not_requested', rejectReason: seller.referral_reject_reason || '', requirements },
      summary, referred, payments,
    });
  } catch (err) { logger.error('Referrals page error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/referrals/apply', async (req, res) => {
  try {
    if (!canUseReferralProgram(req.user)) {
      const requirements = referralRequirements(req.user);
      return res.status(400).json({ error: requirements.full ? 'Для заявки нужно подтвердить email, телефон и Telegram' : 'Для заявки нужно подтвердить email' });
    }
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    await transaction(async (client) => {
      const { rows: [seller] } = await client.query('SELECT * FROM sellers WHERE user_id=$1 FOR UPDATE', [req.user.id]);
      if (!seller) throw { status: 404, message: 'Профиль продавца/фрилансера не найден' };
      if (seller.referral_application_status === 'approved') throw { status: 400, message: 'Реферальная программа уже одобрена' };
      if (seller.referral_application_status === 'pending') throw { status: 400, message: 'Заявка уже отправлена на модерацию' };
      await client.query(`UPDATE sellers SET referral_application_status='pending', referral_requested_at=NOW(), referral_reject_reason=NULL, referral_moderation_note=$1 WHERE user_id=$2`, [note, req.user.id]);
    });
    await notify.notifyAdmins('system', 'Заявка на реферальную программу', `${req.user.username} отправил заявку на участие в реферальной программе`, '/admin/referrals').catch(() => {});
    res.json({ message: 'Заявка отправлена на модерацию' });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Referral apply error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

const WITHDRAW_METHODS = { card: { label: 'Банковская карта', icon: '💳', placeholder: 'Номер карты' }, sbp: { label: 'СБП (Быстрые платежи)', icon: '⚡', placeholder: 'Номер телефона' }, paypal: { label: 'PayPal', icon: '🅿️', placeholder: 'Email PayPal' }, crypto: { label: 'Криптовалюта', icon: '₿', placeholder: 'Адрес кошелька' } };
async function getUsdtRateRub(settings = {}) {
  const fallback = parseFloat(settings.usdt_rub_rate_fallback || process.env.USDT_RUB_RATE || 90);
  try {
    const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    const usd = parseFloat(data?.Valute?.USD?.Value);
    if (usd > 0) return parseFloat((usd * 0.99).toFixed(4));
  } catch (err) {
    logger.warn('USDT rate fetch failed, fallback used', { err: err.message });
  }
  return parseFloat((fallback * 0.99).toFixed(4));
}

async function getWithdrawConfig(client = { query }, userId = null) {
  const { rows } = await client.query(
    `SELECT key, value FROM settings WHERE key IN (
      'min_withdrawal','max_withdrawal_daily','usdt_rub_rate_fallback',
      'withdraw_method_card_enabled','withdraw_method_card_commission',
      'withdraw_method_sbp_enabled','withdraw_method_sbp_commission',
      'withdraw_method_paypal_enabled','withdraw_method_paypal_commission',
      'withdraw_method_crypto_enabled','withdraw_method_crypto_commission',
      'auto_payouts_enabled','auto_payout_min_balance','auto_payout_interval_hours'
    )`
  );
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const methods = Object.entries(WITHDRAW_METHODS).map(([id, meta]) => ({
    id,
    ...meta,
    enabled: settings[`withdraw_method_${id}_enabled`] !== 'false',
    commission: id === 'crypto' ? 0 : parseFloat(settings[`withdraw_method_${id}_commission`] || (id === 'sbp' ? 0.01 : 0.02)),
  }));
  const config = {
    minAmount: parseFloat(settings.min_withdrawal || 500),
    maxDaily: parseFloat(settings.max_withdrawal_daily || 100000),
    usdtRate: await getUsdtRateRub(settings),
    autoPayoutsEnabled: settings.auto_payouts_enabled !== 'false',
    autoPayoutMinBalance: parseFloat(settings.auto_payout_min_balance || settings.min_withdrawal || 500),
    autoPayoutIntervalHours: parseFloat(settings.auto_payout_interval_hours || 24),
    methods,
  };
  if (userId) {
    const { rows: [seller] } = await client.query(
      `SELECT auto_payout_enabled, auto_payout_method, auto_payout_threshold, auto_payout_requisites
       FROM sellers WHERE user_id=$1`,
      [userId]
    );
    config.autoPayout = {
      enabled: Boolean(seller?.auto_payout_enabled),
      method: seller?.auto_payout_method || 'card',
      threshold: parseFloat(seller?.auto_payout_threshold || config.autoPayoutMinBalance),
      requisites: seller?.auto_payout_requisites || {},
    };
  }
  return config;
}

router.get('/withdrawal/config', async (req, res) => {
  try {
    res.json(await getWithdrawConfig({ query }, req.user.id));
  } catch (err) {
    logger.error('Withdrawal config error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/withdrawal/auto-payout', async (req, res) => {
  const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
  const method = String(req.body?.method || 'card');
  const threshold = parseFloat(req.body?.threshold || 0);
  const requisites = req.body?.requisites || {};
  try {
    const config = await getWithdrawConfig();
    const methodConfig = config.methods.find(m => m.id === method && m.enabled);
    if (!methodConfig) return res.status(400).json({ error: 'Неверный или отключенный метод автовыплат' });
    if (enabled && (!threshold || threshold < config.autoPayoutMinBalance)) {
      return res.status(400).json({ error: `Минимальный порог автовыплат ${config.autoPayoutMinBalance.toLocaleString('ru')} ₽` });
    }
    await query(
      `UPDATE sellers
       SET auto_payout_enabled=$1, auto_payout_method=$2, auto_payout_threshold=$3, auto_payout_requisites=$4::jsonb, updated_at=NOW()
       WHERE user_id=$5`,
      [enabled, method, threshold || config.autoPayoutMinBalance, JSON.stringify(requisites), req.user.id]
    );
    res.json({ message: 'Настройки автовыплат сохранены' });
  } catch (err) {
    logger.error('Auto payout settings error', { err: err.message, userId: req.user.id });
    res.status(500).json({ error: 'Ошибка сохранения автовыплат' });
  }
});

router.post('/withdrawal', async (req, res) => { const { amount, method, requisites } = req.body; const amt = parseFloat(amount); if (!requisites?.account?.trim()) return res.status(400).json({ error: 'Укажите реквизиты' }); try { const w = await transaction(async (client) => { const config = await getWithdrawConfig(client); const methodConfig = config.methods.find(m => m.id === method && m.enabled); if (!methodConfig) throw { status: 400, message: 'Неверный или отключенный метод вывода' }; if (!amt || amt < config.minAmount) throw { status: 400, message: `Минимальная сумма ${config.minAmount.toLocaleString('ru')} ₽` }; const { rows: [wallet] } = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]); if (!wallet || parseFloat(wallet.balance) < amt) throw { status: 402, message: 'Недостаточно средств' }; const commission = method === 'crypto' ? 0 : parseFloat((amt * methodConfig.commission).toFixed(2)); const netAmount = parseFloat((amt - commission).toFixed(2)); const { rows: [w] } = await client.query(`INSERT INTO withdrawal_requests (user_id, amount, commission, net_amount, method, requisites) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [req.user.id, amt, commission, netAmount, method, JSON.stringify(requisites)]); await client.query('UPDATE wallets SET balance=balance-$1 WHERE user_id=$2', [amt, req.user.id]); return w; }); notify.notifyAdmins('system', 'Новая заявка на вывод', `${req.user.username}: ${amt.toLocaleString('ru')} ₽ через ${method}`, '/admin/withdrawals').catch(() => {}); logger.info('Withdrawal requested', { userId: req.user.id, amount: amt, method }); res.status(201).json({ withdrawal: w }); } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Withdrawal error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); } });
router.post('/telegram-link', async (req, res) => { try { const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@+/, ''); if (!botUsername || /^your_/i.test(botUsername) || botUsername === 'SellWayBot') return res.status(400).json({ error: 'Сначала укажите реальный TELEGRAM_BOT_USERNAME в админке' }); const token = crypto.randomBytes(24).toString('hex'); const expires = new Date(Date.now() + 10 * 60 * 1000); await query('UPDATE users SET telegram_link_token=$1, telegram_link_expires=$2 WHERE id=$3', [token, expires, req.user.id]); res.json({ link: `https://t.me/${botUsername}?start=${token}`, appLink: `tg://resolve?domain=${botUsername}&start=${token}`, botUsername, token, expiresAt: expires }); } catch (err) { logger.error('Telegram link error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); } });

module.exports = router;
