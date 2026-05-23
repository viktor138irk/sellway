const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query(
      'SELECT id, email, username, role, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows[0]) return res.status(401).json({ error: 'Пользователь не найден' });
    if (rows[0].status === 'banned') return res.status(403).json({ error: 'Аккаунт заблокирован' });

    req.user = rows[0];
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
    const { rows } = await query('SELECT id, email, username, role, status FROM users WHERE id = $1', [decoded.userId]);
    if (rows[0]) req.user = rows[0];
  } catch {}
  next();
};

module.exports = { auth, requireRole, optionalAuth };
