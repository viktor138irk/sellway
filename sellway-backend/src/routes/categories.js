const router = require('express').Router();
const { query } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, slug, image_url, emoji, description, sort_order, product_count FROM categories WHERE is_active=TRUE ORDER BY sort_order'
  );
  res.json(rows);
});

router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { name, slug, emoji, image_url, description } = req.body;
  const { rows: [cat] } = await query(
    'INSERT INTO categories (name, slug, emoji, image_url, description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, slug, emoji, image_url, description]
  );
  res.status(201).json(cat);
});

router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  const { name, slug, emoji, image_url, description, is_active, sort_order } = req.body;
  const { rows: [cat] } = await query(
    'UPDATE categories SET name=COALESCE($1,name), slug=COALESCE($2,slug), emoji=COALESCE($3,emoji), image_url=COALESCE($4,image_url), description=COALESCE($5,description), is_active=COALESCE($6,is_active), sort_order=COALESCE($7,sort_order) WHERE id=$8 RETURNING *',
    [name, slug, emoji, image_url, description, is_active, sort_order, req.params.id]
  );
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
  res.json(cat);
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  await query('UPDATE categories SET is_active=FALSE WHERE id=$1', [req.params.id]);
  res.json({ message: 'Категория скрыта' });
});

module.exports = router;
