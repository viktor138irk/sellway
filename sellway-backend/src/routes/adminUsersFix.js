const router = require('express').Router();
const { query, transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const logger = require('../config/logger');

const COMMERCIAL_ROLES = ['seller', 'freelancer', 'admin'];

router.use(auth, requireRole('admin', 'moderator'));

async function ensureSellerProfile(client, user) {
  const { v4: uuidv4 } = require('uuid');
  const code = uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
  await client.query(
    `INSERT INTO sellers (user_id, display_name, referral_code)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id, user.username, code]
  );
}

router.get('/stats', async (req, res) => {
  try {
    const [revenue, orders, users, disputes, products, payouts, trends, online, support] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS gross_total,
                    COALESCE(SUM(CASE WHEN created_at > NOW()-INTERVAL '7 days' THEN amount END),0) AS gross_week,
                    COALESCE(SUM(CASE WHEN created_at::date=CURRENT_DATE THEN amount END),0) AS gross_today,
                    COALESCE(SUM(commission),0) AS commission_total,
                    COALESCE(SUM(CASE WHEN created_at > NOW()-INTERVAL '7 days' THEN commission END),0) AS commission_week,
                    COALESCE(SUM(CASE WHEN created_at::date=CURRENT_DATE THEN commission END),0) AS commission_today
             FROM orders WHERE status='confirmed'`),
      query(`SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN status IN ('pending','paid','delivered','delivering') THEN 1 END) AS active,
                    COUNT(CASE WHEN created_at::date=CURRENT_DATE THEN 1 END) AS today
             FROM orders`),
      query(`SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN role='seller' THEN 1 END) AS sellers,
                    COUNT(CASE WHEN role='freelancer' THEN 1 END) AS freelancers,
                    COUNT(CASE WHEN created_at::date=CURRENT_DATE THEN 1 END) AS today
             FROM users`),
      query(`SELECT COUNT(*) AS total, COUNT(CASE WHEN status='open' THEN 1 END) AS open FROM disputes`),
      query(`SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
                    COUNT(CASE WHEN delivery_type='service' THEN 1 END) AS services
             FROM products`),
      query(`SELECT COALESCE(SUM(amount),0) AS referral_total,
                    COALESCE(SUM(CASE WHEN created_at > NOW()-INTERVAL '7 days' THEN amount END),0) AS referral_week,
                    COALESCE(SUM(CASE WHEN created_at::date=CURRENT_DATE THEN amount END),0) AS referral_today
             FROM transactions WHERE meta->>'source'='seller_referral'`),
      query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
                    COALESCE(SUM(o.commission),0) AS commission,
                    COALESCE(SUM(rt.amount),0) AS referral
             FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
             LEFT JOIN orders o ON o.status='confirmed' AND o.confirmed_at::date=d::date
             LEFT JOIN transactions rt ON rt.order_id=o.id AND rt.meta->>'source'='seller_referral'
             GROUP BY d::date ORDER BY d::date`),
      query(`SELECT COUNT(*) AS online FROM sellers WHERE last_seen_at > NOW()-INTERVAL '5 minutes'`),
      query(`SELECT COUNT(*)::int AS open FROM support_threads WHERE status='open'`),
    ]);

    const r = revenue.rows[0] || {};
    const p = payouts.rows[0] || {};
    const commissionTotal = Number(r.commission_total || 0);
    const commissionWeek = Number(r.commission_week || 0);
    const commissionToday = Number(r.commission_today || 0);
    const referralTotal = Number(p.referral_total || 0);
    const referralWeek = Number(p.referral_week || 0);
    const referralToday = Number(p.referral_today || 0);
    const avgDelivery = await query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at-created_at))/60),0) AS avg_min FROM orders WHERE delivered_at IS NOT NULL AND created_at > NOW()-INTERVAL '7 days'`);

    res.json({ revenue: { gross_total: r.gross_total || 0, gross_week: r.gross_week || 0, gross_today: r.gross_today || 0, commission_total: commissionTotal, commission_week: commissionWeek, commission_today: commissionToday, referral_total: referralTotal, referral_week: referralWeek, referral_today: referralToday, profit_total: Math.max(0, commissionTotal - referralTotal), profit_week: Math.max(0, commissionWeek - referralWeek), profit_today: Math.max(0, commissionToday - referralToday) }, orders: orders.rows[0], users: users.rows[0], disputes: disputes.rows[0], products: products.rows[0], support: support.rows[0], avgDeliveryMin: Math.round(avgDelivery.rows[0].avg_min), online: Number(online.rows[0]?.online || 0), trend: trends.rows.map(x => ({ day: x.day, commission: Number(x.commission || 0), referral: Number(x.referral || 0), profit: Math.max(0, Number(x.commission || 0) - Number(x.referral || 0)) })) });
  } catch (err) { logger.error('Admin stats fix error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/referrals', requireRole('admin'), async (req, res) => {
  try {
    const [settings, summary, topReferrers, recentPayments, invited, applications] = await Promise.all([
      query(`SELECT key, value FROM settings WHERE key IN ('referral_enabled','default_referral_commission_rate','max_referral_commission_rate','referral_payout_basis')`),
      query(`SELECT COALESCE(SUM(t.amount),0) AS paid_total,
                    COALESCE(SUM(CASE WHEN t.created_at::date=CURRENT_DATE THEN t.amount END),0) AS paid_today,
                    COALESCE(SUM(CASE WHEN t.created_at > NOW()-INTERVAL '7 days' THEN t.amount END),0) AS paid_week,
                    COUNT(t.id)::int AS payments_count,
                    COUNT(DISTINCT s.user_id)::int AS referrers_count,
                    COUNT(DISTINCT child.user_id)::int AS invited_count
             FROM sellers s
             LEFT JOIN sellers child ON child.referred_by_seller_id=s.user_id
             LEFT JOIN transactions t ON t.user_id=s.user_id AND t.meta->>'source'='seller_referral'`),
      query(`SELECT u.id, u.username, u.email, u.role,
                    s.referral_code, s.referral_commission_rate, s.referral_earnings, s.referred_sellers_count,
                    (s.last_seen_at > NOW()-INTERVAL '5 minutes') AS seller_online,
                    seller_delivery.avg_delivery_time_min AS seller_delivery_time_min,
                    COALESCE(SUM(t.amount),0) AS paid_total,
                    COUNT(t.id)::int AS payments_count
             FROM sellers s
             JOIN users u ON u.id=s.user_id
             LEFT JOIN LATERAL (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - COALESCE(delivery.paid_at, delivery.created_at))) / 60))::int AS avg_delivery_time_min FROM orders delivery WHERE delivery.seller_id=s.user_id AND delivery.delivered_at IS NOT NULL AND delivery.delivered_at >= COALESCE(delivery.paid_at, delivery.created_at)) seller_delivery ON TRUE
             LEFT JOIN transactions t ON t.user_id=s.user_id AND t.meta->>'source'='seller_referral'
             WHERE s.referred_sellers_count > 0 OR s.referral_earnings > 0
             GROUP BY u.id, u.username, u.email, u.role, s.referral_code, s.referral_commission_rate, s.referral_earnings, s.referred_sellers_count, s.last_seen_at, seller_delivery.avg_delivery_time_min
             ORDER BY paid_total DESC, s.referred_sellers_count DESC LIMIT 50`),
      query(`SELECT t.id, t.amount, t.description, t.created_at, t.order_id,
                    ref_u.username AS referrer_name, ref_u.email AS referrer_email,
                    seller_u.username AS seller_name, seller_u.email AS seller_email,
                    (seller_profile.last_seen_at > NOW()-INTERVAL '5 minutes') AS seller_online,
                    seller_delivery.avg_delivery_time_min AS seller_delivery_time_min,
                    o.order_number, p.title AS product_title
             FROM transactions t
             JOIN users ref_u ON ref_u.id=t.user_id
             LEFT JOIN orders o ON o.id=t.order_id
             LEFT JOIN users seller_u ON seller_u.id=o.seller_id
             LEFT JOIN sellers seller_profile ON seller_profile.user_id=o.seller_id
             LEFT JOIN LATERAL (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - COALESCE(delivery.paid_at, delivery.created_at))) / 60))::int AS avg_delivery_time_min FROM orders delivery WHERE delivery.seller_id=o.seller_id AND delivery.delivered_at IS NOT NULL AND delivery.delivered_at >= COALESCE(delivery.paid_at, delivery.created_at)) seller_delivery ON TRUE
             LEFT JOIN products p ON p.id=o.product_id
             WHERE t.meta->>'source'='seller_referral'
             ORDER BY t.created_at DESC LIMIT 100`),
      query(`SELECT child.user_id, child.created_at, child.referral_commission_rate,
                    u.username, u.email, u.role,
                    ref.username AS referrer_name, ref.email AS referrer_email,
                    (child.last_seen_at > NOW()-INTERVAL '5 minutes') AS seller_online,
                    seller_delivery.avg_delivery_time_min AS seller_delivery_time_min,
                    COALESCE(SUM(o.amount),0) AS turnover,
                    COUNT(o.id)::int AS confirmed_orders,
                    COALESCE(SUM(t.amount),0) AS referral_paid
             FROM sellers child
             JOIN users u ON u.id=child.user_id
             LEFT JOIN users ref ON ref.id=child.referred_by_seller_id
             LEFT JOIN LATERAL (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - COALESCE(delivery.paid_at, delivery.created_at))) / 60))::int AS avg_delivery_time_min FROM orders delivery WHERE delivery.seller_id=child.user_id AND delivery.delivered_at IS NOT NULL AND delivery.delivered_at >= COALESCE(delivery.paid_at, delivery.created_at)) seller_delivery ON TRUE
             LEFT JOIN orders o ON o.seller_id=child.user_id AND o.status='confirmed'
             LEFT JOIN transactions t ON t.order_id=o.id AND t.meta->>'source'='seller_referral'
             WHERE child.referred_by_seller_id IS NOT NULL
             GROUP BY child.user_id, child.created_at, child.referral_commission_rate, child.last_seen_at, seller_delivery.avg_delivery_time_min, u.username, u.email, u.role, ref.username, ref.email
             ORDER BY child.created_at DESC LIMIT 100`),
      query(`SELECT s.user_id, s.referral_application_status, s.referral_requested_at, s.referral_reviewed_at,
                    s.referral_reject_reason, s.referral_moderation_note, s.referral_enabled,
                    u.username, u.email, u.role, u.email_verified, u.phone_verified, u.telegram_verified,
                    (s.last_seen_at > NOW()-INTERVAL '5 minutes') AS seller_online,
                    seller_delivery.avg_delivery_time_min AS seller_delivery_time_min
             FROM sellers s
             JOIN users u ON u.id=s.user_id
             LEFT JOIN LATERAL (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - COALESCE(delivery.paid_at, delivery.created_at))) / 60))::int AS avg_delivery_time_min FROM orders delivery WHERE delivery.seller_id=s.user_id AND delivery.delivered_at IS NOT NULL AND delivery.delivered_at >= COALESCE(delivery.paid_at, delivery.created_at)) seller_delivery ON TRUE
             WHERE s.referral_application_status = 'pending'
             ORDER BY s.referral_requested_at DESC NULLS LAST, s.created_at DESC
             LIMIT 100`),
    ]);

    const cfg = Object.fromEntries(settings.rows.map(r => [r.key, r.value]));
    res.json({
      settings: {
        referral_enabled: cfg.referral_enabled ?? 'true',
        default_referral_commission_rate: cfg.default_referral_commission_rate ?? '0.0100',
        max_referral_commission_rate: cfg.max_referral_commission_rate ?? '0.0500',
        referral_payout_basis: cfg.referral_payout_basis ?? 'turnover',
      },
      summary: summary.rows[0] || {},
      topReferrers: topReferrers.rows,
      recentPayments: recentPayments.rows,
      invited: invited.rows,
      applications: applications.rows,
    });
  } catch (err) { logger.error('Admin referrals error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.put('/referrals/settings', requireRole('admin'), async (req, res) => {
  const allowed = ['referral_enabled', 'default_referral_commission_rate', 'max_referral_commission_rate', 'referral_payout_basis'];
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if ('default_referral_commission_rate' in data) {
    const n = Number(data.default_referral_commission_rate);
    if (Number.isNaN(n) || n < 0 || n > 0.5) return res.status(400).json({ error: 'Ставка по умолчанию должна быть от 0 до 0.5' });
  }
  if ('max_referral_commission_rate' in data) {
    const n = Number(data.max_referral_commission_rate);
    if (Number.isNaN(n) || n < 0 || n > 0.5) return res.status(400).json({ error: 'Максимальная ставка должна быть от 0 до 0.5' });
  }
  if (data.referral_payout_basis && !['turnover', 'platform_commission'].includes(data.referral_payout_basis)) return res.status(400).json({ error: 'Некорректная база расчёта' });
  try {
    await transaction(async (client) => {
      for (const [key, value] of Object.entries(data)) {
        await client.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`, [key, String(value)]);
      }
    });
    res.json({ message: 'Настройки рефералов сохранены' });
  } catch (err) { logger.error('Save referral settings error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/users', async (req, res) => {
  const { page = 1, limit = 50, search, role, status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];
  const where = [];
  if (search) { params.push(`%${search}%`); where.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
  if (role) { params.push(role); where.push(`u.role=$${params.length}`); }
  if (status) { params.push(status); where.push(`u.status=$${params.length}`); }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(Number(limit), offset);
  try {
    const { rows } = await query(`SELECT u.id, u.email, u.username, u.avatar_url, u.role, u.status, u.email_verified, u.phone_verified, u.telegram_verified, u.created_at, u.last_login_at, w.balance, w.held, s.rating, s.total_sales, s.verified AS seller_verified, s.commercial_application_status, s.commercial_terms_accepted_at, s.commercial_reject_reason, s.custom_commission_rate, s.custom_withdrawal_commission_rate, s.referral_code, s.referral_enabled, s.referral_application_status, s.referred_by_seller_id, ref_user.email AS referred_by_email, ref_user.username AS referred_by_username, s.referral_commission_rate, s.referral_earnings, s.referred_sellers_count, (s.last_seen_at > NOW()-INTERVAL '5 minutes') AS seller_online, seller_delivery.avg_delivery_time_min AS seller_delivery_time_min, COALESCE(ref_orders.orders_count, 0) AS referral_orders_count, COALESCE(ref_orders.turnover, 0) AS referral_turnover FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN sellers s ON s.user_id=u.id LEFT JOIN users ref_user ON ref_user.id=s.referred_by_seller_id LEFT JOIN LATERAL (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - COALESCE(delivery.paid_at, delivery.created_at))) / 60))::int AS avg_delivery_time_min FROM orders delivery WHERE delivery.seller_id=u.id AND delivery.delivered_at IS NOT NULL AND delivery.delivered_at >= COALESCE(delivery.paid_at, delivery.created_at)) seller_delivery ON TRUE LEFT JOIN (SELECT child.referred_by_seller_id AS user_id, COUNT(o.id)::int AS orders_count, COALESCE(SUM(o.amount),0) AS turnover FROM sellers child LEFT JOIN orders o ON o.seller_id=child.user_id AND o.status='confirmed' WHERE child.referred_by_seller_id IS NOT NULL GROUP BY child.referred_by_seller_id) ref_orders ON ref_orders.user_id=u.id ${whereStr} ORDER BY u.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ users: rows });
  } catch (err) { logger.error('Admin users list error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.put('/users/:id', requireRole('admin'), async (req, res) => {
  const { role, status, seller_verified, custom_commission_rate, custom_withdrawal_commission_rate, referral_commission_rate, referred_by } = req.body;
  const allowedRoles = ['buyer', 'seller', 'freelancer', 'moderator', 'admin'];
  if (role && !allowedRoles.includes(role)) return res.status(400).json({ error: 'Некорректная роль' });
  try {
    const result = await transaction(async (client) => {
      const { rows: [user] } = await client.query('UPDATE users SET role=COALESCE($1,role), status=COALESCE($2,status) WHERE id=$3 RETURNING id, email, username, role, status', [role || null, status || null, req.params.id]);
      if (!user) throw { status: 404, message: 'Пользователь не найден' };
      if (COMMERCIAL_ROLES.includes(user.role)) await ensureSellerProfile(client, user);
      if (COMMERCIAL_ROLES.includes(user.role)) {
        let referrerId = undefined;
        if (referred_by !== undefined) {
          const ref = String(referred_by || '').trim();
          if (ref) {
            const { rows: [referrer] } = await client.query(`SELECT s.user_id FROM sellers s JOIN users u ON u.id=s.user_id WHERE LOWER(s.referral_code)=LOWER($1) OR LOWER(u.email)=LOWER($1) OR LOWER(u.username)=LOWER($1) LIMIT 1`, [ref]);
            if (!referrer) throw { status: 400, message: 'Реферер не найден' };
            if (referrer.user_id === user.id) throw { status: 400, message: 'Нельзя назначить пользователя реферером самому себе' };
            referrerId = referrer.user_id;
          } else referrerId = null;
        }
        const commissionRate = custom_commission_rate === '' || custom_commission_rate === undefined ? null : Number(custom_commission_rate);
        const withdrawalRate = custom_withdrawal_commission_rate === '' || custom_withdrawal_commission_rate === undefined ? null : Number(custom_withdrawal_commission_rate);
        const referralRate = referral_commission_rate === '' || referral_commission_rate === undefined ? undefined : Number(referral_commission_rate);
        if (commissionRate !== null && (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 0.5)) throw { status: 400, message: 'Комиссия должна быть от 0 до 0.5' };
        if (withdrawalRate !== null && (Number.isNaN(withdrawalRate) || withdrawalRate < 0 || withdrawalRate > 0.5)) throw { status: 400, message: 'Комиссия вывода должна быть от 0 до 0.5' };
        if (referralRate !== undefined && (Number.isNaN(referralRate) || referralRate < 0 || referralRate > 0.5)) throw { status: 400, message: 'Реферальный процент должен быть от 0 до 0.5' };
        const updates = [];
        const values = [];
        if (custom_commission_rate !== undefined) { values.push(commissionRate); updates.push(`custom_commission_rate=$${values.length}`); }
        if (custom_withdrawal_commission_rate !== undefined) { values.push(withdrawalRate); updates.push(`custom_withdrawal_commission_rate=$${values.length}`); }
        if (referralRate !== undefined) { values.push(referralRate); updates.push(`referral_commission_rate=$${values.length}`); }
        if (referrerId !== undefined) { values.push(referrerId); updates.push(`referred_by_seller_id=$${values.length}`); }
        if (seller_verified !== undefined) {
          const approved = seller_verified === true || seller_verified === 'true';
          if (approved) {
            const { rows: [profile] } = await client.query(
              'SELECT commercial_terms_accepted_at FROM sellers WHERE user_id=$1',
              [user.id]
            );
            if (!profile?.commercial_terms_accepted_at) {
              throw { status: 400, message: 'Пользователь еще не принял дополнительные условия' };
            }
          }
          values.push(approved); updates.push(`verified=$${values.length}`);
          updates.push(`verified_at=CASE WHEN ${approved ? 'TRUE' : 'FALSE'} THEN NOW() ELSE NULL END`);
          updates.push(`commercial_application_status=CASE WHEN ${approved ? 'TRUE' : 'FALSE'} THEN 'approved' ELSE 'pending' END`);
          updates.push(`commercial_reviewed_at=CASE WHEN ${approved ? 'TRUE' : 'FALSE'} THEN NOW() ELSE commercial_reviewed_at END`);
          values.push(req.user.id); updates.push(`commercial_reviewed_by=CASE WHEN ${approved ? 'TRUE' : 'FALSE'} THEN $${values.length} ELSE commercial_reviewed_by END`);
        }
        if (updates.length) { values.push(user.id); await client.query(`UPDATE sellers SET ${updates.join(', ')} WHERE user_id=$${values.length}`, values); }
        await client.query(`UPDATE sellers s SET referred_sellers_count=(SELECT COUNT(*) FROM sellers child WHERE child.referred_by_seller_id=s.user_id)`);
      }
      return user;
    });
    logger.info('User updated by admin users fix', { targetId: req.params.id, adminId: req.user.id, role, status });
    res.json(result);
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Admin users update error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/users/:id/approve-commercial', requireRole('admin'), async (req, res) => {
  try {
    const { rows: [user] } = await transaction(async (client) => {
      const { rows: [target] } = await client.query('SELECT id, username, email, role FROM users WHERE id=$1', [req.params.id]);
      if (!target) throw { status: 404, message: 'Пользователь не найден' };
      if (!COMMERCIAL_ROLES.includes(target.role)) throw { status: 400, message: 'Это не коммерческая роль' };
      await ensureSellerProfile(client, target);
      const { rows } = await client.query(
        `UPDATE sellers
         SET verified=TRUE,
             verified_at=NOW(),
             commercial_application_status='approved',
             commercial_reviewed_at=NOW(),
             commercial_reviewed_by=$1,
             commercial_reject_reason=NULL,
             updated_at=NOW()
         WHERE user_id=$2 AND commercial_terms_accepted_at IS NOT NULL
         RETURNING user_id`,
        [req.user.id, target.id]
      );
      if (!rows.length) throw { status: 400, message: 'Пользователь еще не принял дополнительные условия' };
      return { rows: [target] };
    });
    if (!user) return res.status(404).json({ error: 'Профиль не найден' });
    res.json({ message: 'Коммерческий аккаунт одобрен', user });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Approve commercial user error', { err: err.message, targetId: req.params.id });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/users/:id/reject-commercial', requireRole('admin'), async (req, res) => {
  const reason = String(req.body?.reason || 'Не прошел модерацию').trim().slice(0, 500);
  try {
    const { rows: [user] } = await transaction(async (client) => {
      const { rows: [target] } = await client.query('SELECT id, username, email, role FROM users WHERE id=$1', [req.params.id]);
      if (!target) throw { status: 404, message: 'Пользователь не найден' };
      if (!COMMERCIAL_ROLES.includes(target.role)) throw { status: 400, message: 'Это не коммерческая роль' };
      await ensureSellerProfile(client, target);
      const { rows } = await client.query(
        `UPDATE sellers
         SET verified=FALSE,
             verified_at=NULL,
             commercial_application_status='rejected',
             commercial_reviewed_at=NOW(),
             commercial_reviewed_by=$1,
             commercial_reject_reason=$2,
             updated_at=NOW()
         WHERE user_id=$3
         RETURNING user_id`,
        [req.user.id, reason, target.id]
      );
      return { rows: rows.length ? [target] : [] };
    });
    if (!user) return res.status(404).json({ error: 'Профиль не найден' });
    res.json({ message: 'Коммерческий аккаунт отклонен', user });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Reject commercial user error', { err: err.message, targetId: req.params.id });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
