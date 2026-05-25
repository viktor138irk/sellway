import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrders } from '../../api/orders';
import { C, Spinner, StatusBadge, Btn } from '../../components/UI';
import SellerMeta from '../../components/SellerMeta';
import useMediaQuery from '../../hooks/useMediaQuery';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

export default function PurchasesPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const isMobile = useMediaQuery('(max-width: 760px)');

  useEffect(() => {
    setLoading(true);
    getOrders({ role: 'buyer', status, limit: 50 })
      .then(r => setOrders(r.data.orders || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: isMobile ? '16px 12px' : '28px 20px' }} className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.t1 }}>Покупки</h1>
          <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>Ваши заказы, ключи, файлы и услуги</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <Link to="/profile/favorites"><Btn size="sm" variant="ghost">Избранное</Btn></Link>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="">Все покупки</option>
            <option value="paid">Оплаченные</option>
            <option value="delivered">Переданные</option>
            <option value="confirmed">Завершённые</option>
            <option value="disputed">Споры</option>
            <option value="cancelled">Отменённые</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div>
      ) : orders.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: isMobile ? 34 : 60, textAlign: 'center', color: C.t3 }}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:C.infoBg, border:`1px solid ${C.border}`, margin:'0 auto 14px' }} />
          <div style={{ color: C.t2, fontSize: 14, marginBottom: 16 }}>Покупок пока нет</div>
          <Link to="/catalog?kind=products"><Btn size="sm">Открыть каталог</Btn></Link>
        </div>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {orders.map(o => <Link key={o.id} to={`/orders/${o.id}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, textDecoration: 'none', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.t1, lineHeight: 1.35 }}>{o.product_title}</div>
                <div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace', marginTop: 3 }}>{o.order_number}</div>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: C.t2 }}>
              <span>Продавец: {o.seller_name}</span>
              <b style={{ color: C.t1 }}>{money(o.amount)}</b>
            </div>
            <SellerMeta seller={o} compact />
          </Link>)}
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 100px 80px', gap: 12, padding: '10px 18px', background: C.field, borderBottom: `1px solid ${C.border}` }}>
            {['Позиция / заказ', 'Продавец', 'Сумма', 'Статус', ''].map(h => <div key={h} style={{ fontSize: 10, fontWeight: 800, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>)}
          </div>
          {orders.map(o => <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 100px 80px', gap: 12, padding: '14px 18px', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>{o.product_title}</div>
              <div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace', marginTop: 2 }}>{o.order_number}</div>
              <div style={{ fontSize: 10, color: C.t3 }}>{new Date(o.created_at).toLocaleString('ru')}</div>
            </div>
            <div style={{ fontSize: 13, color: C.t2 }}>{o.seller_name}<SellerMeta seller={o} compact /></div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>{money(o.amount)}</div>
            <StatusBadge status={o.status} />
            <Link to={`/orders/${o.id}`} style={{ fontSize: 11, color: C.accent, textDecoration: 'none', fontWeight: 700 }}>Открыть →</Link>
          </div>)}
        </div>
      )}
    </div>
  );
}
