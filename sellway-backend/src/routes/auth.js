const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { sendVerifyEmail, sendResetEmail } = require('../services/mailer');
const { sendVerificationCode, normalizePhone } = require('../services/sms');
const logger = require('../config/logger');

function makeReferralCode() {
  return uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
}

// ── Tokens ──────────────────────────────────────────

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

// ── POST /auth/register ──────────────────────────────

router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Никнейм: 3-30 символов, только буквы/цифры/_'),
  body('password').isLength({ min: 8 }).withMessage('Пароль минимум 8 символов'),
  body('role').optional().isIn(['buyer', 'seller']).withMessage('Некорректная роль'),
  body('ref').optional().trim().isLength({ max: 64 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, username, password, role = 'buyer', ref } = req.body;

  try {
    await transaction(async (client) => {
      // Проверка уникальности
      const existing = await client.query(
        'SELECT id FROM users WHERE email=$1 OR username=$2',
        [email, username]
      );
      if (existing.rows.length > 0) {
        throw { status: 409, message: 'Email или никнейм уже занят' };
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const verifyToken = uuidv4();

      // Создаём пользователя
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, username, password_hash, role, email_verify_token)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, email, username, role`,
        [email, username, passwordHash, role, verifyToken]
      );

      // Создаём кошелёк
      await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);

      // Если продавец — создаём профиль
      if (role === 'seller') {
        let referrerId = null;
        if (ref) {
          const { rows: [referrer] } = await client.query(
            `SELECT user_id FROM sellers WHERE LOWER(referral_code)=LOWER($1) LIMIT 1`,
            [ref]
          );
          referrerId = referrer?.user_id || null;
        }

        await client.query(
          `INSERT INTO sellers (user_id, display_name, referral_code, referred_by_seller_id)
           VALUES ($1,$2,$3,$4)`,
          [user.id, username, makeReferralCode(), referrerId]
        );

        if (referrerId) {
          await client.query(
            `UPDATE sellers
             SET referred_sellers_count=(
               SELECT COUNT(*) FROM sellers child WHERE child.referred_by_seller_id=sellers.user_id
             )
             WHERE user_id=$1`,
            [referrerId]
          );
        }
      }

      // Отправляем письмо
      await sendVerifyEmail(email, username, verifyToken).catch(err =>
        logger.error('Email send error', { err: err.message })
      );

      logger.info('User registered', { userId: user.id, email, role });

      return res.status(201).json({
        message: 'Регистрация успешна. Проверьте email для верификации.',
        user: { id: user.id, email, username, role },
      });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Register error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /auth/login ─────────────────────────────────

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const { rows } = await query(
      'SELECT id, email, username, password_hash, role, status, email_verified FROM users WHERE email=$1',
      [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    const ip = req.ip;
    const ua = req.headers['user-agent'];

    await saveRefreshToken(user.id, refreshToken, ip, ua);
    await query('UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2', [ip, user.id]);

    logger.info('User logged in', { userId: user.id, ip });

    // Возвращаем полного пользователя с balance/rating
    const fullUser = await buildUserResponse(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: fullUser,
    });
  } catch (err) {
    logger.error('Login error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /auth/refresh ───────────────────────────────

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token не предоставлен' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const { rows } = await query(
      'SELECT * FROM refresh_tokens WHERE token=$1 AND expires_at > NOW()',
      [refreshToken]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Токен недействителен или истёк' });

    const { rows: [user] } = await query(
      'SELECT id, email, username, role FROM users WHERE id=$1',
      [decoded.userId]
    );

    // Rotate refresh token
    await query('DELETE FROM refresh_tokens WHERE token=$1', [refreshToken]);
    const tokens = generateTokens(user.id, user.role);
    await saveRefreshToken(user.id, tokens.refreshToken, req.ip, req.headers['user-agent']);

    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Невалидный refresh token' });
  }
});

// ── POST /auth/logout ────────────────────────────────

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await query('DELETE FROM refresh_tokens WHERE token=$1', [refreshToken]).catch(() => {});
  }
  res.json({ message: 'Выход выполнен' });
});

// ── GET /auth/verify-email/:token ───────────────────

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE users SET email_verified=TRUE, status='active', email_verify_token=NULL
       WHERE email_verify_token=$1 AND email_verified=FALSE RETURNING id, username`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Токен недействителен или уже использован' });

    logger.info('Email verified', { userId: rows[0].id });
    res.json({ message: `Email подтверждён! Добро пожаловать, ${rows[0].username}` });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /auth/forgot-password ───────────────────────

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  const { email } = req.body;
  try {
    const { rows } = await query('SELECT id, username FROM users WHERE email=$1', [email]);
    if (!rows[0]) return res.json({ message: 'Если email существует, письмо отправлено' });

    const resetToken = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await query(
      'UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3',
      [resetToken, expires, rows[0].id]
    );
    await sendResetEmail(email, rows[0].username, resetToken);

    res.json({ message: 'Если email существует, письмо отправлено' });
  } catch (err) {
    logger.error('Forgot password error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /auth/reset-password ────────────────────────

router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { token, password } = req.body;
  try {
    const { rows } = await query(
      'SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
      [token]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Токен недействителен или истёк' });

    const hash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2',
      [hash, rows[0].id]
    );
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [rows[0].id]);

    res.json({ message: 'Пароль успешно изменён' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /auth/me ─────────────────────────────────────

async function buildUserResponse(userId) {
  const { rows: [user] } = await query(
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

router.get('/me', require('../middleware/auth').auth, async (req, res) => {
  try {
    const user = await buildUserResponse(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── PUT /auth/profile ── Обновление профиля ──────────

router.put('/profile', require('../middleware/auth').auth, [
  body('username').optional().trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('avatar_url').optional().isURL(),
  body('phone').optional().trim().isLength({ max: 20 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { username, avatar_url, phone } = req.body;

  try {
    if (username) {
      const { rows } = await query(
        'SELECT id FROM users WHERE username=$1 AND id != $2',
        [username, req.user.id]
      );
      if (rows.length) return res.status(409).json({ error: 'Никнейм занят' });
    }

    await query(
      `UPDATE users SET
         username = COALESCE($1, username),
         avatar_url = COALESCE($2, avatar_url),
         phone = COALESCE($3, phone),
         phone_verified = CASE WHEN $3::VARCHAR IS NOT NULL AND $3::VARCHAR != COALESCE(phone,'') THEN FALSE ELSE phone_verified END
       WHERE id = $4`,
      [username || null, avatar_url || null, phone ? normalizePhone(phone) : null, req.user.id]
    );

    const user = await buildUserResponse(req.user.id);
    logger.info('Profile updated', { userId: req.user.id });
    res.json(user);
  } catch (err) {
    logger.error('Profile update error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /auth/telegram-link ── Генерация ссылки привязки Telegram для любого пользователя ──
router.post('/telegram-link', require('../middleware/auth').auth, async (req, res) => {
  try {
    const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@+/, '');
    if (!botUsername || /^your_/i.test(botUsername) || botUsername === 'SellWayBot') {
      return res.status(400).json({ error: 'Сначала укажите реальный TELEGRAM_BOT_USERNAME в админке' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await query('UPDATE users SET telegram_link_token=$1, telegram_link_expires=$2 WHERE id=$3', [token, expires, req.user.id]);
    res.json({
      link: `https://t.me/${botUsername}?start=${token}`,
      appLink: `tg://resolve?domain=${botUsername}&start=${token}`,
      botUsername,
      token,
      expiresAt: expires,
    });
  } catch (err) {
    logger.error('Telegram link error', { err: err.message, userId: req.user?.id });
    res.status(500).json({ error: 'Ошибка генерации ссылки Telegram' });
  }
});

// ── POST /auth/phone/send-code ───────────────────────

router.post('/phone/send-code', require('../middleware/auth').auth, [
  body('phone').trim().isLength({ min: 10, max: 20 }).withMessage('Некорректный номер телефона'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const phone = normalizePhone(req.body.phone);
  const code = String(Math.floor(100000 + Math.random() * 900000));

  try {
    const codeHash = await bcrypt.hash(code, 10);
    await query(
      `UPDATE users
       SET phone=$1, phone_verified=FALSE, phone_verify_code_hash=$2, phone_verify_expires=NOW()+INTERVAL '10 minutes'
       WHERE id=$3`,
      [phone, codeHash, req.user.id]
    );

    await sendVerificationCode(phone, code);
    res.json({
      message: 'Код подтверждения отправлен',
      ...(process.env.NODE_ENV !== 'production' && { devCode: code }),
    });
  } catch (err) {
    logger.error('Phone code send error', { userId: req.user.id, err: err.message });
    res.status(500).json({ error: err.message || 'Не удалось отправить SMS' });
  }
});

// ── POST /auth/phone/verify ──────────────────────────

router.post('/phone/verify', require('../middleware/auth').auth, [
  body('code').trim().isLength({ min: 4, max: 10 }).withMessage('Введите код из SMS'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  try {
    const { rows: [user] } = await query(
      `SELECT phone_verify_code_hash, phone_verify_expires
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!user?.phone_verify_code_hash || !user?.phone_verify_expires || new Date(user.phone_verify_expires) < new Date()) {
      return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
    }

    const ok = await bcrypt.compare(req.body.code.trim(), user.phone_verify_code_hash);
    if (!ok) return res.status(400).json({ error: 'Неверный код подтверждения' });

    await query(
      `UPDATE users
       SET phone_verified=TRUE, phone_verify_code_hash=NULL, phone_verify_expires=NULL
       WHERE id=$1`,
      [req.user.id]
    );
    res.json({ message: 'Телефон подтверждён' });
  } catch (err) {
    logger.error('Phone verify error', { userId: req.user.id, err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /auth/change-password ───────────────────────

router.post('/change-password', require('../middleware/auth').auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { currentPassword, newPassword } = req.body;

  try {
    const { rows: [user] } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    // Инвалидируем все refresh-токены кроме текущего сеанса (опционально — все)
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.user.id]);

    logger.info('Password changed', { userId: req.user.id });
    res.json({ message: 'Пароль изменён. Войдите заново на других устройствах.' });
  } catch (err) {
    logger.error('Change password error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
