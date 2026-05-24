const router = require('express').Router();
const { query } = require('../config/db');
const logger = require('../config/logger');

router.get('/terms', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT key, value FROM settings WHERE key IN ('terms_title','terms_version','terms_content')"
    );
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      title: settings.terms_title || 'Правила SellWay',
      version: settings.terms_version || '1.0',
      content: settings.terms_content || '',
    });
  } catch (err) {
    logger.error('Public terms settings error', { err: err.message });
    res.status(500).json({ error: 'Ошибка загрузки правил' });
  }
});

module.exports = router;
