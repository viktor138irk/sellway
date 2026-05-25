const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const COMMERCIAL_ROLES = new Set(['seller', 'freelancer', 'admin']);

async function touchSellerPresence(user) {
  if (!COMMERCIAL_ROLES.has(user?.role)) return;
  await query(
    `UPDATE sellers
     SET last_seen_at = NOW(), is_online = TRUE
     WHERE user_id = $1
       AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '1 minute' OR is_online = FALSE)`,
    [user.id]
  ).catch(() => {});
}

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query(
      'SELECT id, email, username, role, status, email_verified, phone_verified, telegram_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows[0]) return res.status(401).json({ error: 'Пользователь не найден' });
    if (rows[0].status === 'banned') return res.status(403).json({ error: 'Аккаунт заблокирован' });

    req.user = rows[0];
    await touchSellerPresence(req.user);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Невалидный токен' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query('SELECT id, email, username, role, status, email_verified, phone_verified, telegram_verified FROM users WHERE id = $1', [decoded.userId]);
    if (rows[0]) {
      req.user = rows[0];
      await touchSellerPresence(req.user);
    }
  } catch {}
  next();
};

module.exports = { auth, requireRole, optionalAuth };
