const router = require('express').Router();
const { query } = require('../config/db');
const logger = require('../config/logger');

router.get('/theme', async (req, res) => {
  try {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'public_site_theme' LIMIT 1");
    const selected = rows[0]?.value === 'classic' ? 'classic' : 'editorial';
    res.json({ theme: selected });
  } catch (err) {
    logger.error('Public theme settings error', { err: err.message });
    res.json({ theme: 'editorial' });
  }
});

router.get('/seo', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT key, value FROM settings WHERE key IN ('seo_yandex_metrika_id','seo_google_analytics_id')"
    );
    const settings = Object.fromEntries(rows.map(r => [r.key, String(r.value || '').trim()]));
    const yandexMetrikaId = /^\d+$/.test(settings.seo_yandex_metrika_id || '')
      ? settings.seo_yandex_metrika_id
      : '';
    const googleAnalyticsId = /^G-[A-Z0-9]+$/i.test(settings.seo_google_analytics_id || '')
      ? settings.seo_google_analytics_id.toUpperCase()
      : '';
    res.json({ yandexMetrikaId, googleAnalyticsId });
  } catch (err) {
    logger.error('Public SEO settings error', { err: err.message });
    res.json({ yandexMetrikaId: '', googleAnalyticsId: '' });
  }
});

router.get('/terms', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT key, value FROM settings WHERE key IN ('terms_title','terms_version','terms_content')"
    );
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      title: settings.terms_title || 'Правила торговой площадки SellWay.pro',
      version: settings.terms_version || '2026-05-25',
      content: settings.terms_content || '',
    });
  } catch (err) {
    logger.error('Public terms settings error', { err: err.message });
    res.status(500).json({ error: 'Ошибка загрузки правил' });
  }
});

module.exports = router;
