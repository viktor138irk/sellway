import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner, StatusBadge, Btn } from '../../components/UI';
import { getDashboard } from '../../api/seller';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

function StatCard({ icon, label, value, sub, color = C.accent }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}><span style={{ fontSize: 22 }}>{icon}</span>{sub && <span style={{ fontSize: 11, color: C.t3 }}>{sub}</span>}</div><div style={{ fontSize: 24, fontWeight: 900, color, marginBottom: 4 }}>{value}</div><div style={{ fontSize: 12, color: C.t2 }}>{label}</div></div>;
}
const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

function ReferralBlock({ referral, role }) {
  const toast = useToast();
  if (!referral?.code) return null;
  const target = role === 'freelancer' ? 'фрилансеров' : 'продавцов';
  const rate = Number(referral.referralRate || 0) * 100;
  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} скопирован`); }
    catch { toast.error('Не удалось скопировать'); }
  }
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 900, color: C.t1, marginBottom: 5 }}>Реферальная программа</div>
        <div style={{ fontSize: 12, color: C.t2 }}>Приглашайте {target} и получайте {rate.toFixed(2)}% с их оборота.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="sm" variant="ghost" onClick={() => copy(referral.code, 'Код')}>Копировать код</Btn>
        {referral.link && <Btn size="sm" onClick={() => copy(referral.link, 'Ссылка')}>Копировать ссылку</Btn>}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {[
        ['Код', referral.code, C.accent],
        ['Доход', money(referral.earnings), C.green],
        ['Приглашено', referral.referredCount || 0, C.t1],
        ['За 30 дней', referral.referred30d || 0, C.amber],
        ['Ставка', `${rate.toFixed(2)}%`, C.t1],
      ].map(([l, v, color]) => <div key={l} style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: 11 }}><div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{l}</div><div style={{ fontSize: 15, color, fontWeight: 900, wordBreak: 'break-all' }}>{v}</div></div>)}
    </div>
    {referral.link && <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.t2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{referral.link}</div>}
  </div>;
}

export default function SellerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const role = user?.role;
  const isFreelancer = role === 'freelancer';

  useEffect(() => { getDashboard().then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false)); }, []);

  if (loading) return <SellerLayout><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}><Spinner size={40} /></div></SellerLayout>;

  const { wallet, seller, referral, recentOrders = [], products = [] } = data || {};
  const nextPayout = wallet?.balance * 0.7;

  return <SellerLayout><div style={{ padding: 'clamp(16px,4vw,28px)', display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
    <div><h1 style={{ fontSize: 22, fontWeight: 900, color: C.t1, marginBottom: 4 }}>{isFreelancer ? 'Кабинет фрилансера' : 'Кабинет продавца'}</h1><p style={{ fontSize: 13, color: C.t2 }}>{new Date().toLocaleDateString('ru', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}><div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>Баланс аккаунта</div><div style={{ fontSize: 30, fontWeight: 900, color: C.t1, marginBottom: 16 }}>{money(wallet?.balance)}</div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Link to="/seller/withdrawal"><Btn size="sm">Вывести</Btn></Link><Link to="/seller/finances"><Btn size="sm" variant="ghost">История</Btn></Link></div></div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}><div style={{ fontSize: 12, color: C.t2 }}>Следующая выплата</div><span style={{ fontSize: 10, background: C.accent + '22', color: C.accent, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Еженедельно</span></div><div style={{ fontSize: 26, fontWeight: 900, color: C.t1, marginBottom: 14 }}>{money(nextPayout)}</div><div style={{ height: 6, background: '#1A1A28', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}><div style={{ width: '70%', height: '100%', background: C.accent, borderRadius: 3 }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.t2 }}><span>До выплаты: 3 дня</span><span style={{ color: C.accent }}>70%</span></div></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      <StatCard icon={isFreelancer ? '🧑‍💻' : '📦'} label={isFreelancer ? 'Услуг' : 'Товаров'} value={products.length} />
      <StatCard icon="🛒" label="Продаж всего" value={seller?.total_sales || 0} color={C.green} />
      <StatCard icon="⭐" label="Рейтинг" value={seller?.rating ? parseFloat(seller.rating).toFixed(1) : '—'} color={C.amber} />
      <StatCard icon="💰" label="Заморожено" value={money(wallet?.held)} color={C.t2} />
    </div>
    <ReferralBlock referral={referral} role={role} />
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>Последние заказы</span><Link to="/seller/orders" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>Все заказы</Link></div>{recentOrders.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}><div style={{ fontSize: 14, color: C.t2, marginBottom: 16 }}>Пока нет продаж</div><Link to="/seller/products/new"><Btn size="sm">{isFreelancer ? 'Добавить услугу' : 'Добавить товар'}</Btn></Link></div> : <div>{recentOrders.map(o => <Link key={o.id} to={`/orders/${o.id}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, textDecoration: 'none' }}><div><div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{o.product_title}</div><div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace', marginTop: 2 }}>{o.order_number}</div></div><StatusBadge status={o.status} /><div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{money(o.seller_amount)}</div></Link>)}</div>}</div>
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{isFreelancer ? 'Мои услуги' : 'Мои товары'}</span><Link to="/seller/products/new" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>+ Добавить</Link></div>{products.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>{isFreelancer ? 'Нет услуг' : 'Нет товаров'}</div> : <div style={{ display: 'flex', gap: 14, padding: '16px 20px', overflowX: 'auto' }}>{products.map(p => <Link key={p.id} to={`/seller/products/${p.id}`} style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, minWidth: 180, flexShrink: 0, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><span style={{ fontSize: 10, background: p.status === 'active' ? C.green + '22' : C.amber + '22', color: p.status === 'active' ? C.green : C.amber, padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{p.status === 'active' ? 'Активен' : p.status === 'pending' ? 'На проверке' : p.status}</span><span style={{ fontSize: 10, color: C.t3 }}>{p.delivery_type === 'service' ? 'услуга' : `${p.keys_count || 0} ключей`}</span></div><div style={{ fontSize: 13, fontWeight: 700, color: C.t1, lineHeight: 1.3 }}>{p.title}</div><div style={{ fontSize: 15, fontWeight: 900, color: C.accent }}>{p.delivery_type === 'service' ? 'от ' : ''}{money(p.price)}</div><div style={{ fontSize: 11, color: C.t3 }}>продано: {p.sales_count}</div></Link>)}</div>}</div>
  </div></SellerLayout>;
}
