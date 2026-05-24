const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { transaction } = require('../config/db');
const { sendVerifyEmail } = require('../services/mailer');
const notify = require('../services/notify');
const logger = require('../config/logger');

function makeReferralCode() {
  return uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
}

async function createSellerProfile(client, user, ref, commercialTermsAccepted) {
  let referrerId = null;
  if (ref) {
    const { rows: [referrer] } = await client.query(
      'SELECT user_id FROM sellers WHERE LOWER(referral_code)=LOWER($1) AND referral_enabled=TRUE LIMIT 1',
      [ref]
    );
    referrerId = referrer?.user_id || null;
  }

  const { rows: [setting] } = await client.query("SELECT value FROM settings WHERE key='default_referral_commission_rate' LIMIT 1");
  const defaultRate = setting?.value || '0.0100';

  const { rows: [terms] } = await client.query("SELECT value FROM settings WHERE key='commercial_terms_version' LIMIT 1");
  const commercialTermsVersion = terms?.value || '2026-05-25';
  await client.query(
    `INSERT INTO sellers (
       user_id, display_name, referral_code, referred_by_seller_id, referral_commission_rate,
       referral_enabled, referral_application_status,
       commercial_terms_accepted_at, commercial_terms_version, commercial_application_status, commercial_requested_at
     )
     VALUES ($1,$2,$3,$4,$5,FALSE,'not_requested',NOW(),$6,'pending',NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id, user.username, makeReferralCode(), referrerId, defaultRate, commercialTermsAccepted ? commercialTermsVersion : null]
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
  body('termsAccepted').equals('true').withMessage('Необходимо принять пользовательское соглашение'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, username, password, role = 'buyer', ref } = req.body;
  const commercialTermsAccepted = [true, 'true', '1', 'on', 'yes'].includes(req.body.commercialTermsAccepted);
  if ((role === 'seller' || role === 'freelancer') && !commercialTermsAccepted) {
    return res.status(422).json({ errors: [{ msg: 'Для магазина или фрилансера нужно принять дополнительные условия площадки' }] });
  }

  try {
    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
      if (existing.rows.length > 0) throw { status: 409, message: 'Email или никнейм уже занят' };

      const { rows: [terms] } = await client.query("SELECT value FROM settings WHERE key='terms_version' LIMIT 1");
      const termsVersion = terms?.value || '2026-05-24';
      const passwordHash = await bcrypt.hash(password, 12);
      const verifyToken = uuidv4();
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      const ua = req.headers['user-agent'] || null;

      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, username, password_hash, role, email_verify_token, terms_accepted_at, terms_version, registration_ip, registration_user_agent)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8) RETURNING id, email, username, role`,
        [email, username, passwordHash, role, verifyToken, termsVersion, ip, ua]
      );

      await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);

      if (role === 'seller' || role === 'freelancer') {
        await createSellerProfile(client, user, ref, commercialTermsAccepted);
      }

      return { user, verifyToken };
    });

    await sendVerifyEmail(email, username, result.verifyToken).catch(err => {
      logger.error('Email send error after register', { err: err.message, email });
    });

    logger.info('User registered', { userId: result.user.id, email, role });
    if (role === 'seller' || role === 'freelancer') {
      notify.notifyAdmins(
        'system',
        'Новая заявка на коммерческий аккаунт',
        `${username} (${email}) зарегистрировался как ${role === 'freelancer' ? 'фрилансер' : 'продавец'} и ждет модерации`,
        '/admin/users'
      ).catch(() => {});
    }
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
