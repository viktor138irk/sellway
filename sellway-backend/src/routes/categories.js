const router = require('express').Router();
const { query } = require('../config/db');
const { auth, requireRole, optionalAuth } = require('../middleware/auth');

const CATEGORY_TYPES = ['product', 'service'];
function normalizeType(value) {
  return CATEGORY_TYPES.includes(value) ? value : 'product';
}

router.get('/', optionalAuth, async (req, res) => {
  const isAdmin = ['admin', 'moderator'].includes(req.user?.role);
  const categoryType = normalizeType(req.query.type || req.query.category_type);
  const { rows } = await query(
    `SELECT c.id, c.category_type, c.name, c.slug, c.image_url, c.emoji, c.description, c.parent_id,
            c.is_active, c.sort_order, c.product_count,
            parent.image_url AS parent_image_url,
            COALESCE(c.image_url, parent.image_url) AS display_image_url
     FROM categories c
     LEFT JOIN categories parent ON parent.id=c.parent_id
     WHERE c.category_type=$1
       AND ($2::boolean = TRUE OR c.is_active=TRUE)
     ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.sort_order, c.name`,
    [categoryType, isAdmin]
  );
  res.json(rows);
});

router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { name, slug, emoji, image_url, description, parent_id, is_active, sort_order } = req.body;
  const categoryType = normalizeType(req.body.category_type || req.body.type);
  if (parent_id) {
    const { rows: [parent] } = await query('SELECT category_type FROM categories WHERE id=$1', [parent_id]);
    if (!parent) return res.status(400).json({ error: 'Родительская категория не найдена' });
    if (parent.category_type !== categoryType) return res.status(400).json({ error: 'Подкатегория должна быть в том же разделе' });
  }
  const { rows: [cat] } = await query(
    `INSERT INTO categories (category_type, name, slug, emoji, image_url, description, parent_id, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,TRUE),COALESCE($9,0)) RETURNING *`,
    [categoryType, name, slug, emoji, image_url, description, parent_id || null, is_active, sort_order]
  );
  res.status(201).json(cat);
});

router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  const { name, slug, emoji, image_url, description, is_active, sort_order, parent_id } = req.body;
  if (parent_id === req.params.id) return res.status(400).json({ error: 'Категория не может быть родителем самой себе' });
  const { rows: [current] } = await query('SELECT id, category_type FROM categories WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Категория не найдена' });
  const hasType = Object.prototype.hasOwnProperty.call(req.body, 'category_type') || Object.prototype.hasOwnProperty.call(req.body, 'type');
  const categoryType = hasType ? normalizeType(req.body.category_type || req.body.type) : current.category_type;
  if (parent_id) {
    const { rows: [parent] } = await query('SELECT category_type FROM categories WHERE id=$1', [parent_id]);
    if (!parent) return res.status(400).json({ error: 'Родительская категория не найдена' });
    if (parent.category_type !== categoryType) return res.status(400).json({ error: 'Подкатегория должна быть в том же разделе' });
  }
  const hasImage = Object.prototype.hasOwnProperty.call(req.body, 'image_url');
  const hasParent = Object.prototype.hasOwnProperty.call(req.body, 'parent_id');
  const { rows: [cat] } = await query(
    `UPDATE categories SET
       category_type=$1,
       name=COALESCE($2,name),
       slug=COALESCE($3,slug),
       emoji=COALESCE($4,emoji),
       image_url=CASE WHEN $5 THEN $6 ELSE image_url END,
       description=COALESCE($7,description),
       is_active=COALESCE($8,is_active),
       sort_order=COALESCE($9,sort_order),
       parent_id=CASE WHEN $10 THEN $11 ELSE parent_id END
     WHERE id=$12 RETURNING *`,
    [categoryType, name, slug, emoji, hasImage, image_url || null, description, is_active, sort_order, hasParent, parent_id || null, req.params.id]
  );
  res.json(cat);
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  await query('UPDATE categories SET is_active=FALSE WHERE id=$1 OR parent_id=$1', [req.params.id]);
  res.json({ message: 'Категория скрыта' });
});

module.exports = router;
