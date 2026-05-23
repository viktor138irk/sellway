import { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Toggle, Select } from '../../components/UI';
import { getAdminReferrals, saveReferralSettings } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;
const pct = v => `${(Number(v || 0) * 100).toFixed(2)}%`;

function Tile({ label, value, sub, color = C.t1 }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
    <div style={{ fontSize:11, color:C.t3, fontWeight:800, textTransform:'uppercase', letterSpacing:.6, marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:23, fontWeight:900, color }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:C.t2, marginTop:5 }}>{sub}</div>}
  </div>;
}

export default function AdminReferralsPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    getAdminReferrals().then(r => { setData(r.data); setSettings(r.data.settings || {}); }).catch(() => toast.error('Ошибка загрузки рефералов')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function save() {
    setSaving(true);
    try { await saveReferralSettings(settings); toast.success('Настройки сохранены'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка сохранения'); }
    finally { setSaving(false); }
  }

  if (loading) return <AdminLayout><div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div></AdminLayout>;
  const summary = data?.summary || {};
  const top = data?.topReferrers || [];
  const invited = data?.invited || [];
  const payments = data?.recentPayments || [];

  return <AdminLayout><div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }} className="fade-in">
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:900, color:C.t1, marginBottom:5 }}>Настройка реферальной системы</h1>
        <div style={{ fontSize:13, color:C.t2 }}>Глобальные ставки, статистика, приглашённые продавцы/фрилансеры и выплаты.</div>
      </div>
      <Btn loading={saving} onClick={save}>Сохранить настройки</Btn>
    </div>

    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
      <div style={{ fontSize:15, fontWeight:900, color:C.t1, marginBottom:14 }}>Общие настройки</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14 }}>
        <div style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:12, padding:14, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <div><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>Реферальная система</div><div style={{ fontSize:11, color:C.t3, marginTop:3 }}>Включить регистрацию и выплаты</div></div>
          <Toggle value={settings.referral_enabled !== 'false'} onChange={v => setSettings(s => ({ ...s, referral_enabled:String(v) }))} />
        </div>
        <Input label="Ставка по умолчанию" type="number" min="0" max="0.5" step="0.0001" value={settings.default_referral_commission_rate || '0.0100'} helper="0.01 = 1%" onChange={e => setSettings(s => ({ ...s, default_referral_commission_rate:e.target.value }))} />
        <Input label="Максимальная ставка" type="number" min="0" max="0.5" step="0.0001" value={settings.max_referral_commission_rate || '0.0500'} helper="Защита от случайных 50%" onChange={e => setSettings(s => ({ ...s, max_referral_commission_rate:e.target.value }))} />
        <Select label="База расчёта" value={settings.referral_payout_basis || 'turnover'} onChange={e => setSettings(s => ({ ...s, referral_payout_basis:e.target.value }))}>
          <option value="turnover">От оборота сделки</option>
          <option value="platform_commission">От комиссии платформы</option>
        </Select>
      </div>
      <div style={{ marginTop:12, fontSize:12, color:C.t3, lineHeight:1.5 }}>Персональные ставки конкретным пользователям задаются в разделе “Пользователи” в карточке продавца/фрилансера. Эта страница управляет глобальными правилами и показывает всю статистику.</div>
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12 }}>
      <Tile label="Выплачено всего" value={money(summary.paid_total)} color={C.green} />
      <Tile label="Выплачено за 7 дней" value={money(summary.paid_week)} color={C.amber} />
      <Tile label="Сегодня" value={money(summary.paid_today)} />
      <Tile label="Выплат" value={summary.payments_count || 0} />
      <Tile label="Рефереров" value={summary.referrers_count || 0} />
      <Tile label="Приглашённых" value={summary.invited_count || 0} />
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(340px,.8fr)', gap:16 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, fontSize:15, fontWeight:900, color:C.t1 }}>Топ рефереров</div>
        {top.length === 0 ? <div style={{ padding:34, textAlign:'center', color:C.t3 }}>Рефереров пока нет</div> : top.map(u => <div key={u.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:12, alignItems:'center', padding:'13px 18px', borderBottom:`1px solid ${C.border}` }}>
          <div><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{u.username}</div><div style={{ fontSize:11, color:C.t3 }}>{u.email} · {u.role === 'freelancer' ? 'Фрилансер' : u.role === 'seller' ? 'Продавец' : u.role}</div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Код</div><div style={{ fontSize:12, color:C.accent, fontWeight:900 }}>{u.referral_code}</div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Приглашено</div><div style={{ fontSize:12, color:C.t1, fontWeight:900 }}>{u.referred_sellers_count || 0}</div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Выплачено</div><div style={{ fontSize:12, color:C.green, fontWeight:900 }}>{money(u.paid_total || u.referral_earnings)}</div></div>
        </div>)}
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, fontSize:15, fontWeight:900, color:C.t1 }}>Последние выплаты</div>
        {payments.length === 0 ? <div style={{ padding:30, textAlign:'center', color:C.t3, fontSize:13 }}>Выплат пока нет</div> : payments.map(p => <div key={p.id} style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}><div style={{ fontSize:13, color:C.green, fontWeight:900 }}>{money(p.amount)}</div><div style={{ fontSize:10, color:C.t3 }}>{new Date(p.created_at).toLocaleString('ru')}</div></div>
          <div style={{ fontSize:11, color:C.t2, marginTop:4 }}>{p.referrer_name} получил за {p.seller_name || 'автора'}</div>
          <div style={{ fontSize:10, color:C.t3, marginTop:2 }}>{p.product_title || p.order_number || p.description}</div>
        </div>)}
      </div>
    </div>

    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
      <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, fontSize:15, fontWeight:900, color:C.t1 }}>Приглашённые продавцы и фрилансеры</div>
      {invited.length === 0 ? <div style={{ padding:34, textAlign:'center', color:C.t3 }}>Приглашённых пока нет</div> : invited.map(u => <div key={u.user_id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto auto', gap:12, alignItems:'center', padding:'13px 18px', borderBottom:`1px solid ${C.border}` }}>
        <div><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{u.username}</div><div style={{ fontSize:11, color:C.t3 }}>{u.email} · {u.role === 'freelancer' ? 'Фрилансер' : 'Продавец'} · приглашён: {u.referrer_name || '—'}</div></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Ставка</div><div style={{ fontSize:12, color:C.t1, fontWeight:800 }}>{pct(u.referral_commission_rate)}</div></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Оборот</div><div style={{ fontSize:12, color:C.amber, fontWeight:800 }}>{money(u.turnover)}</div></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Заказы</div><div style={{ fontSize:12, color:C.t1, fontWeight:800 }}>{u.confirmed_orders}</div></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:10, color:C.t3 }}>Выплачено</div><div style={{ fontSize:12, color:C.green, fontWeight:900 }}>{money(u.referral_paid)}</div></div>
      </div>)}
    </div>
  </div></AdminLayout>;
}
