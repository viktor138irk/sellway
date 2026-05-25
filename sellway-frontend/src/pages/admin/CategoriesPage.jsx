import { useState, useEffect, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Modal, Toggle, Select, Textarea } from '../../components/UI';
import { getCategories, createCategory, updateCategory, deleteCategory, bulkImportCategories, bulkDeleteCategories } from '../../api/products';
import { useToast } from '../../contexts/ToastContext';
import client from '../../api/client';

const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ы:'y',э:'e',ю:'yu',я:'ya',ь:'',ъ:'' };
const toSlug = s => String(s || '').toLowerCase().trim().split('').map(ch => TRANSLIT[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 78);
const byOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name);

function nestedRows(categories, parentId = null, level = 0, excludedId = '') {
  return categories
    .filter(cat => (cat.parent_id || null) === parentId && cat.id !== excludedId)
    .sort(byOrder)
    .flatMap(cat => [{ cat, level }, ...nestedRows(categories, cat.id, level + 1, excludedId)]);
}

function descendantsOf(categories, id, level = 1) {
  return categories
    .filter(cat => cat.parent_id === id)
    .sort(byOrder)
    .flatMap(cat => [{ cat, level }, ...descendantsOf(categories, cat.id, level + 1)]);
}

function CategoryAvatar({ cat, size = 42 }) {
  const img = cat?.display_image_url || cat?.image_url || cat?.parent_image_url || '';
  const letter = String(cat?.name || '?').trim().slice(0, 1).toUpperCase();
  return (
    <span style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: C.media, border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: Math.max(14, size * 0.42), fontWeight: 900, color: C.t2 }}>{letter}</span>}
    </span>
  );
}

