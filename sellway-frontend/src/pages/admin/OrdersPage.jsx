import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { C, Spinner, StatusBadge } from '../../components/UI';
import { getAdminOrders } from '../../api/admin';
import SellerMeta from '../../components/SellerMeta';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    getAdminOrders({ search, status, page, limit: 50 }).then(r=>setOrders(r.data.orders||[])).catch(console.error).finally(()=>setLoading(false));
  }, [search, status, page]);

  return (
    <AdminLayout>
      <div style={{ padding:'24px 28px' }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h1 style={{ fontSize:28, fontWeight:650, color:C.t1 }}>Все заказы</h1>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.t3, fontSize:13 }}>?</span>
              <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Номер заказа..."
                style={{ background:C.card, border:`1px solid ${C.border}`, color:C.t1, borderRadius:8, padding:'7px 10px 7px 30px', fontSize:12, outline:'none', fontFamily:'inherit', width:200 }} />
            </div>
            <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} style={{ background:C.card, border:`1px solid ${C.border}`, color:C.t1, borderRadius:8, padding:'7px 10px', fontSize:12, fontFamily:'inherit', cursor:'pointer' }}>
              <option value="">Все статусы</option>
              {['pending','paid','delivered','confirmed','disputed','cancelled','refunded'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        : <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 130px 130px 120px 90px 90px', gap:12, padding:'10px 18px', background:C.field, borderBottom:`1px solid ${C.border}` }}>
              {['Заказ / Товар','Покупатель','Продавец','Сумма','Статус',''].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase', letterSpacing:1 }}>{h}</div>)}
            </div>
            {orders.length===0 ? <div style={{ padding:40, textAlign:'center', color:C.t3 }}>Нет заказов</div>
            : orders.map(o=>(
              <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr 130px 130px 120px 90px 90px', gap:12, padding:'13px 18px', borderBottom:`1px solid ${C.border}`, alignItems:'center', transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background=C.cardHov} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div><div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{o.product_title?.slice(0,32)}</div><div style={{ fontSize:10, color:C.accent, fontFamily:'monospace', marginTop:2 }}>{o.order_number}</div><div style={{ fontSize:10, color:C.t3 }}>{new Date(o.created_at).toLocaleString('ru')}</div></div>
                <div style={{ fontSize:12, color:C.t2 }}>{o.buyer_name}</div>
                <div style={{ fontSize:12, color:C.t2 }}>{o.seller_name}<SellerMeta seller={o} compact /></div>
                <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{parseFloat(o.amount).toLocaleString('ru')} ₽</div>
                <StatusBadge status={o.status}/>
                <Link to={`/orders/${o.id}`} style={{ fontSize:11, color:C.accent, textDecoration:'none', fontWeight:700 }}>Открыть →</Link>
              </div>
            ))}
          </div>}
      </div>
    </AdminLayout>
  );
}
