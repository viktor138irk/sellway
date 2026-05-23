const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { auth, requireRole, optionalAuth } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');

// ── File Upload ──────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Только JPEG, PNG, WebP'), allowed.includes(file.mimetype));
  },
});
const fileUpload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.PRODUCT_FILE_MAX_SIZE) || 104857600 },
});

// ── GET /products ────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1, limit = 24, category, search, sort = 'popular',
      min_price, max_price, delivery, seller, status,
    } = req.query;

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit), 100);
    const params = [];
    const where  = [];

    // По умолчанию — только активные. Продавец может видеть свои в любом статусе.
    if (seller) {
      params.push(seller);
      where.push(`p.seller_id = $${params.length}`);

      // Проверка доступа: только сам продавец или админ
      if (!req.user || (req.user.id !== seller && req.user.role !== 'admin' && req.user.role !== 'moderator')) {
        return res.status(403).json({ error: 'Нет доступа к товарам другого продавца' });
      }
      // Если seller указан — показываем все статусы кроме архива (или по фильтру)
      if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
      else where.push("p.status != 'archived'");
    } else {
      where.push("p.status = 'active'");
    }

    if (category) {
      params.push(category);
      where.push(`(c.slug = $${params.length} OR parent.slug = $${params.length})`);
    }
    if (search)   {
      params.push(`%${search}%`);
      where.push(`(p.title ILIKE $${params.length} OR p.short_desc ILIKE $${params.length})`);
    }
    if (min_price) { params.push(parseFloat(min_price)); where.push(`p.price >= $${params.length}`); }
    if (max_price) { params.push(parseFloat(max_price)); where.push(`p.price <= $${params.length}`); }
    if (delivery)  { params.push(delivery);              where.push(`p.delivery_type = $${params.length}`); }

    const orderMap = {
      popular: 'p.sales_count DESC', newest: 'p.created_at DESC',
      price_asc: 'p.price ASC', price_desc: 'p.price DESC', rating: 'p.rating DESC',
    };
    const orderBy  = orderMap[sort] || 'p.sales_count DESC';
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const limitVal  = Math.min(parseInt(limit), 100);
    params.push(limitVal, offset);

    const { rows: products } = await query(
      `SELECT p.id, p.title, p.short_desc, p.price, p.old_price, p.status,
              p.delivery_type, p.keys_count, p.rating, p.reviews_count,
              p.sales_count, p.tags, p.guarantee_days, p.seller_id,
              c.name AS category_name, c.slug AS category_slug,
              parent.id AS parent_category_id, parent.name AS parent_category_name, parent.slug AS parent_category_slug,
              u.username AS seller_name,
              s.verified AS seller_verified, s.rating AS seller_rating,
              s.total_sales AS seller_sales,
              (SELECT url FROM product_images WHERE product_id=p.id AND is_main=TRUE LIMIT 1) AS main_image,
              (SELECT COALESCE(json_agg(url ORDER BY sort_order), '[]'::json)
               FROM product_images WHERE product_id=p.id) AS images,
              (SELECT COUNT(*)::int FROM product_files WHERE product_id=p.id) AS files_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories parent ON parent.id = c.parent_id
       LEFT JOIN users u ON u.id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       ${whereStr}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*)::int FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories parent ON parent.id = c.parent_id
       ${whereStr}`,
      params.slice(0, -2)
    );

    res.json({
      products,
      pagination: {
        total: count, page: parseInt(page), limit: limitVal, pages: Math.ceil(count / limitVal),
      },
    });
  } catch (err) {
    logger.error('Get products error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /products/:id ─── images возвращаем в том же формате ───
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,
              c.name AS category_name, c.slug AS category_slug,
              c.parent_id AS parent_category_id,
              u.username AS seller_name, u.avatar_url AS seller_avatar,
              s.verified AS seller_verified, s.rating AS seller_rating,
              s.total_sales AS seller_sales, s.response_time_min,
              s.description AS seller_description, s.is_online AS seller_online,
              (SELECT COALESCE(json_agg(url ORDER BY sort_order), '[]'::json)
               FROM product_images WHERE product_id=p.id) AS images,
              (SELECT COALESCE(json_agg(json_build_object('id', id, 'url', url, 'filename', filename, 'size_bytes', size_bytes) ORDER BY created_at DESC), '[]'::json)
               FROM product_files WHERE product_id=p.id) AS files,
              (SELECT COUNT(*)::int FROM product_files WHERE product_id=p.id) AS files_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN users u ON u.id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       WHERE p.id = $1 AND (p.status = 'active' OR p.seller_id = $2)`,
      [req.params.id, req.user?.id || null]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Товар не найден' });

    // Инкремент только для чужих просмотров
    if (!req.user || req.user.id !== rows[0].seller_id) {
      query('UPDATE products SET views_count = views_count + 1 WHERE id=$1', [req.params.id]).catch(() => {});
    }

    const { rows: reviews } = await query(
      `SELECT r.rating, r.comment, r.is_auto, r.created_at,
              u.username AS buyer_name, u.avatar_url AS buyer_avatar
       FROM reviews r JOIN users u ON u.id = r.buyer_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...rows[0], reviews });
  } catch (err) {
    logger.error('Get product error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /products ─── Создать ────────────────────────
router.post('/', auth, requireRole('seller', 'admin'), [
  body('title').trim().isLength({ min: 5, max: 255 }),
  body('price').isFloat({ min: 1 }),
  body('category_id').isUUID(),
  body('delivery_type').isIn(['auto', 'manual', 'file']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { title, description, short_desc, price, old_price, category_id, delivery_type, guarantee_days, tags } = req.body;

  try {
    const { rows: [product] } = await query(
      `INSERT INTO products (seller_id, category_id, title, description, short_desc, price, old_price, delivery_type, guarantee_days, tags, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
      [req.user.id, category_id, title, description, short_desc, price, old_price || null, delivery_type, guarantee_days || 0, tags || []]
    );
    notify.adminNewProduct(product).catch(() => {});
    logger.info('Product created', { productId: product.id, sellerId: req.user.id });
    res.status(201).json(product);
  } catch (err) {
    logger.error('Create product error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── PUT /products/:id ─────────────────────────────────
router.put('/:id', auth, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const { rows: [existing] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Товар не найден' });
    if (existing.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const { title, description, short_desc, price, old_price, category_id, delivery_type, guarantee_days, tags } = req.body;
    const { rows: [product] } = await query(
      `UPDATE products SET
         title=COALESCE($1,title), description=$2, short_desc=$3,
         price=COALESCE($4,price), old_price=$5, category_id=COALESCE($6,category_id),
         delivery_type=COALESCE($7,delivery_type), guarantee_days=$8, tags=$9,
         status = CASE WHEN status='active' THEN 'pending' ELSE status END
       WHERE id=$10 RETURNING *`,
      [title, description, short_desc, price, old_price || null, category_id, delivery_type, guarantee_days || 0, tags || [], req.params.id]
    );
    res.json(product);
  } catch (err) {
    logger.error('Update product error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── DELETE /products/:id ──────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows: [p] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    await query("UPDATE products SET status='archived' WHERE id=$1", [req.params.id]);
    res.json({ message: 'Товар архивирован' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /products/:id/images ── Сброс старого is_main ──
router.post('/:id/images', auth, requireRole('seller', 'admin'), upload.array('images', 8), async (req, res) => {
  try {
    const { rows: [p] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (!req.files?.length) return res.status(400).json({ error: 'Файлы не загружены' });

    const baseUrl = process.env.UPLOAD_URL || '/uploads';
    const images = await transaction(async (client) => {
      // Сбрасываем is_main у всех старых
      await client.query('UPDATE product_images SET is_main=FALSE WHERE product_id=$1', [req.params.id]);

      const result = [];
      // Определяем offset для sort_order
      const { rows: [{ max_order }] } = await client.query(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM product_images WHERE product_id=$1',
        [req.params.id]
      );
      let order = max_order + 1;

      for (let i = 0; i < req.files.length; i++) {
        const url = `${baseUrl}/${req.files[i].filename}`;
        const isMain = i === 0;
        const { rows: [img] } = await client.query(
          'INSERT INTO product_images (product_id, url, sort_order, is_main) VALUES ($1,$2,$3,$4) RETURNING *',
          [req.params.id, url, order++, isMain]
        );
        result.push(img);
      }
      return result;
    });

    res.json({ images });
  } catch (err) {
    logger.error('Image upload error', { err: err.message });
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

// ── POST /products/:id/file ── Файл для автоматической выдачи ──
router.post('/:id/file', auth, requireRole('seller', 'admin'), fileUpload.single('file'), async (req, res) => {
  try {
    const { rows: [p] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const baseUrl = process.env.UPLOAD_URL || '/uploads';
    await query('DELETE FROM product_files WHERE product_id=$1', [req.params.id]);
    const { rows: [file] } = await query(
      `INSERT INTO product_files (product_id, url, filename, mime_type, size_bytes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, `${baseUrl}/${req.file.filename}`, req.file.originalname, req.file.mimetype, req.file.size]
    );
    res.json({ file });
  } catch (err) {
    logger.error('Product file upload error', { err: err.message });
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ── POST /products/:id/keys ───────────────────────────
router.post('/:id/keys', auth, requireRole('seller', 'admin'), [
  body('keys').isArray({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  try {
    const { rows: [p] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const keys = req.body.keys.filter(k => k.trim());
    let added = 0;
    for (const key of keys) {
      const r = await query(
        'INSERT INTO product_keys (product_id, key_value) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id',
        [req.params.id, key.trim()]
      );
      if (r.rowCount) added++;
    }
    res.json({ message: `Добавлено ${added} ключей`, added });
  } catch (err) {
    logger.error('Add keys error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── DELETE /products/:id/keys/:keyId ─── SECURITY FIX ──
router.delete('/:id/keys/:keyId', auth, requireRole('seller', 'admin'), async (req, res) => {
  try {
    // Проверяем владельца
    const { rows: [p] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const { rowCount } = await query(
      'DELETE FROM product_keys WHERE id=$1 AND product_id=$2 AND NOT is_sold',
      [req.params.keyId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Ключ не найден или уже продан' });
    res.json({ message: 'Ключ удалён' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /products/:id/keys ─── только продавец/админ ───
router.get('/:id/keys', auth, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const { rows: [p] } = await query('SELECT seller_id FROM products WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const { rows } = await query(
      'SELECT id, key_value, is_sold, sold_at, created_at FROM product_keys WHERE product_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