function CategoryForm({ initial, parent, categories, categoryType, onSave, onCancel }) {
  const ref = useRef();
  const toast = useToast();
  const [name, setName] = useState(initial?.name || '');
  const [slug, setSlug] = useState(initial?.slug || '');
  const [image, setImage] = useState(initial?.image_url || null);
  const [description, setDescription] = useState(initial?.description || '');
  const [active, setActive] = useState(initial?.is_active !== false);
  const [parentId, setParentId] = useState(initial?.parent_id || parent?.id || '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order || 0);
  const [autoSlug, setAutoSlug] = useState(!initial?.id);
  const [imgFile, setImgFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const inheritedImage = !image ? (parent?.display_image_url || parent?.image_url || parent?.parent_image_url || '') : '';

  function onName(v) { setName(v); if (autoSlug) setSlug(toSlug(v)); }
  function pickImg(file) {
    if (!file) return;
    setImgFile(file);
    const reader = new FileReader();
    reader.onload = e => setImage(e.target.result);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) return toast.warn('Заполните название и slug');
    setSaving(true);
    try {
      let imageUrl = image && !String(image).startsWith('data:') ? image : '';
      if (imgFile) {
        const fd = new FormData();
        fd.append('image', imgFile);
        const r = await client.post('/admin/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        imageUrl = r.data.url;
      }
      const data = { category_type: categoryType, name: name.trim(), slug: slug.trim(), image_url: imageUrl, description, is_active: active, parent_id: parentId || null, sort_order: Number(sortOrder || 0) };
      if (initial?.id) await updateCategory(initial.id, data);
      else await createCategory(data);
      toast.success(initial?.id ? 'Категория обновлена' : 'Категория создана');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>Изображение категории</div>
          <button type="button" onClick={() => ref.current.click()} style={{ width: 82, height: 82, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: `2px dashed ${image ? C.accent : C.border}`, background: C.field, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {image ? <img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : inheritedImage ? <img src={inheritedImage} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity:.78 }} alt="" /> : <span style={{ fontSize: 22, fontWeight: 900, color: C.t2 }}>{String(name || '?').trim().slice(0, 1).toUpperCase()}</span>}
          </button>
          <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pickImg(e.target.files?.[0])} />
          {image && <button type="button" onClick={() => { setImage(null); setImgFile(null); }} style={{ background: 'transparent', border: 'none', color: C.red, fontSize: 11, cursor: 'pointer', marginTop: 6 }}>Убрать</button>}
        </div>
        <div style={{ flex: 1, color:C.t2, fontSize:12, lineHeight:1.55, paddingTop:28 }}>Загрузите квадратную иконку или обложку. Если для подкатегории изображение не выбрано, в каталоге используется изображение родительской категории.</div>
      </div>
      <Input label="Название *" value={name} onChange={e => onName(e.target.value)} placeholder="Сайты" />
      <Input label="Slug *" value={slug} onChange={e => { setAutoSlug(false); setSlug(e.target.value); }} helper={`/catalog?kind=${categoryType === 'service' ? 'services' : 'products'}&category=${slug || '...'}`} style={{ fontFamily: 'monospace' }} />
      <Select label="Родительская категория" value={parentId} onChange={e => setParentId(e.target.value)}>
        <option value="">Нет, это основная категория</option>
        {nestedRows(categories, null, 0, initial?.id).map(({ cat, level }) => <option key={cat.id} value={cat.id}>{`${'  '.repeat(level)}${level ? '- ' : ''}${cat.name}`}</option>)}
      </Select>
      <Input label="Порядок сортировки" type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
      <Textarea label="Описание" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
        <div><div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Активна</div><div style={{ fontSize: 12, color: C.t2 }}>Показывать в каталоге</div></div>
        <Toggle value={active} onChange={setActive} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Btn variant="ghost" onClick={onCancel}>Отмена</Btn>
        <Btn loading={saving} onClick={handleSave}>{initial?.id ? 'Сохранить' : 'Создать'}</Btn>
      </div>
    </div>
  );
}

export default function CategoriesPage({ type = 'product' }) {
  const toast = useToast();
  const isService = type === 'service';
  const labels = isService
    ? { title: 'Категории услуг', hint: 'Отдельный каталог для услуг фрилансеров. Товарные категории здесь не показываются.', root: 'Основные категории услуг', addRoot: '+ Категория услуг', empty: 'Категорий услуг пока нет', products: 'Услуг' }
    : { title: 'Категории товаров', hint: 'Товарный каталог продавцов. Категории услуг находятся в отдельном разделе.', root: 'Основные категории товаров', addRoot: '+ Основная категория', empty: 'Категорий пока нет', products: 'Товаров' };
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [deleteCat, setDeleteCat] = useState(null);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [checkedRootIds, setCheckedRootIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const roots = cats.filter(c => !c.parent_id).sort(byOrder);
  const selected = roots.find(c => c.id === selectedId) || roots[0];
  const descendants = selected ? descendantsOf(cats, selected.id) : [];

  function load() {
    setLoading(true);
    getCategories({ type }).then(r => {
      const list = r.data || [];
      setCats(list);
      const roots = list.filter(c => !c.parent_id);
      if (!roots.some(c => c.id === selectedId)) setSelectedId(roots[0]?.id || '');
      setCheckedRootIds(previous => previous.filter(id => roots.some(root => root.id === id)));
    }).catch(() => toast.error('Ошибка загрузки категорий')).finally(() => setLoading(false));
  }
  useEffect(load, [type]);

  async function toggle(cat, is_active) {
    await updateCategory(cat.id, { is_active }).catch(() => toast.error('Ошибка'));
    load();
  }
  async function remove(cat) {
    try { await deleteCategory(cat.id); toast.success('Категория скрыта'); setDeleteCat(null); load(); }
    catch { toast.error('Ошибка'); }
  }

  function openCreate(parent = null) { setEditCat(parent ? { parent_id: parent.id } : null); setModal('create'); }
  function openEdit(cat) { setEditCat(cat); setModal('edit'); }
  function toggleRootChecked(id) {
    setCheckedRootIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  function selectEmptyRoots() {
    setCheckedRootIds(roots.filter(root => Number(root.subtree_product_count || root.product_count || 0) === 0).map(root => root.id));
  }
  async function removeSelectedRoots() {
    setBulkDeleting(true);
    try {
      const { data } = await bulkDeleteCategories(checkedRootIds);
      const blocked = data.blocked || [];
      if (data.deleted) toast.success(`Удалено категорий: ${data.deleted}`);
      if (blocked.length) toast.warn(`Не удалены ветки с товарами: ${blocked.map(item => item.name).join(', ')}`);
      if (!data.deleted && !blocked.length) toast.warn('Категории для удаления не найдены');
      setCheckedRootIds([]);
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось удалить категории');
    } finally {
      setBulkDeleting(false);
    }
  }
  async function importCatalog() {
    if (!importText.trim()) return toast.warn('Вставьте список категорий');
    setImporting(true);
    try {
      const { data } = await bulkImportCategories({ type, text: importText });
      toast.success(`Импортировано: ${data.createdNodes} новых разделов (${data.parsed} корневых)`);
      setImportText('');
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  }

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 };

  return (
    <AdminLayout>
      <div style={{ padding: 'clamp(16px, 4vw, 28px)' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>{labels.title}</h1>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{labels.hint}</div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {checkedRootIds.length > 0 && <Btn variant="danger" onClick={() => setModal('bulkDelete')}>Удалить выбранные ({checkedRootIds.length})</Btn>}
            <Btn variant="ghost" onClick={() => setModal('import')}>Импорт списком</Btn>
            <Btn onClick={() => openCreate(null)}>{labels.addRoot}</Btn>
          </div>
        </div>

        {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320 }}><Spinner size={36} /></div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 390px) 1fr', gap: 16 }}>
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap:8 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.t1 }}>{labels.root}</div>
                <button type="button" onClick={selectEmptyRoots} style={{ background:'transparent', border:'none', color:C.accent, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700 }}>Выбрать пустые</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {roots.map(cat => {
                  const active = selected?.id === cat.id;
                  const count = descendantsOf(cats, cat.id).length;
                  return (
                    <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ display: 'grid', gridTemplateColumns: '18px 46px 1fr auto', gap: 10, alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${C.border}`, background: active ? C.accent + '18' : 'transparent', color: C.t1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <input type="checkbox" checked={checkedRootIds.includes(cat.id)} onClick={event => event.stopPropagation()} onChange={() => toggleRootChecked(cat.id)} aria-label={`Выбрать ${cat.name} для удаления`} style={{ accentColor:C.accent, cursor:'pointer' }} />
                      <CategoryAvatar cat={cat} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{cat.slug} · {count} вложенных</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: cat.is_active ? C.green + '22' : C.t3 + '22', color: cat.is_active ? C.green : C.t3 }}>{cat.is_active ? 'ON' : 'OFF'}</span>
                    </div>
                  );
                })}
                {roots.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.t3 }}>{labels.empty}</div>}
              </div>
            </div>

            <div style={{ ...card, overflow: 'hidden' }}>
              {selected ? <>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CategoryAvatar cat={selected} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: C.t1 }}>{selected.name}</div>
                      <div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace' }}>/{selected.slug}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Btn size="sm" variant="ghost" onClick={() => openEdit(selected)}>Редактировать</Btn>
                    <Btn size="sm" onClick={() => openCreate(selected)}>+ Вложенный раздел</Btn>
                  </div>
                </div>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontSize: 18, fontWeight: 900, color: C.accent }}>{descendants.length}</div><div style={{ fontSize: 11, color: C.t3 }}>Вложенных разделов</div></div>
                  <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontSize: 18, fontWeight: 900, color: C.accent }}>{Number(selected.subtree_product_count || selected.product_count || 0).toLocaleString('ru')}</div><div style={{ fontSize: 11, color: C.t3 }}>{labels.products}</div></div>
                  <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontSize: 18, fontWeight: 900, color: selected.is_active ? C.green : C.t3 }}>{selected.is_active ? 'Активна' : 'Скрыта'}</div><div style={{ fontSize: 11, color: C.t3 }}>Статус</div></div>
                </div>
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                  {descendants.map(({ cat, level }) => <div key={cat.id} style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginLeft: Math.min(level - 1, 2) * 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <input type="checkbox" checked={checkedRootIds.includes(cat.id)} onChange={() => toggleRootChecked(cat.id)} aria-label={`Выбрать ${cat.name} для удаления`} style={{ accentColor:C.accent, cursor:'pointer' }} />
                      <CategoryAvatar cat={cat} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</div>
                        <div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace' }}>Уровень {level + 1} · /{cat.slug}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: C.t2 }}>{Number(cat.product_count || 0).toLocaleString('ru')} {isService ? 'услуг' : 'товаров'}</div>
                      <Toggle value={cat.is_active} onChange={v => toggle(cat, v)} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn size="sm" variant="ghost" onClick={() => openCreate(cat)}>+ Вложить</Btn>
                      <Btn size="sm" full variant="ghost" onClick={() => openEdit(cat)}>Редактировать</Btn>
                      <Btn size="sm" variant="danger" onClick={() => setDeleteCat(cat)}>×</Btn>
                    </div>
                  </div>)}
                  {descendants.length === 0 && <div style={{ gridColumn: '1/-1', padding: 42, textAlign: 'center', color: C.t3 }}>У этой категории пока нет вложенных разделов</div>}
                </div>
              </> : <div style={{ padding: 50, textAlign: 'center', color: C.t3 }}>Выберите категорию слева</div>}
            </div>
          </div>}
      </div>

      {(modal === 'create' || modal === 'edit') && <Modal title={modal === 'edit' ? 'Редактировать категорию' : (editCat?.parent_id ? 'Новая подкатегория' : 'Новая категория')} onClose={() => setModal(null)}>
        <CategoryForm initial={editCat?.id ? editCat : null} parent={editCat?.parent_id ? cats.find(c => c.id === editCat.parent_id) : null} categories={cats} categoryType={type} onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
      </Modal>}

      {modal === 'import' && <Modal title={`Импорт: ${labels.root}`} onClose={() => setModal(null)} width={700}>
        <div style={{ display:'grid', gap:14 }}>
          <p style={{ color:C.t2, fontSize:13, lineHeight:1.6, margin:0 }}>Для новой витрины используйте дерево: каждый уровень задаётся двумя пробелами. Повторный импорт обновляет порядок и не создаёт дубликаты. Готовые файлы лежат в <b>docs/catalog-products.txt</b> и <b>docs/catalog-services.txt</b>.</p>
          <Textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={14} placeholder={'Игры\n  Шутеры\n    Counter-Strike 2\n      Аккаунты\n      Ключи\n      Скины\nAI и нейросети\n  AI подписки\n    ChatGPT\n      Подписка'} />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}><Btn variant="ghost" onClick={()=>setModal(null)}>Отмена</Btn><Btn loading={importing} onClick={importCatalog}>Импортировать</Btn></div>
        </div>
      </Modal>}

      {modal === 'bulkDelete' && <Modal title="Удалить выбранные категории?" onClose={() => setModal(null)} width={470}>
        <div style={{ display:'grid', gap:16 }}>
          <p style={{ fontSize:13, color:C.t2, lineHeight:1.65, margin:0 }}>Будут навсегда удалены выбранные пустые ветки вместе со всеми вложенными категориями. Ветки, где есть товары или услуги, система оставит без изменений.</p>
          <div style={{ background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 14px', color:C.t1, fontSize:13, fontWeight:700 }}>Выбрано веток: {checkedRootIds.length}</div>
          <div style={{ display:'flex', gap:10 }}>
            <Btn full variant="ghost" onClick={() => setModal(null)}>Отмена</Btn>
            <Btn full variant="danger" loading={bulkDeleting} onClick={removeSelectedRoots}>Удалить навсегда</Btn>
          </div>
        </div>
      </Modal>}

      {deleteCat && <Modal title="Скрыть категорию?" onClose={() => setDeleteCat(null)} width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><CategoryAvatar cat={deleteCat} size={64} /></div>
          <p style={{ fontSize: 13, color: C.t2 }}>«{deleteCat.name}» будет скрыта из каталога. Связанные товары останутся.</p>
          <div style={{ display: 'flex', gap: 10 }}><Btn full variant="ghost" onClick={() => setDeleteCat(null)}>Отмена</Btn><Btn full variant="danger" onClick={() => remove(deleteCat)}>Скрыть</Btn></div>
        </div>
      </Modal>}
    </AdminLayout>
  );
}
