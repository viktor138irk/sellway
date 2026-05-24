import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Modal } from '../../components/UI';
import { getPendingProducts, approveProduct, rejectProduct } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

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
function CategoryIcon({ product, size = 20 }) {
  return <span style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', background: '#0A0A14', border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {product.category_image_url ? <img src={product.category_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: Math.max(12, size * .55) }}>{product.category_emoji || '📂'}</span>}
  </span>;
}

function ProductDetail({ product, onClose, onAction }) {
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState('');
  const images = product.images?.filter(Boolean) || (product.main_image ? [product.main_image] : []);
  const [, deliveryLabel] = DELIVERY[product.delivery_type] || ['Товар', product.delivery_type || '—'];
  const steps = product.meta?.service_steps || [];

  async function handleApprove() { setLoading('approve'); await onAction('approve', product.id); setLoading(''); onClose(); }
  async function handleReject() { if (!reason.trim()) return; setLoading('reject'); await onAction('reject', product.id, reason); setLoading(''); onClose(); }

  return (
    <Modal title={isService(product) ? 'Модерация услуги' : 'Модерация товара'} onClose={onClose} width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {images.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
          {images.map((url, i) => <img key={i} src={url} alt="" style={{ width: '100%', aspectRatio: '1', borderRadius: 12, objectFit: 'cover', border: `1px solid ${C.border}` }} />)}
        </div>}

        <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
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
            ].map(([l, v]) => <div key={l} style={{ background: '#111119', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}><div style={{ color: C.t3, fontSize: 11, marginBottom: 3 }}>{l}</div><div style={{ color: C.t1, fontWeight: 700, fontSize: 12 }}>{v}</div></div>)}
          </div>
        </div>

        {product.description && <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 8, fontWeight: 800 }}>ОПИСАНИЕ</div>
          <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxHeight: 170, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{product.description}</div>
        </div>}

        {isService(product) && <div style={{ background: '#10101F', border: `1px solid ${C.accent}33`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 900, marginBottom: 8 }}>Услуга: цена от, финальная смета утверждается в сделке</div>
          {steps.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s, i) => <div key={i} style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b style={{ color: C.t1, fontSize: 13 }}>{s.title}</b><span style={{ color: C.t2, fontSize: 12 }}>{s.price ? money(s.price) : 'по смете'}</span></div>
              {s.description && <div style={{ color: C.t3, fontSize: 12, marginTop: 4 }}>{s.description}</div>}
            </div>)}
          </div> : <div style={{ color: C.t3, fontSize: 12 }}>Типовые этапы не указаны.</div>}
        </div>}

        {product.tags?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {product.tags.map(t => <span key={t} style={{ fontSize: 11, background: '#1A1A28', color: C.t2, padding: '4px 10px', borderRadius: 8 }}>#{t}</span>)}
        </div>}

        {showReject && <div>
          <label style={{ fontSize: 12, fontWeight: 800, color: C.t2, display: 'block', marginBottom: 8 }}>Причина отклонения</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Напишите причину для автора..." style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.red}44`, borderRadius: 10, padding: '11px 13px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
        </div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn full variant="ghost" onClick={onClose}>Закрыть</Btn>
          {!showReject ? <>
            <Btn full variant="danger" onClick={() => setShowReject(true)}>Отклонить</Btn>
            <Btn full variant="green" loading={loading === 'approve'} onClick={handleApprove}>Одобрить</Btn>
          </> : <>
            <Btn full variant="ghost" onClick={() => setShowReject(false)}>Назад</Btn>
            <Btn full variant="danger" loading={loading === 'reject'} disabled={!reason.trim()} onClick={handleReject}>Отклонить с причиной</Btn>
          </>}
        </div>
      </div>
    </Modal>
  );
}

function ModerationCard({ product, filter, onSelect, onAction }) {
  const st = STATUS_STYLE[product.status] || STATUS_STYLE.pending;
  const [, deliveryLabel] = DELIVERY[product.delivery_type] || ['Товар', product.delivery_type || '—'];
  const service = isService(product);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 156, background: '#0A0A12', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {product.main_image ? <img src={product.main_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 46 }}>{service ? '🧑‍💻' : '📦'}</span>}
        <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 900, padding: '4px 9px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
        <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 900, padding: '4px 9px', borderRadius: 20, background: service ? C.accent + '22' : C.green + '22', color: service ? C.accent : C.green }}>{service ? 'УСЛУГА' : 'ТОВАР'}</span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.t1, lineHeight: 1.35 }}>{product.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t3, marginTop: 5 }}><CategoryIcon product={product} />{product.seller_name || '—'} · {product.category_name || 'Без категории'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: 9 }}><div style={{ fontSize: 10, color: C.t3 }}>Цена</div><div style={{ fontSize: 14, fontWeight: 900, color: C.t1 }}>{service ? 'от ' : ''}{money(product.price)}</div></div>
          <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: 9 }}><div style={{ fontSize: 10, color: C.t3 }}>Тип</div><div style={{ fontSize: 12, fontWeight: 800, color: C.t2 }}>{deliveryLabel}</div></div>
        </div>
        {product.short_desc && <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.45, minHeight: 34 }}>{product.short_desc}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
          <Btn size="sm" full variant="ghost" onClick={() => onSelect(product)}>Просмотр</Btn>
          {filter === 'pending' && <>
            <Btn size="sm" variant="danger" onClick={() => onSelect(product)}>Откл.</Btn>
            <Btn size="sm" variant="green" onClick={() => onAction('approve', product.id)}>ОК</Btn>
          </>}
        </div>
      </div>
    </div>
  );
}

