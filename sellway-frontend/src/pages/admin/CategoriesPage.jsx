import { useState, useEffect, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Modal, Toggle, Select, Textarea } from '../../components/UI';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/products';
import { useToast } from '../../contexts/ToastContext';
import client from '../../api/client';

const EMOJIS = ['🎮','🧱','⛏️','💳','🏆','🌟','🔑','💎','👑','🛡️','⚡','🤖','👾','🕹️','💻','📦','🛒','💰','🎁','📱','🎵','🎬','🧑‍💻','🎨','🛠️','🚀'];
const toSlug = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

function CategoryAvatar({ cat, size = 42 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', background: '#0A0A14', border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {cat?.image_url ? <img src={cat.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: Math.max(18, size * 0.5) }}>{cat?.emoji || '📂'}</span>}
    </span>
  );
}

function CategoryForm({ initial, parent, categories, onSave, onCancel }) {
  const ref = useRef();
  const toast = useToast();
  const [name, setName] = useState(initial?.name || '');
  const [slug, setSlug] = useState(initial?.slug || '');
  const [emoji, setEmoji] = useState(initial?.emoji || parent?.emoji || '📂');
  const [image, setImage] = useState(initial?.image_url || null);
  const [description, setDescription] = useState(initial?.description || '');
  const [active, setActive] = useState(initial?.is_active !== false);
  const [parentId, setParentId] = useState(initial?.parent_id || parent?.id || '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order || 0);
  const [autoSlug, setAutoSlug] = useState(!initial?.id);
  const [imgFile, setImgFile] = useState(null);
  const [saving, setSaving] = useState(false);

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
      const data = { name: name.trim(), slug: slug.trim(), emoji, image_url: imageUrl, description, is_active: active, parent_id: parentId || null, sort_order: Number(sortOrder || 0) };
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
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>Иконка</div>
          <button type="button" onClick={() => ref.current.click()} style={{ width: 82, height: 82, borderRadius: 16, overflow: 'hidden', cursor: 'pointer', border: `2px dashed ${image ? C.accent : C.border}`, background: '#0A0A12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {image ? <img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 30 }}>{emoji}</span>}
          </button>
          <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pickImg(e.target.files?.[0])} />
          {image && <button type="button" onClick={() => { setImage(null); setImgFile(null); }} style={{ background: 'transparent', border: 'none', color: C.red, fontSize: 11, cursor: 'pointer', marginTop: 6 }}>Убрать</button>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>Эмодзи</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 108, overflowY: 'auto' }}>
            {EMOJIS.map(e => <button key={e} type="button" onClick={() => setEmoji(e)} style={{ width: 31, height: 31, borderRadius: 8, border: `1px solid ${emoji === e ? C.accent : C.border}`, background: emoji === e ? C.accent + '33' : '#0A0A12', cursor: 'pointer' }}>{e}</button>)}
          </div>
        </div>
      </div>
      <Input label="Название *" value={name} onChange={e => onName(e.target.value)} placeholder="Сайты" />
      <Input label="Slug *" value={slug} onChange={e => { setAutoSlug(false); setSlug(e.target.value); }} helper={`/catalog?category=${slug || '...'}`} style={{ fontFamily: 'monospace' }} />
      <Select label="Родительская категория" value={parentId} onChange={e => setParentId(e.target.value)}>
        <option value="">Нет, это основная категория</option>
        {categories.filter(c => !c.parent_id && c.id !== initial?.id).map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
      </Select>
      <Input label="Порядок сортировки" type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
      <Textarea label="Описание" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
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

export default function CategoriesPage() {
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [deleteCat, setDeleteCat] = useState(null);

  const roots = cats.filter(c => !c.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  const selected = roots.find(c => c.id === selectedId) || roots[0];
  const children = selected ? cats.filter(c => c.parent_id === selected.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)) : [];

  function load() {
    setLoading(true);
    getCategories().then(r => {
      const list = r.data || [];
      setCats(list);
      if (!selectedId && list.find(c => !c.parent_id)) setSelectedId(list.find(c => !c.parent_id).id);
    }).catch(() => toast.error('Ошибка загрузки категорий')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggle(cat, is_active) {
    await updateCategory(cat.id, { is_active }).catch(() => toast.error('Ошибка'));
    load();
  }
  async function remove(cat) {
    try { await deleteCategory(cat.id); toast.success('Категория скрыта'); setDeleteCat(null); load(); }
    catch { toast.error('Ошибка'); }
  }

  function openCreate(parent = null) { setEditCat(parent ? { parent_id: parent.id, emoji: parent.emoji } : null); setModal('create'); }
  function openEdit(cat) { setEditCat(cat); setModal('edit'); }

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 };

  return (
    <AdminLayout>
      <div style={{ padding: 'clamp(16px, 4vw, 28px)' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>📂 Категории и подкатегории</h1>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Слева основные разделы, справа подкатегории выбранного раздела.</div>
          </div>
          <Btn onClick={() => openCreate(null)}>+ Основная категория</Btn>
        </div>

        {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320 }}><Spinner size={36} /></div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 390px) 1fr', gap: 16 }}>
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.t1 }}>Основные категории</div>
                <span style={{ fontSize: 11, color: C.t3 }}>{roots.length} шт.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {roots.map(cat => {
                  const active = selected?.id === cat.id;
                  const count = cats.filter(c => c.parent_id === cat.id).length;
                  return (
                    <button key={cat.id} type="button" onClick={() => setSelectedId(cat.id)} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 10, alignItems: 'center', padding: '12px 14px', border: 'none', borderBottom: `1px solid ${C.border}`, background: active ? C.accent + '18' : 'transparent', color: C.t1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <CategoryAvatar cat={cat} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{cat.slug} · {count} подкат.</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: cat.is_active ? C.green + '22' : C.t3 + '22', color: cat.is_active ? C.green : C.t3 }}>{cat.is_active ? 'ON' : 'OFF'}</span>
                    </button>
                  );
                })}
                {roots.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.t3 }}>Категорий пока нет</div>}
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
                    <Btn size="sm" onClick={() => openCreate(selected)}>+ Подкатегория</Btn>
                  </div>
                </div>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}><div style={{ fontSize: 18, fontWeight: 900, color: C.accent }}>{children.length}</div><div style={{ fontSize: 11, color: C.t3 }}>Подкатегорий</div></div>
                  <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}><div style={{ fontSize: 18, fontWeight: 900, color: C.accent }}>{Number(selected.product_count || 0).toLocaleString('ru')}</div><div style={{ fontSize: 11, color: C.t3 }}>Товаров</div></div>
                  <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}><div style={{ fontSize: 18, fontWeight: 900, color: selected.is_active ? C.green : C.t3 }}>{selected.is_active ? 'Активна' : 'Скрыта'}</div><div style={{ fontSize: 11, color: C.t3 }}>Статус</div></div>
                </div>
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                  {children.map(cat => <div key={cat.id} style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <CategoryAvatar cat={cat} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</div>
                        <div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace' }}>/{cat.slug}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: C.t2 }}>{Number(cat.product_count || 0).toLocaleString('ru')} товаров</div>
                      <Toggle value={cat.is_active} onChange={v => toggle(cat, v)} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn size="sm" full variant="ghost" onClick={() => openEdit(cat)}>Редактировать</Btn>
                      <Btn size="sm" variant="danger" onClick={() => setDeleteCat(cat)}>×</Btn>
                    </div>
                  </div>)}
                  {children.length === 0 && <div style={{ gridColumn: '1/-1', padding: 42, textAlign: 'center', color: C.t3 }}>У этой категории пока нет подкатегорий</div>}
                </div>
              </> : <div style={{ padding: 50, textAlign: 'center', color: C.t3 }}>Выберите категорию слева</div>}
            </div>
          </div>}
      </div>

      {(modal === 'create' || modal === 'edit') && <Modal title={modal === 'edit' ? 'Редактировать категорию' : (editCat?.parent_id ? 'Новая подкатегория' : 'Новая категория')} onClose={() => setModal(null)}>
        <CategoryForm initial={editCat?.id ? editCat : null} parent={editCat?.parent_id && !editCat?.id ? cats.find(c => c.id === editCat.parent_id) : null} categories={cats} onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
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
