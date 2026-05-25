const router = require('express').Router();
const { query } = require('../config/db');
const { auth, requireRole, optionalAuth } = require('../middleware/auth');

const CATEGORY_TYPES = ['product', 'service'];
function normalizeType(value) {
  return CATEGORY_TYPES.includes(value) ? value : 'product';
}
const COMPOUND_SUBCATEGORIES = [
  'Оффлайн активации', 'Онлайн активации', 'Пополнение баланса', 'Подарочные карты',
  'Смена региона', 'Боевой пропуск', 'Месячный пропуск', 'Prime Gaming',
  'Twitch Drops', 'Game Pass', 'Золотые клетки', 'Древние монеты',
  'Кристаллы сотворения', 'Исследование локаций', 'Боссы и подземелья',
  'Настройка сервиса', 'Готовые сайты', 'Прочие игры', 'Аккаунты с играми',
  'Подарки (Gifts)', 'Премиальные кредиты', 'Самоцветы нексуса',
  'Кристаллы дракона', 'Ключи активации', 'Пополнение бумажника',
  'Выполнение ЛБЗ', 'Ресурс-паки', 'Готовые цифровые товары',
  'Золото столицы', 'Фарм серебра', 'Буст кубков', 'Буст рангов',
  'Прочий буст', 'Небесные самоцветы', 'Золотые рубли',
  'Серебряные рубли', 'Серебряные монеты', 'Донат робуксов (паки)',
  'Метеоритная пыль', 'Элементиевое пламя', 'Сферы возвышения',
  'Божественные сферы', 'Зеркала Каландры', 'Сферы хаоса',
  'Сферы (прочие)', 'Founders Edition', "Founder's Packs", 'VIP пропуск',
  'Gold Pass', 'Pass Royale', 'Brawl Pass', 'Pro Pass', 'Black Crystals',
  'Rune Stones', 'Supply Difference Engine', 'Empire Coins', 'Helix Credits',
  'Dragon Krystals', 'Mammoth Coins', 'Star Seeds', 'Blue Gems', 'Rose Gems',
  'Boom Pass', 'Aurum Pass', 'Poke Gold', 'World Gold', 'Crystal Drops',
  'Divine Gems', 'Gold Ingots', 'Silver and Blood', 'Moon Tears',
  'Battle Pass', 'Phantom Pass', 'Epic Pass', 'Stellarite', 'Nemo Bucks',
  'Super Credits', 'Cartel Coins', 'Wild Cores', 'Riot Points',
  'Tekniq Alloy', 'Delta Coins', 'Light Points', 'Metro Royale',
  'DMZ Recon', 'Twitch Prime', 'EA Play', 'Supply Crystals',
  'Золотые слитки', 'Золотые клетки', 'Кристаллы дракона',
  'Самоцветы нексуса', 'Камни бога', 'Токены Души', 'Очки опыта',
  'Золото столицы', 'Кровавые облигации', 'Чудо-монеты',
  'Фарм серебра', 'Буст статистики', 'Буст спецопераций',
  'Буст побед', 'Буст MMR', 'Онлайн активации', 'Оффлайн активации',
  'Прокачка PvE', 'Прокачка PvP', 'Готовые сайты', 'Смена региона',
];
const translit = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ы:'y',э:'e',ю:'yu',я:'ya',ь:'',ъ:'' };
function slugify(value) {
  return String(value || '').toLowerCase().split('').map(ch => translit[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 78) || 'category';
}
function parseSubcategories(line) {
  if (line.includes(';') || line.includes(',')) return line.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  let protectedLine = line;
  const protectedNames = [];
  [...COMPOUND_SUBCATEGORIES].sort((a, b) => b.length - a.length).forEach(name => {
    const key = `__GROUP_${protectedNames.length}__`;
    const next = protectedLine.replaceAll(name, key);
    if (next !== protectedLine) {
      protectedNames.push(name);
      protectedLine = next;
    }
  });
  return protectedLine.split(/\s+/).filter(Boolean).map(value => {
    const match = value.match(/^__GROUP_(\d+)__$/);
    return match ? protectedNames[Number(match[1])] : value;
  });
}
function parseBulkCatalog(text) {
  const rawLines = String(text || '').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
  const indented = rawLines.some(line => /^(\t| {2,})/.test(line));
  if (indented) {
    const roots = [];
    const stack = [];
    rawLines.forEach((rawLine, index) => {
      const whitespace = (rawLine.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ');
      if (whitespace.length % 2) throw new Error(`Строка ${index + 1}: используйте отступы по 2 пробела`);
      const depth = whitespace.length / 2;
      const name = rawLine.trim().replace(/^[-*]\s+/, '');
      const node = { name, children: [] };
      if (depth === 0) {
        roots.push(node);
      } else {
        const parent = stack[depth - 1];
        if (!parent) throw new Error(`Строка ${index + 1}: пропущен родительский уровень`);
        parent.children.push(node);
      }
      stack[depth] = node;
      stack.length = depth + 1;
    });
    return roots;
  }
  const lines = rawLines.map(line => line.trim());
  const groups = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^[A-ZА-ЯЁ0]$/.test(lines[index])) continue;
    const name = lines[index];
    const childLine = lines[index + 1];
    if (!childLine || /^[A-ZА-ЯЁ0]$/.test(childLine)) {
      groups.push({ name, children: [] });
      continue;
    }
    groups.push({ name, children: parseSubcategories(childLine) });
    index += 1;
  }
  return groups;
}
async function availableSlug(categoryType, name, parentId) {
  const base = slugify(name);
  const { rows: [existingName] } = await query(
    'SELECT slug FROM categories WHERE category_type=$1 AND LOWER(name)=LOWER($2) AND parent_id IS NOT DISTINCT FROM $3',
    [categoryType, name, parentId || null]
  );
  if (existingName) return { slug: existingName.slug, exists: true };
  for (let i = 0; i < 10000; i += 1) {
    const slug = i ? `${base}-${i + 1}` : base;
    const { rows: [taken] } = await query('SELECT id FROM categories WHERE category_type=$1 AND slug=$2', [categoryType, slug]);
    if (!taken) return { slug, exists: false };
  }
  throw new Error('Не удалось создать уникальный slug');
}

