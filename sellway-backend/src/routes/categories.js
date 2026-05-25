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
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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

router.post('/bulk-import', auth, requireRole('admin'), async (req, res) => {
  const categoryType = normalizeType(req.body.category_type || req.body.type);
  const groups = parseBulkCatalog(req.body.text);
  if (!groups.length) return res.status(400).json({ error: 'Вставьте список групп и подгрупп' });
  if (groups.length > 1500) return res.status(400).json({ error: 'Слишком большой список для одного импорта' });
  try {
    let createdRoots = 0;
    let createdChildren = 0;
    for (const group of groups) {
      const rootSlug = await availableSlug(categoryType, group.name, null);
      let root;
      if (rootSlug.exists) {
        ({ rows: [root] } = await query('SELECT id FROM categories WHERE category_type=$1 AND slug=$2', [categoryType, rootSlug.slug]));
      } else {
        ({ rows: [root] } = await query(
          `INSERT INTO categories (category_type, name, slug, is_active, sort_order)
           VALUES ($1,$2,$3,TRUE,0) RETURNING id`,
          [categoryType, group.name, rootSlug.slug]
        ));
        createdRoots += 1;
      }
      for (const name of [...new Set(group.children)]) {
        const childSlug = await availableSlug(categoryType, name, root.id);
        if (childSlug.exists) continue;
        await query(
          `INSERT INTO categories (category_type, name, slug, parent_id, is_active, sort_order)
           VALUES ($1,$2,$3,$4,TRUE,0)`,
          [categoryType, name, childSlug.slug, root.id]
        );
        createdChildren += 1;
      }
    }
    res.status(201).json({ parsed: groups.length, createdRoots, createdChildren });
  } catch (err) {
    res.status(500).json({ error: `Ошибка импорта: ${err.message}` });
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
