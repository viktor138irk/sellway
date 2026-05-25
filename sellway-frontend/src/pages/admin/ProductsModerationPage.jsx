import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Modal, Input, Textarea } from '../../components/UI';
import { getPendingProducts, approveProduct, rejectProduct } from '../../api/admin';
import { updateProduct, deleteProduct, addKeys, getKeys, deleteKey, getCategories } from '../../api/products';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import SellerMeta from '../../components/SellerMeta';

const STATUS_STYLE = {
  pending: { bg: C.amber + '22', color: C.amber, label: 'На проверке' },
  active: { bg: C.green + '22', color: C.green, label: 'Активен' },
  rejected: { bg: C.red + '22', color: C.red, label: 'Отклонен' },
  archived: { bg: C.t3 + '22', color: C.t3, label: 'Архив' },
};
const DELIVERY = {
  auto: ['Ключи', 'Автовыдача ключей'],
  file: ['Файл', 'Автовыдача файла'],
  manual: ['Ручная', 'Ручная выдача'],
  service: ['Услуга', 'Услуга / этапы'],
};

function money(v) { return Number(v || 0).toLocaleString('ru') + ' ₽'; }
function isService(p) { return p.delivery_type === 'service'; }
function flatCategoryOptions(categories) {
  const byParent = new Map();
  categories.forEach(category => {
    const parent = category.parent_id || '';
    byParent.set(parent, [...(byParent.get(parent) || []), category]);
  });
  const result = [];
  function walk(parentId = '', depth = 0) {
    (byParent.get(parentId) || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)).forEach(category => {
      result.push({ ...category, depth });
      walk(category.id, depth + 1);
    });
  }
  walk();
  return result;
}
function CategoryIcon({ product, size = 20 }) {
  return <span style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', background: C.media, border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {product.category_image_url ? <img src={product.category_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: Math.max(10, size * .45), fontWeight: 900, color: C.t2 }}>{String(product.category_name || '?').trim().slice(0, 1).toUpperCase()}</span>}
  </span>;
}

