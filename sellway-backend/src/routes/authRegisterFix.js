const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { transaction } = require('../config/db');
const { sendVerifyEmail } = require('../services/mailer');
const logger = require('../config/logger');

function makeReferralCode() {
  return uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
}

async function createSellerProfile(client, user, ref) {
  let referrerId = null;
  if (ref) {
    const { rows: [referrer] } = await client.query(
      'SELECT user_id FROM sellers WHERE LOWER(referral_code)=LOWER($1) LIMIT 1',
      [ref]
    );
    referrerId = referrer?.user_id || null;
  }

  await client.query(
    `INSERT INTO sellers (user_id, display_name, referral_code, referred_by_seller_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id, user.username, makeReferralCode(), referrerId]
  );

  if (referrerId) {
    await client.query(
      `UPDATE sellers
       SET referred_sellers_count=(SELECT COUNT(*) FROM sellers child WHERE child.referred_by_seller_id=sellers.user_id)
       WHERE user_id=$1`,
      [referrerId]
    );
  }
}

router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Никнейм: 3-30 символов, только буквы/цифры/_'),
  body('password').isLength({ min: 8 }).withMessage('Пароль минимум 8 символов'),
  body('role').optional().isIn(['buyer', 'seller', 'freelancer']).withMessage('Некорректная роль'),
  body('ref').optional().trim().isLength({ max: 64 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, username, password, role = 'buyer', ref } = req.body;

  try {
    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
      if (existing.rows.length > 0) throw { status: 409, message: 'Email или никнейм уже занят' };

      const passwordHash = await bcrypt.hash(password, 12);
      const verifyToken = uuidv4();
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, username, password_hash, role, email_verify_token)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, email, username, role`,
        [email, username, passwordHash, role, verifyToken]
      );

      await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);

      if (role === 'seller' || role === 'freelancer') {
        await createSellerProfile(client, user, ref);
      }

      return { user, verifyToken };
    });

    await sendVerifyEmail(email, username, result.verifyToken).catch(err => {
      logger.error('Email send error after register', { err: err.message, email });
    });

    logger.info('User registered', { userId: result.user.id, email, role });
    return res.status(201).json({
      message: 'Регистрация успешна. Проверьте email для верификации.',
      user: result.user,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Email или никнейм уже занят' });
    logger.error('Register error', { err: err.message });
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
