import { useEffect, useState } from 'react';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner, Btn } from '../../components/UI';
import { getReferrals } from '../../api/seller';
import { useToast } from '../../contexts/ToastContext';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;
const rate = v => `${(Number(v || 0) * 100).toFixed(2)}%`;

function Tile({ label, value, sub, color = C.t1 }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
    <div style={{ fontSize: 11, color: C.t3, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.t2, marginTop: 5 }}>{sub}</div>}
  </div>;
}

export default function ReferralsPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReferrals().then(r => setData(r.data)).catch(() => toast.error('Ошибка загрузки рефералов')).finally(() => setLoading(false));
  }, []);

  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text || ''); toast.success(`${label} скопирован`); }
    catch { toast.error('Не удалось скопировать'); }
  }

  if (loading) return <SellerLayout><div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400 }}><Spinner size={40}/></div></SellerLayout>;
  const referral = data?.referral || {};
  const summary = data?.summary || {};
  const referred = data?.referred || [];
  const payments = data?.payments || [];

  return <SellerLayout><div style={{ padding:'clamp(16px,4vw,28px)', display:'flex', flexDirection:'column', gap:22 }} className="fade-in">
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:900, color:C.t1, marginBottom:5 }}>Реферальная программа</h1>
        <div style={{ fontSize:13, color:C.t2 }}>Приглашайте продавцов и фрилансеров, получайте выплаты автоматически после подтверждения их сделок.</div>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <Btn variant="ghost" onClick={() => copy(referral.code, 'Код')}>Копировать код</Btn>
        <Btn onClick={() => copy(referral.link, 'Ссылка')}>Копировать ссылку</Btn>
      </div>
    </div>

    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        <div style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}><div style={{ fontSize:11, color:C.t3, marginBottom:5 }}>Ваш код</div><div style={{ fontSize:22, color:C.accent, fontWeight:900, wordBreak:'break-all' }}>{referral.code || '—'}</div></div>
        <div style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}><div style={{ fontSize:11, color:C.t3, marginBottom:5 }}>Ваша ссылка</div><div style={{ fontSize:12, color:C.t2, fontFamily:'monospace', wordBreak:'break-all' }}>{referral.link || '—'}</div></div>
        <div style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}><div style={{ fontSize:11, color:C.t3, marginBottom:5 }}>Ставка</div><div style={{ fontSize:22, color:C.t1, fontWeight:900 }}>{rate(referral.rate)}</div><div style={{ fontSize:11, color:C.t3, marginTop:4 }}>С оборота приглашённого автора</div></div>
      </div>
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12 }}>
      <Tile label="Доход всего" value={money(referral.earnings)} color={C.green} />
      <Tile label="Начислено по факту" value={money(summary.paidToYou)} color={C.green} sub="по подтверждённым сделкам" />
      <Tile label="Приглашено" value={summary.referredCount || 0} />
      <Tile label="Оборот рефералов" value={money(summary.turnover)} color={C.amber} />
      <Tile label="Заказов рефералов" value={summary.ordersCount || 0} />
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.2fr) minmax(320px,.8fr)', gap:16 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, fontSize:15, fontWeight:900, color:C.t1 }}>Приглашённые</div>
        {referred.length === 0 ? <div style={{ padding:36, textAlign:'center', color:C.t3 }}>Пока никто не зарегистрировался по вашей ссылке</div> : referred.map(r => <div key={r.user_id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:12, alignItems:'center', padding:'13px 18px', borderBottom:`1px solid ${C.border}` }}>
          <div><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{r.username}</div><div style={{ fontSize:11, color:C.t3 }}>{r.role === 'freelancer' ? 'Фрилансер' : 'Продавец'} · {new Date(r.created_at).toLocaleDateString('ru')}</div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:12, color:C.t3 }}>Оборот</div><div style={{ fontSize:13, color:C.t1, fontWeight:800 }}>{money(r.turnover)}</div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:12, color:C.t3 }}>Заказы</div><div style={{ fontSize:13, color:C.t1, fontWeight:800 }}>{r.orders_count}</div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:12, color:C.t3 }}>Выплачено</div><div style={{ fontSize:13, color:C.green, fontWeight:800 }}>{money(r.paid_to_you)}</div></div>
        </div>)}
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, fontSize:15, fontWeight:900, color:C.t1 }}>История выплат</div>
        {payments.length === 0 ? <div style={{ padding:30, textAlign:'center', color:C.t3, fontSize:13 }}>Выплат пока нет</div> : payments.map(p => <div key={p.id} style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}><div style={{ fontSize:13, color:C.t1, fontWeight:800 }}>{money(p.amount)}</div><div style={{ fontSize:10, color:C.t3 }}>{new Date(p.created_at).toLocaleDateString('ru')}</div></div>
          <div style={{ fontSize:11, color:C.t2, marginTop:4 }}>{p.product_title || p.order_number || p.description}</div>
          {p.seller_name && <div style={{ fontSize:10, color:C.t3, marginTop:2 }}>Автор: {p.seller_name}</div>}
        </div>)}
      </div>
    </div>
  </div></SellerLayout>;
}
