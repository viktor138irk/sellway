const router = require('express').Router();
const { query } = require('../config/db');
const { auth, requireRole, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, async (req, res) => {
  const isAdmin = ['admin', 'moderator'].includes(req.user?.role);
  const { rows } = await query(
    `SELECT id, name, slug, image_url, emoji, description, parent_id, is_active, sort_order, product_count
     FROM categories
     WHERE ($1::boolean = TRUE OR is_active=TRUE)
     ORDER BY COALESCE(parent_id, id), parent_id NULLS FIRST, sort_order, name`,
    [isAdmin]
  );
  res.json(rows);
});

router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { name, slug, emoji, image_url, description, parent_id, is_active, sort_order } = req.body;
  const { rows: [cat] } = await query(
    `INSERT INTO categories (name, slug, emoji, image_url, description, parent_id, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,TRUE),COALESCE($8,0)) RETURNING *`,
    [name, slug, emoji, image_url, description, parent_id || null, is_active, sort_order]
  );
  res.status(201).json(cat);
});

router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  const { name, slug, emoji, image_url, description, is_active, sort_order, parent_id } = req.body;
  if (parent_id === req.params.id) return res.status(400).json({ error: 'Категория не может быть родителем самой себе' });
  const hasImage = Object.prototype.hasOwnProperty.call(req.body, 'image_url');
  const hasParent = Object.prototype.hasOwnProperty.call(req.body, 'parent_id');
  const { rows: [cat] } = await query(
    `UPDATE categories SET
       name=COALESCE($1,name),
       slug=COALESCE($2,slug),
       emoji=COALESCE($3,emoji),
       image_url=CASE WHEN $4 THEN $5 ELSE image_url END,
       description=COALESCE($6,description),
       is_active=COALESCE($7,is_active),
       sort_order=COALESCE($8,sort_order),
       parent_id=CASE WHEN $9 THEN $10 ELSE parent_id END
     WHERE id=$11 RETURNING *`,
    [name, slug, emoji, hasImage, image_url || null, description, is_active, sort_order, hasParent, parent_id || null, req.params.id]
  );
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
  res.json(cat);
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  await query('UPDATE categories SET is_active=FALSE WHERE id=$1 OR parent_id=$1', [req.params.id]);
  res.json({ message: 'Категория скрыта' });
});

module.exports = router;
