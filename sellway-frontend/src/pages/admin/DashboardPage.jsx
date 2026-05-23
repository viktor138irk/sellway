import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { C, Spinner, StatusBadge, Toggle } from '../../components/UI';
import { getStats, getAdminOrders, getLogs, getAdminSettings, saveSettings } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

function MiniChart({ data, color = C.accent, height = 52 }) {
  const values = data?.length ? data : [0];
  const max = Math.max(...values, 1);
  return <div style={{ display:'flex', gap:4, alignItems:'flex-end', height }}>{values.map((v,i)=><div key={i} style={{ flex:1, background:i===values.length-1?color:color+'55', height:`${Math.max(4,(v/max)*100)}%`, borderRadius:'4px 4px 0 0' }} />)}</div>;
}

function StatCard({ label, value, sub, trend = [], color = C.accent }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'16px 18px' }}>
    <div style={{ fontSize:11, color:C.t2, fontWeight:800, marginBottom:8 }}>{label}</div>
    <div style={{ fontSize:22, fontWeight:900, color, marginBottom:6 }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:C.t3, marginBottom:8 }}>{sub}</div>}
    {trend.length > 0 && <MiniChart data={trend} color={color} />}
  </div>;
}

function QuickSettings({ settings, onToggle }) {
  const items = [['autoissue','Авто-выдача ключей'],['notifications','Email-уведомления'],['moderation','Ручная модерация'],['twofa','2FA для админов'],['maintenance_mode','Режим обслуживания'],['new_seller_requires_verify','Верификация продавцов']];
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}><div style={{ fontSize:14, fontWeight:800, color:C.t1, marginBottom:16 }}>Быстрые настройки</div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:10 }}>{items.map(([key,label])=><div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0' }}><span style={{ fontSize:12, color:C.t2 }}>{label}</span><Toggle value={settings[key]==='true'} onChange={v=>onToggle(key,v)} /></div>)}</div></div>;
}

function QuickAction({ title, sub, to }) {
  return <Link to={to} style={{ textDecoration:'none', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'14px 16px', display:'flex', flexDirection:'column', gap:4 }}><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{title}</div><div style={{ fontSize:11, color:C.t2 }}>{sub}</div></Link>;
}

function valueToString(raw, fallback='') {
  let value = raw;
  let depth = 0;
  while (value && typeof value === 'object' && 'value' in value && depth < 5) { value = value.value; depth += 1; }
  if (value === undefined || value === null || typeof value === 'object') return String(fallback ?? '');
  return String(value);
}

export default function AdminDashboard() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), getAdminOrders({ limit:5, sort:'newest' }), getLogs({ limit:6 }), getAdminSettings()])
      .then(([s,o,l,set]) => {
        setStats(s.data);
        setOrders(o.data.orders || []);
        setLogs(l.data.logs || []);
        const flat = {};
        Object.entries(set.data || {}).forEach(([k,v]) => { flat[k] = valueToString(v); });
        setSettings(flat);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key, val) {
    const updated = { ...settings, [key]: String(val) };
    setSettings(updated);
    try { await saveSettings({ [key]: String(val) }); }
    catch { toast.error('Не удалось сохранить настройку'); setSettings(prev => ({ ...prev, [key]: String(!val) })); }
  }

  if (loading) return <AdminLayout><div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div></AdminLayout>;

  const s = stats || {};
  const rev = s.revenue || {};
  const profitTrend = (s.trend || []).map(x => Number(x.profit || 0));
  const commissionTrend = (s.trend || []).map(x => Number(x.commission || 0));
  const referralTrend = (s.trend || []).map(x => Number(x.referral || 0));

  return <AdminLayout><div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }} className="fade-in">
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <div><h1 style={{ fontSize:22, fontWeight:900, color:C.t1, marginBottom:2 }}>Дашборд администратора</h1><div style={{ fontSize:12, color:C.t2 }}>{new Date().toLocaleDateString('ru', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div></div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{Number(s.products?.pending || 0) > 0 && <Link to="/admin/products" style={{ background:C.amber+'20', border:`1px solid ${C.amber}44`, color:C.amber, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, textDecoration:'none' }}>{s.products.pending} на модерации</Link>}{Number(s.disputes?.open || 0) > 0 && <Link to="/admin/disputes" style={{ background:C.red+'20', border:`1px solid ${C.red}44`, color:C.red, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, textDecoration:'none' }}>{s.disputes.open} споров</Link>}</div>
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12 }}>
      <StatCard label="Чистая прибыль 7д" value={money(rev.profit_week)} sub="комиссия минус рефералка" trend={profitTrend} color={C.green} />
      <StatCard label="Комиссия платформы 7д" value={money(rev.commission_week)} sub="до вычета рефералов" trend={commissionTrend} color={C.accent} />
      <StatCard label="Реф. выплаты 7д" value={money(rev.referral_week)} sub="автоначисления партнёрам" trend={referralTrend} color={C.amber} />
      <StatCard label="Оборот 7д" value={money(rev.gross_week)} sub="подтверждённые сделки" />
      <StatCard label="Заказов всего" value={s.orders?.total || 0} sub={`сегодня: ${s.orders?.today || 0}`} />
      <StatCard label="Пользователей" value={s.users?.total || 0} sub={`продавцы: ${s.users?.sellers || 0}, фрилансеры: ${s.users?.freelancers || 0}`} />
      <StatCard label="Средняя выдача" value={`${s.avgDeliveryMin || 0} мин`} sub="за последние 7 дней" />
      <StatCard label="Онлайн сейчас" value={s.online || 0} sub="активны за 15 минут" color={C.green} />
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:12 }}>
      <QuickAction title="Модерация" sub={`${s.products?.pending || 0} ожидают`} to="/admin/products" />
      <QuickAction title="Споры" sub={`${s.disputes?.open || 0} открытых`} to="/admin/disputes" />
      <QuickAction title="Пользователи" sub="роли, комиссии, рефералы" to="/admin/users" />
      <QuickAction title="Категории" sub="управление каталогом" to="/admin/categories" />
    </div>

    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
      <div style={{ fontSize:15, fontWeight:900, color:C.t1, marginBottom:12 }}>Расчёт прибыли</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
        {[
          ['Вся комиссия', money(rev.commission_total), C.accent],
          ['Реферальные выплаты', `− ${money(rev.referral_total)}`, C.amber],
          ['Чистая прибыль', money(rev.profit_total), C.green],
          ['Сегодня чистыми', money(rev.profit_today), C.green],
        ].map(([l,v,color]) => <div key={l} style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}><div style={{ fontSize:11, color:C.t3 }}>{l}</div><div style={{ fontSize:18, color, fontWeight:900, marginTop:4 }}>{v}</div></div>)}
      </div>
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(300px,.7fr)', gap:16 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:`1px solid ${C.border}` }}><span style={{ fontSize:14, fontWeight:800, color:C.t1 }}>Последние заказы</span><Link to="/admin/orders" style={{ fontSize:12, color:C.accent, textDecoration:'none' }}>Все</Link></div>
        {orders.length === 0 ? <div style={{ padding:32, textAlign:'center', color:C.t3, fontSize:13 }}>Нет заказов</div> : orders.map(o => <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, padding:'12px 18px', borderBottom:`1px solid ${C.border}`, alignItems:'center' }}><div><div style={{ fontSize:12, fontWeight:700, color:C.t1 }}>{o.product_title?.slice(0,45)}</div><div style={{ fontSize:10, color:C.accent, fontFamily:'monospace', marginTop:2 }}>{o.order_number}</div><div style={{ fontSize:10, color:C.t3 }}>{o.buyer_name} → {o.seller_name}</div></div><StatusBadge status={o.status}/><div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{money(o.amount)}</div></div>)}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <QuickSettings settings={settings} onToggle={handleToggle} />
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}><div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:800, color:C.t1 }}>Системные логи</div>{logs.length === 0 ? <div style={{ padding:24, textAlign:'center', color:C.t3, fontSize:12 }}>Нет логов</div> : logs.map((l,i)=><div key={i} style={{ padding:'10px 18px', borderBottom:`1px solid ${C.border}`, fontSize:11 }}><div style={{ color:C.t2 }}>{l.action}</div><div style={{ color:C.t3, marginTop:3 }}>{new Date(l.created_at).toLocaleTimeString('ru')} {l.username ? `· ${l.username}` : ''}</div></div>)}</div>
      </div>
    </div>
  </div></AdminLayout>;
}
