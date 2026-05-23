const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { sendVerifyEmail, sendResetEmail } = require('../services/mailer');
const logger = require('../config/logger');

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
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, username, password, role = 'buyer' } = req.body;

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
        await client.query(
          'INSERT INTO sellers (user_id, display_name) VALUES ($1,$2)',
          [user.id, username]
        );
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
            u.email_verified, u.created_at,
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
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { username, avatar_url } = req.body;

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
         avatar_url = COALESCE($2, avatar_url)
       WHERE id = $3`,
      [username || null, avatar_url || null, req.user.id]
    );

    const user = await buildUserResponse(req.user.id);
    logger.info('Profile updated', { userId: req.user.id });
    res.json(user);
  } catch (err) {
    logger.error('Profile update error', { err: err.message });
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