export default function ProductsModerationPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    getPendingProducts({ status: filter, limit: 80 })
      .then(r => setProducts(r.data.products || []))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleAction(type, id, reason) {
    try {
      if (type === 'approve') await approveProduct(id);
      else await rejectProduct(id, reason);
      toast.success(type === 'approve' ? 'Одобрено' : 'Отклонено');
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  }

  const visible = products.filter(p => kind === 'all' ? true : kind === 'services' ? p.delivery_type === 'service' : p.delivery_type !== 'service');
  const counts = { all: products.length, products: products.filter(p => p.delivery_type !== 'service').length, services: products.filter(p => p.delivery_type === 'service').length };

  return (
    <AdminLayout>
      <div style={{ padding: 'clamp(16px, 4vw, 28px)' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>📦 Модерация товаров и услуг</h1>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Карточки с ключевыми данными, быстрым одобрением и детальным просмотром.</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['pending', 'На проверке'], ['active', 'Активные'], ['rejected', 'Отклоненные']].map(([v, l]) => <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? C.accent : 'transparent', border: `1px solid ${filter === v ? 'transparent' : C.border}`, color: filter === v ? '#fff' : C.t2, borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[['all', `Все · ${counts.all}`], ['products', `Товары · ${counts.products}`], ['services', `Услуги · ${counts.services}`]].map(([v, l]) => <button key={v} onClick={() => setKind(v)} style={{ background: kind === v ? '#1A1A28' : 'transparent', border: `1px solid ${kind === v ? C.accent + '66' : C.border}`, color: kind === v ? C.t1 : C.t2, borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
        </div>

        {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div>
        : visible.length === 0 ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 60, textAlign: 'center', color: C.t3 }}><div style={{ fontSize: 40, marginBottom: 12 }}>✅</div><div style={{ fontSize: 15, color: C.t2 }}>Нет позиций в этом фильтре</div></div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {visible.map(p => <ModerationCard key={p.id} product={p} filter={filter} onSelect={setSelected} onAction={handleAction} />)}
          </div>}
      </div>
      {selected && <ProductDetail product={selected} onClose={() => setSelected(null)} onAction={handleAction} />}
    </AdminLayout>
  );
}