function ProductDetail({ product, onClose, onAction, onChanged, canManage, startEditing = false }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState('');
  const [editing, setEditing] = useState(startEditing);
  const [keys, setKeys] = useState([]);
  const [keysText, setKeysText] = useState('');
  const [categories, setCategories] = useState([]);
  const [draft, setDraft] = useState({
    title: product.title || '', short_desc: product.short_desc || '', description: product.description || '',
    price: product.price || '', old_price: product.old_price || '', guarantee_days: product.guarantee_days || 0,
    auto_delivery_message: product.meta?.auto_delivery_message || '', category_id: product.category_id || '',
  });
  const images = product.images?.filter(Boolean) || (product.main_image ? [product.main_image] : []);
  const [, deliveryLabel] = DELIVERY[product.delivery_type] || ['Товар', product.delivery_type || '—'];
  const steps = product.meta?.service_steps || [];

  useEffect(() => {
    if (canManage && product.delivery_type === 'auto') getKeys(product.id).then(r => setKeys(r.data || [])).catch(() => {});
  }, [canManage, product.id, product.delivery_type]);

  useEffect(() => {
    if (!canManage) return;
    getCategories({ type: isService(product) ? 'service' : 'product' })
      .then(response => setCategories(flatCategoryOptions(response.data || [])))
      .catch(() => setCategories([]));
  }, [canManage, product.delivery_type]);

  async function handleApprove() { setLoading('approve'); await onAction('approve', product.id); setLoading(''); onClose(); }
  async function handleReject() { if (!reason.trim()) return; setLoading('reject'); await onAction('reject', product.id, reason); setLoading(''); onClose(); }
  async function saveEdit() {
    setLoading('save');
    try {
      const { data } = await updateProduct(product.id, {
        ...draft,
        price: Number(draft.price),
        old_price: draft.old_price ? Number(draft.old_price) : null,
        category_id: draft.category_id,
        delivery_type: product.delivery_type,
        tags: product.tags || [],
        service_steps: steps,
      });
      toast.success('Позиция обновлена без снятия с публикации');
      setEditing(false);
      const category = categories.find(item => item.id === draft.category_id);
      onChanged({ ...data, category_name: category?.name || data.category_name || 'Без категории' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось изменить позицию');
    } finally {
      setLoading('');
    }
  }
  async function archiveItem() {
    if (!window.confirm('Скрыть позицию из каталога? Текущие сделки сохранятся.')) return;
    try {
      await deleteProduct(product.id);
      toast.success('Позиция перенесена в архив');
      onChanged(null);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось архивировать позицию');
    }
  }
  async function addInventory() {
    const values = keysText.split('\n').map(key => key.trim()).filter(Boolean);
    if (!values.length) return;
    setLoading('keys');
    try {
      await addKeys(product.id, values);
      const { data } = await getKeys(product.id);
      setKeys(data || []);
      setKeysText('');
      toast.success('Ключи добавлены в остаток');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось добавить ключи');
    } finally { setLoading(''); }
  }
  async function removeKey(id) {
    try {
      await deleteKey(product.id, id);
      setKeys(current => current.filter(key => key.id !== id));
      toast.success('Ключ удален');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Проданный ключ удалить нельзя');
    }
  }

  return (
    <Modal title={startEditing ? (isService(product) ? 'Редактировать услугу' : 'Редактировать товар') : (isService(product) ? 'Модерация услуги' : 'Модерация товара')} onClose={onClose} width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {images.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
          {images.map((url, i) => <img key={i} src={url} alt="" style={{ width: '100%', aspectRatio: '1', borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.border}` }} />)}
        </div>}

        <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.t1 }}>{product.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t3, marginTop: 5 }}><CategoryIcon product={product} />{product.category_name || 'Без категории'} · {deliveryLabel}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.t1, whiteSpace: 'nowrap' }}>{isService(product) ? 'от ' : ''}{money(product.price)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {[
              [isService(product) ? 'Фрилансер' : 'Продавец', `${product.seller_name || '—'} (${product.seller_email || '—'})`],
              ['Создан', product.created_at ? new Date(product.created_at).toLocaleString('ru') : '—'],
              ['Гарантия', product.guarantee_days ? `${product.guarantee_days} дн.` : isService(product) ? 'по договоренности' : 'Нет'],
              ['Статус', STATUS_STYLE[product.status]?.label || product.status],
            ].map(([l, v]) => <div key={l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}><div style={{ color: C.t3, fontSize: 11, marginBottom: 3 }}>{l}</div><div style={{ color: C.t1, fontWeight: 700, fontSize: 12 }}>{v}</div></div>)}
          </div>
          <SellerMeta seller={product} />
        </div>

        {product.description && <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 8, fontWeight: 800 }}>ОПИСАНИЕ</div>
          <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxHeight: 170, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{product.description}</div>
        </div>}

        {isService(product) && <div style={{ background: C.infoBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 900, marginBottom: 8 }}>Услуга: цена от, финальная смета утверждается в сделке</div>
          {steps.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s, i) => <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b style={{ color: C.t1, fontSize: 13 }}>{s.title}</b><span style={{ color: C.t2, fontSize: 12 }}>{s.price ? money(s.price) : 'по смете'}</span></div>
              {s.description && <div style={{ color: C.t3, fontSize: 12, marginTop: 4 }}>{s.description}</div>}
            </div>)}
          </div> : <div style={{ color: C.t3, fontSize: 12 }}>Типовые этапы не указаны.</div>}
        </div>}

        {product.tags?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {product.tags.map(t => <span key={t} style={{ fontSize: 11, background: C.soft, color: C.t2, padding: '4px 10px', borderRadius: 8 }}>#{t}</span>)}
        </div>}

        {canManage && editing && <div style={{ background:C.infoBg, border:`1px solid ${C.border}`, borderRadius:8, padding:14, display:'grid', gap:12 }}>
          <div style={{ fontWeight:900, color:C.t1, fontSize:13 }}>Редактирование опубликованной позиции</div>
          <Input label="Название" value={draft.title} onChange={e => setDraft(d => ({ ...d, title:e.target.value }))} />
          <label style={{ display:'grid', gap:6 }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.t2 }}>Категория</span>
            <select value={draft.category_id} onChange={event => setDraft(d => ({ ...d, category_id:event.target.value }))} style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', color:C.t1, fontFamily:'inherit', fontSize:13 }}>
              <option value="">Без категории</option>
              {categories.map(category => <option key={category.id} value={category.id}>{`${'  '.repeat(category.depth)}${category.name}`}</option>)}
            </select>
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Цена (₽)" type="number" value={draft.price} onChange={e => setDraft(d => ({ ...d, price:e.target.value }))} />
            <Input label="Старая цена (₽)" type="number" value={draft.old_price} onChange={e => setDraft(d => ({ ...d, old_price:e.target.value }))} />
          </div>
          <Input label="Краткое описание" value={draft.short_desc} onChange={e => setDraft(d => ({ ...d, short_desc:e.target.value }))} />
          <Textarea label="Описание" rows={5} value={draft.description} onChange={e => setDraft(d => ({ ...d, description:e.target.value }))} />
          {product.delivery_type === 'auto' && <Textarea label="Инструкция покупателю после получения ключа" rows={3} value={draft.auto_delivery_message} onChange={e => setDraft(d => ({ ...d, auto_delivery_message:e.target.value }))} />}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}><Btn variant="ghost" onClick={() => setEditing(false)}>Отмена</Btn><Btn loading={loading === 'save'} onClick={saveEdit}>Сохранить</Btn></div>
        </div>}

        {canManage && product.delivery_type === 'auto' && <div style={{ background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:14 }}>
          <div style={{ fontSize:12, fontWeight:900, color:C.t1, marginBottom:10 }}>Остаток ключей: {keys.filter(key => !key.is_sold).length}</div>
          <Textarea rows={3} value={keysText} onChange={e => setKeysText(e.target.value)} placeholder="Новые ключи, по одному на строку" />
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}><Btn size="sm" variant="green" loading={loading === 'keys'} onClick={addInventory}>Добавить ключи</Btn></div>
          <div style={{ maxHeight:170, overflowY:'auto', display:'flex', flexDirection:'column', gap:6, marginTop:10 }}>
            {keys.filter(key => !key.is_sold).map(key => <div key={key.id} style={{ display:'flex', gap:8, alignItems:'center', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 9px' }}><code style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', color:C.t2, fontSize:11 }}>{key.key_value}</code><Btn size="sm" variant="danger" onClick={() => removeKey(key.id)}>Удалить</Btn></div>)}
          </div>
        </div>}

        {showReject && <div>
          <label style={{ fontSize: 12, fontWeight: 800, color: C.t2, display: 'block', marginBottom: 8 }}>Причина отклонения</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Напишите причину для автора..." style={{ width: '100%', background: C.field, border: `1px solid ${C.red}44`, borderRadius: 8, padding: '11px 13px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
        </div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn full variant="ghost" onClick={onClose}>Закрыть</Btn>
          {canManage && product.status !== 'archived' && <Btn full variant="ghost" onClick={() => setEditing(value => !value)}>{editing ? 'Скрыть редактор' : 'Редактировать'}</Btn>}
          {canManage && product.status === 'active' && <Btn full variant="danger" onClick={archiveItem}>Архивировать</Btn>}
          {!showReject ? <>
            {product.status === 'pending' && <><Btn full variant="danger" onClick={() => setShowReject(true)}>Отклонить</Btn>
            <Btn full variant="green" loading={loading === 'approve'} onClick={handleApprove}>Одобрить</Btn></>}
          </> : <>
            <Btn full variant="ghost" onClick={() => setShowReject(false)}>Назад</Btn>
            <Btn full variant="danger" loading={loading === 'reject'} disabled={!reason.trim()} onClick={handleReject}>Отклонить с причиной</Btn>
          </>}
        </div>
      </div>
    </Modal>
  );
}

function ModerationCard({ product, filter, onSelect, onAction, published }) {
  const st = STATUS_STYLE[product.status] || STATUS_STYLE.pending;
  const [, deliveryLabel] = DELIVERY[product.delivery_type] || ['Товар', product.delivery_type || '—'];
  const service = isService(product);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: published ? 106 : 156, background: C.media, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {product.main_image ? <img src={product.main_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily:'var(--sw-serif)', color:C.accent, fontSize: 42 }}>{String(product.title || '?').trim().slice(0, 1).toUpperCase()}</span>}
        <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 900, padding: '4px 9px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
        <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 900, padding: '4px 9px', borderRadius: 20, background: service ? C.accent + '22' : C.green + '22', color: service ? C.accent : C.green }}>{service ? 'УСЛУГА' : 'ТОВАР'}</span>
      </div>
      <div style={{ padding: published ? 10 : 14, display: 'flex', flexDirection: 'column', gap: published ? 7 : 10, flex: 1 }}>
        <div>
          <div style={{ fontSize: published ? 13 : 14, fontWeight: 900, color: C.t1, lineHeight: 1.35 }}>{product.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t3, marginTop: 5 }}><CategoryIcon product={product} />{product.seller_name || '—'} · {product.category_name || 'Без категории'}</div>
          {!published && <SellerMeta seller={product} compact />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 9 }}><div style={{ fontSize: 10, color: C.t3 }}>Цена</div><div style={{ fontSize: 14, fontWeight: 900, color: C.t1 }}>{service ? 'от ' : ''}{money(product.price)}</div></div>
          <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 9 }}><div style={{ fontSize: 10, color: C.t3 }}>Тип</div><div style={{ fontSize: 12, fontWeight: 800, color: C.t2 }}>{deliveryLabel}</div></div>
        </div>
        {!published && product.short_desc && <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.45, minHeight: 34 }}>{product.short_desc}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
          <Btn size="sm" full variant="ghost" onClick={() => onSelect(product)}>{published ? 'Редактировать' : 'Просмотр'}</Btn>
          {filter === 'pending' && <>
            <Btn size="sm" variant="danger" onClick={() => onSelect(product)}>Откл.</Btn>
            <Btn size="sm" variant="green" onClick={() => onAction('approve', product.id)}>ОК</Btn>
          </>}
        </div>
      </div>
    </div>
  );
}

export default function ProductsModerationPage({ view = 'moderation' }) {
  const toast = useToast();
  const { user } = useAuth();
  const published = view === 'published';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(published ? 'active' : 'pending');
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  function loadProducts() {
    setLoading(true);
    getPendingProducts({ status: filter, search: search.trim(), limit: 80 })
      .then(r => setProducts(r.data.products || []))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setFilter(published ? 'active' : 'pending');
  }, [published]);

  useEffect(() => {
    loadProducts();
  }, [filter, search]);

  async function handleAction(type, id, reason) {
    try {
      if (type === 'approve') await approveProduct(id);
      else await rejectProduct(id, reason);
      toast.success(type === 'approve' ? 'Одобрено' : 'Отклонено');
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  }

  function handleChanged(product) {
    if (!product) {
      loadProducts();
      return;
    }
    setProducts(current => current.map(item => item.id === product.id ? { ...item, ...product } : item));
    setSelected(current => current?.id === product.id ? { ...current, ...product } : current);
  }

  const visible = products.filter(p => kind === 'all' ? true : kind === 'services' ? p.delivery_type === 'service' : p.delivery_type !== 'service');
  const counts = { all: products.length, products: products.filter(p => p.delivery_type !== 'service').length, services: products.filter(p => p.delivery_type === 'service').length };

  return (
    <AdminLayout>
      <div style={{ padding: 'clamp(16px, 4vw, 28px)' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 650, color: C.t1 }}>{published ? 'Опубликованные товары и услуги' : 'Модерация товаров и услуг'}</h1>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{published ? 'Редактируйте действующие позиции, управляйте ключами или снимайте публикации.' : 'Проверяйте новые и повторно отправленные на модерацию позиции.'}</div>
          </div>
          {!published && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['pending', 'На проверке'], ['active', 'Активные'], ['rejected', 'Отклоненные']].map(([v, l]) => <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? C.accent : 'transparent', border: `1px solid ${filter === v ? 'transparent' : C.border}`, color: filter === v ? '#fff' : C.t2, borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
          </div>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[['all', `Все · ${counts.all}`], ['products', `Товары · ${counts.products}`], ['services', `Услуги · ${counts.services}`]].map(([v, l]) => <button key={v} onClick={() => setKind(v)} style={{ background: kind === v ? C.infoBg : 'transparent', border: `1px solid ${kind === v ? C.accent + '66' : C.border}`, color: kind === v ? C.t1 : C.t2, borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
          {published && <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск товара, услуги или продавца" style={{ flex:'1 1 280px', minWidth:200, background:C.card, border:`1px solid ${C.border}`, color:C.t1, borderRadius:8, padding:'8px 12px', fontSize:13, fontFamily:'inherit', outline:'none' }} />}
        </div>

        {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div>
        : visible.length === 0 ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 60, textAlign: 'center', color: C.t3 }}><div style={{ fontFamily:'var(--sw-serif)', color:C.accent, fontSize: 24, marginBottom: 12 }}>Catalog</div><div style={{ fontSize: 15, color: C.t2 }}>Нет позиций в этом фильтре</div></div>
        : published ? <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
            <div className="admin-published-head" style={{ display:'grid', gridTemplateColumns:'minmax(250px,1.55fr) minmax(170px,1fr) 150px 110px 118px', gap:12, padding:'10px 14px', background:C.field, borderBottom:`1px solid ${C.border}` }}>
              {['Позиция', 'Категория', 'Автор', 'Цена', ''].map(label => <div key={label} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase' }}>{label}</div>)}
            </div>
            {visible.map(product => <PublishedProductRow key={product.id} product={product} onSelect={setSelected} />)}
          </div>
        : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(290px, 1fr))', gap:14 }}>
            {visible.map(p => <ModerationCard key={p.id} product={p} filter={filter} onSelect={setSelected} onAction={handleAction} published={false} />)}
          </div>}
      </div>
      {selected && <ProductDetail product={selected} onClose={() => setSelected(null)} onAction={handleAction} onChanged={handleChanged} canManage={user?.role === 'admin'} startEditing={published} />}
    </AdminLayout>
  );
}

function PublishedProductRow({ product, onSelect }) {
  return <div className="admin-published-row" style={{ display:'grid', gridTemplateColumns:'minmax(250px,1.55fr) minmax(170px,1fr) 150px 110px 118px', gap:12, alignItems:'center', padding:'11px 14px', borderBottom:`1px solid ${C.border}`, minWidth:0 }}>
    <div style={{ display:'flex', gap:10, alignItems:'center', minWidth:0 }}>
      <div style={{ width:42, height:42, flexShrink:0, borderRadius:7, overflow:'hidden', background:C.media, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {product.main_image ? <img src={product.main_image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <CategoryIcon product={product} size={32} />}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{product.title}</div>
        <div style={{ fontSize:11, color:C.t3 }}>{isService(product) ? 'Услуга' : 'Товар'}</div>
      </div>
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0, fontSize:12, color:C.t2 }}><CategoryIcon product={product} size={25} /><span style={{ overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{product.category_name || 'Без категории'}</span></div>
    <div style={{ minWidth:0, fontSize:12, color:C.t2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{product.seller_name || '—'}</div>
    <div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{isService(product) ? 'от ' : ''}{money(product.price)}</div>
    <Btn size="sm" variant="ghost" onClick={() => onSelect(product)}>Редактировать</Btn>
  </div>;
}