async function importNode(categoryType, node, parentId, depth, sortOrder, stats) {
  const categorySlug = await availableSlug(categoryType, node.name, parentId);
  let category;
  if (categorySlug.exists) {
    ({ rows: [category] } = await query(
      `UPDATE categories SET is_active=TRUE, sort_order=$4
       WHERE category_type=$1 AND slug=$2 AND parent_id IS NOT DISTINCT FROM $3
       RETURNING id`,
      [categoryType, categorySlug.slug, parentId || null, sortOrder]
    ));
  } else {
    ({ rows: [category] } = await query(
      `INSERT INTO categories (category_type, name, slug, parent_id, is_active, sort_order)
       VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id`,
      [categoryType, node.name, categorySlug.slug, parentId || null, sortOrder]
    ));
    stats.createdNodes += 1;
    stats.createdByLevel[depth] = (stats.createdByLevel[depth] || 0) + 1;
  }
  for (let index = 0; index < node.children.length; index += 1) {
    await importNode(categoryType, node.children[index], category.id, depth + 1, index, stats);
  }
}

router.get('/', optionalAuth, async (req, res) => {
  const isAdmin = ['admin', 'moderator'].includes(req.user?.role);
  const categoryType = normalizeType(req.query.type || req.query.category_type);
  const { rows } = await query(
    `SELECT c.id, c.category_type, c.name, c.slug, c.image_url, c.emoji, c.description, c.parent_id,
            c.is_active, c.sort_order, c.product_count,
            ancestor.image_url AS parent_image_url,
            COALESCE(c.image_url, ancestor.image_url) AS display_image_url,
            COALESCE(products.subtree_product_count, 0)::int AS subtree_product_count
     FROM categories c
     LEFT JOIN LATERAL (
       WITH RECURSIVE ancestors AS (
         SELECT parent.id, parent.parent_id, parent.image_url, 1 AS depth
         FROM categories parent WHERE parent.id=c.parent_id
         UNION ALL
         SELECT parent.id, parent.parent_id, parent.image_url, ancestors.depth + 1
         FROM categories parent JOIN ancestors ON parent.id=ancestors.parent_id
       )
       SELECT image_url FROM ancestors WHERE image_url IS NOT NULL ORDER BY depth LIMIT 1
     ) ancestor ON TRUE
     LEFT JOIN LATERAL (
       WITH RECURSIVE branch AS (
         SELECT c.id
         UNION ALL
         SELECT child.id FROM categories child JOIN branch ON child.parent_id=branch.id
       )
       SELECT COUNT(p.id) AS subtree_product_count
       FROM products p
       WHERE p.category_id IN (SELECT id FROM branch) AND p.status='active'
     ) products ON TRUE
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

router.post('/bulk-import', auth, requireRole('admin'), async (req, res) => {
  const categoryType = normalizeType(req.body.category_type || req.body.type);
  try {
    const groups = parseBulkCatalog(req.body.text);
    if (!groups.length) return res.status(400).json({ error: 'Вставьте список категорий' });
    if (groups.length > 1500) return res.status(400).json({ error: 'Слишком большой список для одного импорта' });
    const stats = { createdNodes: 0, createdByLevel: {} };
    for (let index = 0; index < groups.length; index += 1) {
      await importNode(categoryType, groups[index], null, 0, index, stats);
    }
    res.status(201).json({ parsed: groups.length, ...stats });
  } catch (err) {
    res.status(400).json({ error: `Ошибка импорта: ${err.message}` });
  }
});

router.post('/bulk-delete', auth, requireRole('admin'), async (req, res) => {
  const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.filter(id => /^[0-9a-f-]{36}$/i.test(String(id))) : [])];
  if (!ids.length) return res.status(400).json({ error: 'Выберите категории для удаления' });
  if (ids.length > 500) return res.status(400).json({ error: 'За один раз можно удалить до 500 веток' });
  try {
    const { rows: blocked } = await query(
      `WITH RECURSIVE branches AS (
         SELECT selected.id AS root_id, selected.id
         FROM categories selected WHERE selected.id=ANY($1::uuid[])
         UNION ALL
         SELECT branches.root_id, child.id
         FROM categories child JOIN branches ON child.parent_id=branches.id
       )
       SELECT DISTINCT root.id, root.name
       FROM categories root
       JOIN branches ON branches.root_id=root.id
       JOIN products p ON p.category_id=branches.id
       ORDER BY root.name`,
      [ids]
    );
    const blockedIds = new Set(blocked.map(item => item.id));
    const deletableIds = ids.filter(id => !blockedIds.has(id));
    let deleted = 0;
    if (deletableIds.length) {
      const result = await query(
        `WITH RECURSIVE branches AS (
           SELECT id FROM categories WHERE id=ANY($1::uuid[])
           UNION ALL
           SELECT child.id FROM categories child JOIN branches ON child.parent_id=branches.id
         )
         DELETE FROM categories WHERE id IN (SELECT id FROM branches)`,
        [deletableIds]
      );
      deleted = result.rowCount;
    }
    res.json({ deleted, blocked });
  } catch (err) {
    res.status(500).json({ error: `Не удалось удалить категории: ${err.message}` });
  }
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
    const { rows: [nestedIntoChild] } = await query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM categories WHERE parent_id=$1
         UNION ALL
         SELECT child.id FROM categories child JOIN descendants ON child.parent_id=descendants.id
       )
       SELECT id FROM descendants WHERE id=$2 LIMIT 1`,
      [req.params.id, parent_id]
    );
    if (nestedIntoChild) return res.status(400).json({ error: 'Нельзя переместить категорию внутрь её дочернего раздела' });
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
  await query(
    `WITH RECURSIVE branch AS (
       SELECT id FROM categories WHERE id=$1
       UNION ALL
       SELECT child.id FROM categories child JOIN branch ON child.parent_id=branch.id
     )
     UPDATE categories SET is_active=FALSE WHERE id IN (SELECT id FROM branch)`,
    [req.params.id]
  );
  res.json({ message: 'Категория скрыта' });
});

module.exports = router;
