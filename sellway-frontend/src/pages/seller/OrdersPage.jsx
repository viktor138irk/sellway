import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner, StatusBadge } from '../../components/UI';
import { getOrders } from '../../api/orders';

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    getOrders({ role:'seller', status, limit:50 })
      .then(r => setOrders(r.data.orders))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <SellerLayout>
      <div style={{ padding:'28px' }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h1 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>Заказы</h1>
          <select value={status} onChange={e=>setStatus(e.target.value)}
            style={{ background:C.card, border:`1px solid ${C.border}`, color:C.t1, borderRadius:8, padding:'7px 12px', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}>
            <option value="">Все заказы</option>
            <option value="paid">Ожидают передачи</option>
            <option value="delivered">Переданы</option>
            <option value="confirmed">Завершённые</option>
            <option value="disputed">Споры</option>
          </select>
        </div>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        : orders.length === 0 ? <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:60, textAlign:'center', color:C.t3 }}><div style={{ fontSize:36, marginBottom:12 }}>📭</div><div style={{ color:C.t2, fontSize:14 }}>Нет заказов</div></div>
        : <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 90px 80px', gap:12, padding:'10px 18px', background:'#0A0A12', borderBottom:`1px solid ${C.border}` }}>
              {['Товар / Заказ','Покупатель','Сумма','Статус',''].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase', letterSpacing:1 }}>{h}</div>)}
            </div>
            {orders.map(o=>(
              <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 90px 80px', gap:12, padding:'14px 18px', alignItems:'center', borderBottom:`1px solid ${C.border}`, transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background=C.cardHov} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{o.product_title}</div>
                  <div style={{ fontSize:11, color:C.t3, fontFamily:'monospace', marginTop:2 }}>{o.order_number}</div>
                  <div style={{ fontSize:10, color:C.t3 }}>{new Date(o.created_at).toLocaleString('ru')}</div>
                </div>
                <div style={{ fontSize:13, color:C.t2 }}>{o.buyer_name}</div>
                <div><div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{parseFloat(o.amount).toLocaleString('ru')} ₽</div><div style={{ fontSize:11, color:C.green }}>+{parseFloat(o.seller_amount).toLocaleString('ru')} ₽</div></div>
                <StatusBadge status={o.status}/>
                <Link to={`/orders/${o.id}`} style={{ fontSize:11, color:C.accent, textDecoration:'none', fontWeight:700 }}>Открыть →</Link>
              </div>
            ))}
          </div>}
      </div>
    </SellerLayout>
  );
}
