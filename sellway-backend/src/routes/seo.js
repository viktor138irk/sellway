const router = require('express').Router();
const { query } = require('../config/db');

const BASE = (process.env.FRONTEND_URL || 'https://sellway.pro').replace(/\/+$/, '');

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlNode(loc, lastmod, priority = '0.7', changefreq = 'daily') {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : '',
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

router.get('/sitemap.xml', async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      query(
        `SELECT id, updated_at, created_at
         FROM products
         WHERE status='active'
         ORDER BY updated_at DESC
         LIMIT 50000`
      ),
      query(
        `SELECT slug, category_type, updated_at, created_at
         FROM categories
         WHERE is_active=TRUE
         ORDER BY sort_order, name
         LIMIT 50000`
      ),
    ]);

    const urls = [
      urlNode(`${BASE}/`, null, '1.0', 'daily'),
      urlNode(`${BASE}/catalog?kind=products`, null, '0.9', 'daily'),
      urlNode(`${BASE}/catalog?kind=services`, null, '0.9', 'daily'),
      urlNode(`${BASE}/terms`, null, '0.5', 'monthly'),
      ...categories.rows.map(c => urlNode(`${BASE}/catalog?kind=${c.category_type === 'service' ? 'services' : 'products'}&category=${encodeURIComponent(c.slug)}`, c.updated_at || c.created_at, '0.8', 'daily')),
      ...products.rows.map(p => urlNode(`${BASE}/product/${p.id}`, p.updated_at || p.created_at, '0.8', 'daily')),
    ];

    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  } catch (err) {
    res.status(500).type('text/plain').send('sitemap error');
  }
});

module.exports = router;
