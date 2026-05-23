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
    const { rows } = await query(
      `SELECT u.id, u.email, u.username, u.role, u.status, u.email_verified,
              u.created_at, u.last_login_at,
              w.balance, w.held,
              s.rating, s.total_sales, s.verified AS seller_verified,
              s.custom_commission_rate, s.referral_code,
              s.referred_by_seller_id, ref_user.email AS referred_by_email,
              ref_user.username AS referred_by_username,
              s.referral_commission_rate, s.referral_earnings, s.referred_sellers_count,
              COALESCE(ref_orders.orders_count, 0) AS referral_orders_count,
              COALESCE(ref_orders.turnover, 0) AS referral_turnover
       FROM users u
       LEFT JOIN wallets w ON w.user_id=u.id
       LEFT JOIN sellers s ON s.user_id=u.id
       LEFT JOIN users ref_user ON ref_user.id=s.referred_by_seller_id
       LEFT JOIN (
         SELECT child.referred_by_seller_id AS user_id,
                COUNT(o.id)::int AS orders_count,
                COALESCE(SUM(o.amount),0) AS turnover
         FROM sellers child
         LEFT JOIN orders o ON o.seller_id=child.user_id AND o.status='confirmed'
         WHERE child.referred_by_seller_id IS NOT NULL
         GROUP BY child.referred_by_seller_id
       ) ref_orders ON ref_orders.user_id=u.id
       ${whereStr}
       ORDER BY u.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    logger.error('Admin users list error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/users/:id', requireRole('admin'), async (req, res) => {
  const { role, status, custom_commission_rate, referral_commission_rate, referred_by } = req.body;
  const allowedRoles = ['buyer', 'seller', 'freelancer', 'moderator', 'admin'];
  if (role && !allowedRoles.includes(role)) return res.status(400).json({ error: 'Некорректная роль' });

  try {
    const result = await transaction(async (client) => {
      const { rows: [user] } = await client.query(
        'UPDATE users SET role=COALESCE($1,role), status=COALESCE($2,status) WHERE id=$3 RETURNING id, email, username, role, status',
        [role || null, status || null, req.params.id]
      );
      if (!user) throw { status: 404, message: 'Пользователь не найден' };

      if (COMMERCIAL_ROLES.includes(user.role)) await ensureSellerProfile(client, user);

      if (COMMERCIAL_ROLES.includes(user.role)) {
        let referrerId = undefined;
        if (referred_by !== undefined) {
          const ref = String(referred_by || '').trim();
          if (ref) {
            const { rows: [referrer] } = await client.query(
              `SELECT s.user_id
               FROM sellers s
               JOIN users u ON u.id=s.user_id
               WHERE LOWER(s.referral_code)=LOWER($1)
                  OR LOWER(u.email)=LOWER($1)
                  OR LOWER(u.username)=LOWER($1)
               LIMIT 1`,
              [ref]
            );
            if (!referrer) throw { status: 400, message: 'Реферер не найден' };
            if (referrer.user_id === user.id) throw { status: 400, message: 'Нельзя назначить пользователя реферером самому себе' };
            referrerId = referrer.user_id;
          } else {
            referrerId = null;
          }
        }

        const commissionRate = custom_commission_rate === '' || custom_commission_rate === undefined ? null : Number(custom_commission_rate);
        const referralRate = referral_commission_rate === '' || referral_commission_rate === undefined ? undefined : Number(referral_commission_rate);
        if (commissionRate !== null && (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 0.5)) throw { status: 400, message: 'Комиссия должна быть от 0 до 0.5' };
        if (referralRate !== undefined && (Number.isNaN(referralRate) || referralRate < 0 || referralRate > 0.5)) throw { status: 400, message: 'Реферальный процент должен быть от 0 до 0.5' };

        const updates = [];
        const values = [];
        if (custom_commission_rate !== undefined) { values.push(commissionRate); updates.push(`custom_commission_rate=$${values.length}`); }
        if (referralRate !== undefined) { values.push(referralRate); updates.push(`referral_commission_rate=$${values.length}`); }
        if (referrerId !== undefined) { values.push(referrerId); updates.push(`referred_by_seller_id=$${values.length}`); }
        if (updates.length) {
          values.push(user.id);
          await client.query(`UPDATE sellers SET ${updates.join(', ')} WHERE user_id=$${values.length}`, values);
        }

        await client.query(
          `UPDATE sellers s
           SET referred_sellers_count=(SELECT COUNT(*) FROM sellers child WHERE child.referred_by_seller_id=s.user_id)`
        );
      }

      return user;
    });
    logger.info('User updated by admin users fix', { targetId: req.params.id, adminId: req.user.id, role, status });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Admin users update error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
