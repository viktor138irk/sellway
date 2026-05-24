const router = require('express').Router();
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');
const { paySellerReferral } = require('../services/referrals');
const { sendTestEmail } = require('../services/mailer');

const ENV_FILE = path.resolve(__dirname, '..', '..', '.env');
const ENV_SETTINGS = {
  TELEGRAM_BOT_TOKEN: 'Токен Telegram-бота от @BotFather',
  TELEGRAM_BOT_USERNAME: 'Username Telegram-бота без @',
  TELEGRAM_ADMIN_BOT_TOKEN: 'Токен отдельного Telegram-бота для админов',
  TELEGRAM_ADMIN_BOT_USERNAME: 'Username отдельного админского Telegram-бота без @',
  TELEGRAM_ADMIN_CHAT_ID: 'Chat ID администратора для уведомлений',
  PROXY_ENABLED: 'Включить SOCKS5-прокси для Telegram',
  PROXY_HOST: 'Хост SOCKS5-прокси',
  PROXY_PORT: 'Порт SOCKS5-прокси',
  PROXY_USERNAME: 'Логин SOCKS5-прокси',
  PROXY_PASSWORD: 'Пароль SOCKS5-прокси',
  SMTP_HOST: 'SMTP-хост для email-уведомлений',
  SMTP_PORT: 'SMTP-порт',
  SMTP_SECURE: 'Использовать защищенное SMTP-соединение',
  SMTP_USER: 'SMTP-пользователь',
  SMTP_PASS: 'SMTP-пароль',
  SMSPILOT_ENABLED: 'Включить SMSPilot',
  SMSPILOT_API_KEY: 'API-ключ SMSPilot',
  SMSPILOT_SENDER: 'Имя отправителя SMSPilot',
  SMS_CODE_TEMPLATE: 'Шаблон SMS-кода подтверждения',
};

function normalizeSettingValue(raw) {
  let value = raw;
  let depth = 0;
  while (value && typeof value === 'object' && 'value' in value && depth < 5) {
    value = value.value;
    depth += 1;
  }
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

function makeReferralCode() {
  return uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
}

async function ensureSellerProfile(userId, username, client = { query }) {
  await client.query(
    `INSERT INTO sellers (user_id, display_name, referral_code)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, username, makeReferralCode()]
  );
}

function setEnvValue(content, key, value) {
  const raw = String(value ?? '').replace(/\r?\n/g, '');
  const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const line = `${key}="${escaped}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, line) : `${content.replace(/\s*$/, '')}\n${line}\n`;
}

function writeEnvSettings(updates) {
  let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    content = setEnvValue(content, key, value);
    process.env[key] = String(value ?? '');
  }
  fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
}

// Multer для загрузки картинок (категории, баннеры и т.д.)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype);
    cb(ok ? null : new Error('Только изображения'), ok);
  },
});

// Все роуты требуют admin/moderator
router.use(auth, requireRole('admin', 'moderator'));

// ── POST /admin/upload-image ── Универсальная загрузка ──
router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const baseUrl = process.env.UPLOAD_URL || '/uploads';
  res.json({ url: `${baseUrl}/${req.file.filename}` });
});

// ── GET /admin/stats ── Общая статистика ─────────────

