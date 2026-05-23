import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Modal, Badge } from '../../components/UI';
import { getPendingProducts, approveProduct, rejectProduct } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const STATUS_STYLE = {
  pending:  { bg: C.amber + '22', color: C.amber,  label: '⏳ На проверке' },
  active:   { bg: C.green + '22', color: C.green,  label: '✅ Активен' },
  rejected: { bg: C.red + '22',   color: C.red,    label: '❌ Отклонён' },
  archived: { bg: C.t3 + '22',    color: C.t3,     label: '🗄 Архив' },
};

function ProductDetail({ product, onClose, onAction }) {
  const [reason, setReason]     = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading]   = useState('');

  async function handleApprove() {
    setLoading('approve');
    await onAction('approve', product.id);
    setLoading('');
    onClose();
  }

  async function handleReject() {
    if (!reason.trim()) return;
    setLoading('reject');
    await onAction('reject', product.id, reason);
    setLoading('');
    onClose();
  }

  const images = product.images?.filter(Boolean) || [];

  return (
    <Modal title="Модерация товара" onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Images */}
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {images.map((url, i) => (
              <img key={i} src={url} alt="" style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }} />
            ))}
          </div>
        )}

        {/* Main info */}
        <div style={{ background: '#0A0A12', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.t1, marginBottom: 8 }}>{product.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            {[
              ['Продавец', `${product.seller_name} (${product.seller_email})`],
              ['Категория', product.category_name || '—'],
              ['Цена', `${parseFloat(product.price).toLocaleString('ru')} ₽`],
              ['Тип выдачи', product.delivery_type === 'auto' ? '🔑 Авто-ключи' : product.delivery_type === 'file' ? '📎 Авто-файл' : '⏱ Ручная'],
              ['Гарантия', product.guarantee_days ? `${product.guarantee_days} дн.` : 'Нет'],
              ['Создан', new Date(product.created_at).toLocaleString('ru')],
            ].map(([l, v]) => (
              <div key={l}><div style={{ color: C.t3, marginBottom: 2 }}>{l}</div><div style={{ color: C.t1, fontWeight: 600 }}>{v}</div></div>
            ))}
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div style={{ background: '#0A0A12', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 6, fontWeight: 700 }}>ОПИСАНИЕ</div>
            <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}>{product.description}</div>
          </div>
        )}

        {/* Tags */}
        {product.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {product.tags.map(t => <span key={t} style={{ fontSize: 11, background: '#1A1A28', color: C.t2, padding: '3px 10px', borderRadius: 7 }}>{t}</span>)}
          </div>
        )}

        {/* Reject reason */}
        {showReject && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Причина отклонения</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Укажите причину для продавца..."
              style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.red}44`, borderRadius: 9, padding: '10px 13px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn full variant="ghost" onClick={onClose}>Закрыть</Btn>
          {!showReject
            ? <>
                <Btn full variant="danger" onClick={() => setShowReject(true)}>❌ Отклонить</Btn>
                <Btn full variant="green" loading={loading === 'approve'} onClick={handleApprove}>✅ Одобрить</Btn>
              </>
            : <>
                <Btn full variant="ghost" onClick={() => setShowReject(false)}>Назад</Btn>
                <Btn full variant="danger" loading={loading === 'reject'} disabled={!reason.trim()} onClick={handleReject}>Отклонить с причиной</Btn>
              </>}
        </div>
      </div>
    </Modal>
  );
}

export default function ProductsModerationPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('pending');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    getPendingProducts({ status: filter, limit: 50 })
      .then(r => setProducts(r.data.products || []))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleAction(type, id, reason) {
    try {
      if (type === 'approve') await approveProduct(id);
      else await rejectProduct(id, reason);
      toast.success(type === 'approve' ? 'Товар одобрен ✅' : 'Товар отклонён ❌');
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  }

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>📦 Модерация товаров</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['pending', 'На проверке'], ['active', 'Активные'], ['rejected', 'Отклонённые']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                style={{ background: filter === v ? C.accent : 'transparent', border: `1px solid ${filter === v ? 'transparent' : C.border}`,
                  color: filter === v ? '#fff' : C.t2, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div>
          : products.length === 0
            ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 60, textAlign: 'center', color: C.t3 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, color: C.t2 }}>Нет товаров в этом статусе</div>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {products.map(p => {
                  const st = STATUS_STYLE[p.status] || STATUS_STYLE.pending;
                  return (
                    <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', display: 'grid', gridTemplateColumns: '50px 1fr auto auto auto auto', gap: 14, alignItems: 'center', transition: 'border-color .15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '55'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                      <div style={{ width: 46, height: 46, borderRadius: 10, overflow: 'hidden', background: '#0A0A12', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {p.main_image ? <img src={p.main_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>📦</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 3 }}>{p.title}</div>
                        <div style={{ fontSize: 11, color: C.t2 }}>{p.seller_name} · {p.category_name}</div>
                        <div style={{ fontSize: 10, color: C.t3 }}>{new Date(p.created_at).toLocaleString('ru')}</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{parseFloat(p.price).toLocaleString('ru')} ₽</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                      {filter === 'pending' && (
                        <>
                          <Btn size="sm" variant="danger" onClick={() => { setSelected(p); }}>❌</Btn>
                          <Btn size="sm" variant="green" onClick={() => handleAction('approve', p.id)}>✅</Btn>
                        </>
                      )}
                      <button onClick={() => setSelected(p)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.t2, borderRadius: 7, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        🔍 Просмотр
                      </button>
                    </div>
                  );
                })}
              </div>}
      </div>

      {selected && <ProductDetail product={selected} onClose={() => setSelected(null)} onAction={handleAction} />}
    </AdminLayout>
  );
}