router.get('/stats', async (req, res) => {
  try {
    const [revenue, orders, users, disputes, products] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS today,
                    COALESCE(SUM(CASE WHEN created_at > NOW()-INTERVAL '7 days' THEN amount END),0) AS week,
                    COALESCE(SUM(amount),0) AS total
             FROM orders WHERE status='confirmed'`),
      query(`SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN status='pending' OR status='paid' THEN 1 END) AS active,
                    COUNT(CASE WHEN created_at::date=CURRENT_DATE THEN 1 END) AS today
             FROM orders`),
      query(`SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN role='seller' THEN 1 END) AS sellers,
                    COUNT(CASE WHEN created_at::date=CURRENT_DATE THEN 1 END) AS today
             FROM users`),
      query(`SELECT COUNT(*) AS total, COUNT(CASE WHEN status='open' THEN 1 END) AS open FROM disputes`),
      query(`SELECT COUNT(*) AS total, COUNT(CASE WHEN status='pending' THEN 1 END) AS pending FROM products`),
    ]);

    const avgDelivery = await query(
      `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at-created_at))/60),0) AS avg_min
       FROM orders WHERE delivered_at IS NOT NULL AND created_at > NOW()-INTERVAL '7 days'`
    );

    res.json({
      revenue: revenue.rows[0],
      orders: orders.rows[0],
      users: users.rows[0],
      disputes: disputes.rows[0],
      products: products.rows[0],
      avgDeliveryMin: Math.round(avgDelivery.rows[0].avg_min),
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /admin/users ─────────────────────────────────

router.get('/users', async (req, res) => {
  const { page = 1, limit = 50, search, role, status } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const where = [];

  if (search) { params.push(`%${search}%`); where.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
  if (role)   { params.push(role);           where.push(`u.role=$${params.length}`); }
  if (status) { params.push(status);         where.push(`u.status=$${params.length}`); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(limit, offset);

  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.username, u.role, u.status, u.email_verified,
              u.created_at, u.last_login_at,
              w.balance, s.rating, s.total_sales, s.verified AS seller_verified,
              s.custom_commission_rate, s.referral_code,
              s.referred_by_seller_id, ref_user.email AS referred_by_email,
              ref_user.username AS referred_by_username,
              s.referral_commission_rate, s.referral_earnings, s.referred_sellers_count
       FROM users u
       LEFT JOIN wallets w ON w.user_id=u.id
       LEFT JOIN sellers s ON s.user_id=u.id
       LEFT JOIN users ref_user ON ref_user.id=s.referred_by_seller_id
       ${whereStr}
       ORDER BY u.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── PUT /admin/users/:id ─────────────────────────────

router.put('/users/:id', requireRole('admin'), async (req, res) => {
  const {
    role,
    status,
    custom_commission_rate,
    referral_commission_rate,
    referred_by,
  } = req.body;
  try {
    await transaction(async (client) => {
      const { rows: [user] } = await client.query(
        'UPDATE users SET role=COALESCE($1,role), status=COALESCE($2,status) WHERE id=$3 RETURNING id, email, username, role, status',
        [role, status, req.params.id]
      );
      if (!user) throw { status: 404, message: 'Пользователь не найден' };

      if (user.role === 'seller' || user.role === 'admin') {
        await ensureSellerProfile(user.id, user.username, client);
      }

      if (user.role === 'seller' || user.role === 'admin') {
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
            if (referrer.user_id === user.id) throw { status: 400, message: 'Нельзя назначить продавца реферером самому себе' };
            referrerId = referrer.user_id;
          } else {
            referrerId = null;
          }
        }

        const commissionRate = custom_commission_rate === '' || custom_commission_rate === undefined
          ? null
          : Number(custom_commission_rate);
        const referralRate = referral_commission_rate === '' || referral_commission_rate === undefined
          ? undefined
          : Number(referral_commission_rate);

        if (commissionRate !== null && (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 0.5)) {
          throw { status: 400, message: 'Комиссия продавца должна быть от 0 до 0.5' };
        }
        if (referralRate !== undefined && (Number.isNaN(referralRate) || referralRate < 0 || referralRate > 0.5)) {
          throw { status: 400, message: 'Реферальный процент должен быть от 0 до 0.5' };
        }

        const updates = [];
        const values = [];
        if (custom_commission_rate !== undefined) {
          values.push(commissionRate);
          updates.push(`custom_commission_rate=$${values.length}`);
        }
        if (referralRate !== undefined) {
          values.push(referralRate);
          updates.push(`referral_commission_rate=$${values.length}`);
        }
        if (referrerId !== undefined) {
          values.push(referrerId);
          updates.push(`referred_by_seller_id=$${values.length}`);
        }
        if (updates.length) {
          values.push(user.id);
          await client.query(`UPDATE sellers SET ${updates.join(', ')} WHERE user_id=$${values.length}`, values);
        }

        await client.query(
          `UPDATE sellers s
           SET referred_sellers_count=(
             SELECT COUNT(*) FROM sellers child WHERE child.referred_by_seller_id=s.user_id
           )`
        );
      }

      logger.info('User updated by admin', { targetId: req.params.id, adminId: req.user.id, role, status });
      return res.json(user);
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('User update error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /admin/products ── Модерация товаров ──────────

router.get('/products', async (req, res) => {
  const { status = 'pending', page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const { rows } = await query(
      `SELECT p.*, c.name AS category_name, c.category_type, COALESCE(c.image_url, parent.image_url) AS category_image_url, c.emoji AS category_emoji,
              u.username AS seller_name, u.email AS seller_email,
              (SELECT url FROM product_images WHERE product_id=p.id AND is_main=TRUE LIMIT 1) AS main_image
       FROM products p
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN categories parent ON parent.id=c.parent_id
       JOIN users u ON u.id=p.seller_id
       WHERE p.status=$1
       ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    res.json({ products: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /admin/products/:id/approve ─────────────────

router.post('/products/:id/approve', async (req, res) => {
  try {
    const { rows: [product] } = await query(
      "UPDATE products SET status='active', moderated_by=$1, moderated_at=NOW() WHERE id=$2 RETURNING *, seller_id",
      [req.user.id, req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    await notify.create(product.seller_id, 'system',
      '✅ Товар одобрен',
      `Ваш товар "${product.title}" прошёл модерацию и опубликован.`,
      `/seller/products/${product.id}`
    );

    logger.info('Product approved', { productId: product.id, adminId: req.user.id });
    res.json({ message: 'Товар одобрен', product });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /admin/products/:id/reject ──────────────────

router.post('/products/:id/reject', async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Укажите причину отклонения' });
  try {
    const { rows: [product] } = await query(
      "UPDATE products SET status='rejected', reject_reason=$1, moderated_by=$2, moderated_at=NOW() WHERE id=$3 RETURNING *, seller_id",
      [reason, req.user.id, req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    await notify.create(product.seller_id, 'system',
      '❌ Товар отклонён',
      `Товар "${product.title}" отклонён. Причина: ${reason}`,
      `/seller/products/${product.id}`
    );

    res.json({ message: 'Товар отклонён', product });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /admin/orders ─────────────────────────────────

router.get('/orders', async (req, res) => {
  const { page = 1, limit = 50, status, search } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const where = [];

  if (status) { params.push(status); where.push(`o.status=$${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`o.order_number ILIKE $${params.length}`); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(limit, offset);

  try {
    const { rows } = await query(
      `SELECT o.*, p.title AS product_title,
              buyer.username AS buyer_name, seller.username AS seller_name
       FROM orders o
       JOIN products p ON p.id=o.product_id
       JOIN users buyer ON buyer.id=o.buyer_id
       JOIN users seller ON seller.id=o.seller_id
       ${whereStr}
       ORDER BY o.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /admin/disputes ───────────────────────────────

router.get('/disputes', async (req, res) => {
  const { status = 'open' } = req.query;
  try {
    const { rows } = await query(
      `SELECT d.*, o.order_number, o.amount,
              buyer.username AS buyer_name, seller.username AS seller_name,
              opener.username AS opener_name
       FROM disputes d
       JOIN orders o ON o.id=d.order_id
       JOIN users buyer ON buyer.id=o.buyer_id
       JOIN users seller ON seller.id=o.seller_id
       JOIN users opener ON opener.id=d.opener_id
       WHERE d.status=$1
       ORDER BY d.created_at ASC`,
      [status]
    );
    res.json({ disputes: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /admin/disputes/:id/resolve ─────────────────

router.post('/disputes/:id/resolve', requireRole('admin'), async (req, res) => {
  const { winner, resolution } = req.body; // winner: 'buyer' | 'seller'
  if (!['buyer', 'seller'].includes(winner)) return res.status(400).json({ error: 'winner: buyer или seller' });

  try {
    await transaction(async (client) => {
      const { rows: [dispute] } = await client.query(
        "SELECT d.*, o.* FROM disputes d JOIN orders o ON o.id=d.order_id WHERE d.id=$1 AND d.status='open' FOR UPDATE",
        [req.params.id]
      );
      if (!dispute) throw { status: 404, message: 'Спор не найден' };

      const newStatus = winner === 'buyer' ? 'resolved_buyer' : 'resolved_seller';
      await client.query(
        "UPDATE disputes SET status=$1, resolution=$2, admin_id=$3, resolved_at=NOW() WHERE id=$4",
        [newStatus, resolution, req.user.id, req.params.id]
      );

      if (winner === 'buyer') {
        // Возврат покупателю
        await client.query("UPDATE orders SET status='refunded' WHERE id=$1", [dispute.order_id]);
        await client.query('UPDATE wallets SET balance=balance+$1, held=held-$1 WHERE user_id=$2', [dispute.amount, dispute.buyer_id]);
        await notify.create(dispute.buyer_id, 'order_confirmed', '✅ Спор решён в вашу пользу', `Возврат ${dispute.amount} ₽`);
        await notify.create(dispute.seller_id, 'system', 'ℹ️ Спор решён', 'Спор решён в пользу покупателя');
      } else {
        // Деньги продавцу
        await client.query("UPDATE orders SET status='confirmed' WHERE id=$1", [dispute.order_id]);
        await client.query('UPDATE wallets SET held=held-$1 WHERE user_id=$2', [dispute.amount, dispute.buyer_id]);
        await client.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2', [dispute.seller_amount, dispute.seller_id]);
        await notify.create(dispute.seller_id, 'balance_credit', '✅ Спор решён в вашу пользу', `Зачислено ${dispute.seller_amount} ₽`);
        await notify.create(dispute.buyer_id, 'system', 'ℹ️ Спор решён', 'Спор решён в пользу продавца');
      }

      logger.info('Dispute resolved', { disputeId: req.params.id, winner, adminId: req.user.id });
      return res.json({ message: `Спор решён в пользу ${winner === 'buyer' ? 'покупателя' : 'продавца'}` });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /admin/withdrawals ────────────────────────────

router.get('/withdrawals', async (req, res) => {
  const { status = 'pending' } = req.query;
  try {
    const { rows } = await query(
      `SELECT w.*, u.username, u.email FROM withdrawal_requests w
       JOIN users u ON u.id=w.user_id WHERE w.status=$1 ORDER BY w.created_at ASC`,
      [status]
    );
    res.json({ withdrawals: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /admin/withdrawals/:id/approve ──────────────

router.post('/withdrawals/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const { rows: [w] } = await query(
      "UPDATE withdrawal_requests SET status='completed', admin_id=$1, processed_at=NOW() WHERE id=$2 AND status='pending' RETURNING *",
      [req.user.id, req.params.id]
    );
    if (!w) return res.status(404).json({ error: 'Заявка не найдена' });
    await notify.sellerWithdrawApproved(w.user_id, w);
    res.json({ message: 'Выплата одобрена' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /admin/withdrawals/:id/reject ───────────────

router.post('/withdrawals/:id/reject', requireRole('admin'), async (req, res) => {
  const { reason } = req.body;
  try {
    await transaction(async (client) => {
      const { rows: [w] } = await client.query(
        "UPDATE withdrawal_requests SET status='rejected', admin_id=$1, admin_note=$2, processed_at=NOW() WHERE id=$3 AND status='pending' RETURNING *",
        [req.user.id, reason, req.params.id]
      );
      if (!w) throw { status: 404, message: 'Заявка не найдена' };
      // Возвращаем деньги
      await client.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2', [w.amount, w.user_id]);
      await notify.sellerWithdrawRejected(w.user_id, w, reason);
      return res.json({ message: 'Выплата отклонена, средства возвращены' });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /admin/settings ───────────────────────────────

router.get('/settings', requireRole('admin'), async (req, res) => {
  const { rows } = await query('SELECT key, value, description FROM settings ORDER BY key');
  const settings = Object.fromEntries(rows.map(r => [r.key, { value: r.value, description: r.description }]));
  for (const [key, description] of Object.entries(ENV_SETTINGS)) {
    settings[key] = { value: process.env[key] || '', description, source: 'env' };
  }
  res.json(settings);
});

// ── PUT /admin/settings ───────────────────────────────

router.put('/settings', requireRole('admin'), async (req, res) => {
  const updates = req.body; // { key: value, ... }
  const envUpdates = {};
  const dbUpdates = {};

  for (const [key, value] of Object.entries(updates)) {
    const normalized = normalizeSettingValue(value);
    if (key in ENV_SETTINGS) envUpdates[key] = normalized;
    else dbUpdates[key] = normalized;
  }

  try {
    for (const [key, value] of Object.entries(dbUpdates)) {
      await query(
        `INSERT INTO settings (key, value, description, updated_at)
         VALUES ($1,$2,NULL,NOW())
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
        [key, value]
      );
    }
    if (Object.keys(envUpdates).length) writeEnvSettings(envUpdates);
    logger.info('Settings updated', { adminId: req.user.id, keys: Object.keys(updates) });
    res.json({
      message: 'Настройки сохранены',
      restartRequired: Object.keys(envUpdates).length > 0,
    });
  } catch (err) {
    logger.error('Settings update error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/settings/actions/reset-moderation-stats', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE products
       SET moderated_by=NULL, moderated_at=NULL, reject_reason=NULL
       WHERE moderated_by IS NOT NULL OR moderated_at IS NOT NULL OR reject_reason IS NOT NULL
       RETURNING id`
    );
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_data)
       VALUES ($1,'reset_moderation_stats','system',NULL,$2::jsonb)`,
      [req.user.id, JSON.stringify({ affected_products: rows.length })]
    ).catch(() => {});
    logger.info('Moderation stats reset', { adminId: req.user.id, count: rows.length });
    res.json({ message: `Статистика модерации сброшена. Затронуто товаров: ${rows.length}`, count: rows.length });
  } catch (err) {
    logger.error('Reset moderation stats error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сброса статистики модерации' });
  }
});

router.post('/settings/actions/auto-confirm-expired', requireRole('admin'), async (req, res) => {
  try {
    const result = await transaction(async (client) => {
      const { rows: orders } = await client.query(
        `SELECT *
         FROM orders
         WHERE status='delivered'
           AND auto_confirm_at IS NOT NULL
           AND auto_confirm_at <= NOW()
         ORDER BY auto_confirm_at ASC
         FOR UPDATE SKIP LOCKED`
      );

      const confirmed = [];
      for (const order of orders) {
        await client.query("UPDATE orders SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [order.id]);
        await client.query('UPDATE wallets SET held=GREATEST(held-$1,0) WHERE user_id=$2', [order.amount, order.buyer_id]);
        await client.query('UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2', [order.seller_amount, order.seller_id]);
        await client.query(
          `INSERT INTO transactions (user_id, order_id, type, amount, description)
           VALUES ($1,$2,'release',$3,$4)`,
          [order.buyer_id, order.id, order.amount, `Авто-подтверждение заказа ${order.order_number}`]
        );
        await client.query(
          `INSERT INTO transactions (user_id, order_id, type, amount, description)
           VALUES ($1,$2,'credit',$3,$4)`,
          [order.seller_id, order.id, order.seller_amount, `Выплата за заказ ${order.order_number}`]
        );
        await client.query('UPDATE sellers SET total_sales=total_sales+1 WHERE user_id=$1', [order.seller_id]);
        await client.query('UPDATE products SET sales_count=sales_count+1 WHERE id=$1', [order.product_id]);
        const referral = await paySellerReferral(client, order);
        const referralText = referral?.paid ? ` Реферальная выплата: ${referral.amount.toLocaleString('ru')} ₽.` : '';
        await client.query(
          `INSERT INTO order_messages (order_id, sender_id, message, is_system)
           VALUES ($1,$2,$3,TRUE)`,
          [order.id, req.user.id, `Сделка автоматически завершена администратором после истечения срока подтверждения. Средства переведены продавцу.${referralText}`]
        );
        confirmed.push({ id: order.id, order_number: order.order_number, buyer_id: order.buyer_id, seller_id: order.seller_id });
      }

      return confirmed;
    });

    await Promise.all(result.flatMap(order => [
      notify.create(order.buyer_id, 'order_confirmed', 'Сделка завершена автоматически', `Заказ ${order.order_number} закрыт после истечения срока подтверждения.`, `/orders/${order.id}`).catch(() => {}),
      notify.create(order.seller_id, 'order_confirmed', 'Сделка завершена автоматически', `Средства по заказу ${order.order_number} зачислены на баланс.`, `/orders/${order.id}`).catch(() => {}),
    ]));
    logger.info('Expired orders auto-confirmed', { adminId: req.user.id, count: result.length });
    res.json({ message: `Просроченные сделки завершены: ${result.length}`, count: result.length, orders: result });
  } catch (err) {
    logger.error('Auto-confirm expired orders error', { err: err.message });
    res.status(500).json({ error: 'Ошибка завершения просроченных сделок' });
  }
});

// ── GET /admin/logs ───────────────────────────────────

router.post('/settings/actions/test-smtp', requireRole('admin'), async (req, res) => {
  const email = String(req.body?.email || req.user.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Укажите email для тестового письма' });
  try {
    await sendTestEmail(email);
    logger.info('SMTP test email sent', { adminId: req.user.id, email });
    res.json({ message: `Тестовое письмо отправлено на ${email}` });
  } catch (err) {
    logger.error('SMTP test email error', { err: err.message, adminId: req.user.id });
    res.status(500).json({ error: `Не удалось отправить тестовое письмо: ${err.message}` });
  }
});

router.post('/settings/actions/test-telegram', requireRole('admin'), async (req, res) => {
  const chatId = String(req.body?.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
  if (!chatId) return res.status(400).json({ error: 'Укажите TELEGRAM_ADMIN_CHAT_ID или chatId для теста' });
  try {
    delete require.cache[require.resolve('../telegram/adminBot')];
    const bot = require('../telegram/adminBot');
    await bot.sendToChat(chatId, 'SellWay Admin: тестовое сообщение отправлено успешно.');
    logger.info('Telegram admin test message sent', { adminId: req.user.id, chatId });
    res.json({ message: `Тестовое сообщение отправлено в Telegram chat ${chatId}` });
  } catch (err) {
    logger.error('Telegram admin test message error', { err: err.message, adminId: req.user.id });
    res.status(500).json({ error: `Не удалось отправить Telegram-сообщение: ${err.message}` });
  }
});

router.post('/settings/actions/test-telegram-connection', requireRole('admin'), async (req, res) => {
  try {
    delete require.cache[require.resolve('../telegram/bot')];
    delete require.cache[require.resolve('../telegram/adminBot')];
    const userBot = require('../telegram/bot');
    const adminBot = require('../telegram/adminBot');
    const results = [];
    if (!userBot.bot) throw new Error('TELEGRAM_BOT_TOKEN не настроен');
    if (!adminBot.bot) throw new Error('TELEGRAM_ADMIN_BOT_TOKEN не настроен');
    const userMe = await userBot.bot.getMe();
    const adminMe = await adminBot.bot.getMe();
    results.push(`user @${userMe.username}`);
    results.push(`admin @${adminMe.username}`);
    logger.info('Telegram bots connection test ok', { adminId: req.user.id, results });
    res.json({ message: `Telegram API доступен: ${results.join(', ')}` });
  } catch (err) {
    logger.error('Telegram bots connection test error', { err: err.message, adminId: req.user.id });
    res.status(500).json({ error: `Telegram API недоступен через текущие настройки SOCKS5: ${err.message}` });
  }
});

router.get('/logs', async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const { rows } = await query(
    `SELECT al.*, u.username FROM audit_logs al
     LEFT JOIN users u ON u.id=al.user_id
     ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit]
  );
  res.json({ logs: rows });
});

module.exports = router;
