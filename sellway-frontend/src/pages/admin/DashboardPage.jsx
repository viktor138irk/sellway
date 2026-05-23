import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { C, Spinner, StatusBadge, Toggle, Badge } from '../../components/UI';
import { getStats, getAdminOrders, getLogs, getAdminSettings, saveSettings } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

/* ── Mini bar chart ──────────────────────────────── */
function MiniChart({ data, color = C.accent, height = 80 }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, background: i === data.length - 1 ? color : color + '50',
          height: `${(v / max) * 100}%`, minHeight: 2, borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
      ))}
    </div>
  );
}

/* ── Stat card ───────────────────────────────────── */
function StatCard({ icon, label, value, delta, trend = [] }) {
  const positive = parseFloat(delta) > 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{label}</div>
        {delta !== undefined && (
          <span style={{ fontSize: 10, color: positive ? C.green : C.red,
            background: (positive ? C.green : C.red) + '18', padding: '2px 7px', borderRadius: 20, fontWeight: 800 }}>
            {positive ? '+' : ''}{delta}
          </span>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.t1, marginBottom: 8 }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{value}
      </div>
      {trend.length > 0 && <MiniChart data={trend} height={36} />}
    </div>
  );
}

/* ── Online tracker ──────────────────────────────── */
function OnlineTracker({ data }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block', boxShadow: `0 0 6px ${C.green}` }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Онлайн сейчас</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 900, color: C.accent }}>{data[data.length - 1] || 0}</span>
      </div>
      <MiniChart data={data} height={70} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: C.t3 }}>
        <span>-24ч</span><span>Сейчас</span>
      </div>
    </div>
  );
}

/* ── Quick settings ──────────────────────────────── */
function QuickSettings({ settings, onToggle }) {
  const items = [
    ['autoissue',        'Авто-выдача ключей'],
    ['notifications',    'Email-уведомления'],
    ['moderation',       'Ручная модерация'],
    ['twofa',            '2FA для админов'],
    ['maintenance_mode', 'Режим обслуживания'],
    ['new_seller_requires_verify', 'Верификация продавцов'],
  ];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, marginBottom: 16 }}>⚡ Быстрые настройки</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {items.map(([key, label]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
            <Toggle value={settings[key] === 'true'} onChange={v => onToggle(key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Quick actions ───────────────────────────────── */
function QuickAction({ emoji, title, sub, to }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', transition: 'border-color .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '66'}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <span style={{ fontSize: 24, flexShrink: 0 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{title}</div>
        <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{sub}</div>
      </div>
    </Link>
  );
}

export default function AdminDashboard() {
  const toast = useToast();
  const [stats, setStats]         = useState(null);
  const [orders, setOrders]       = useState([]);
  const [logs, setLogs]           = useState([]);
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);

  // Симуляция онлайн-данных (в реальности — WebSocket / polling)
  const [onlineData] = useState(() => Array.from({ length: 24 }, () => Math.floor(Math.random() * 40 + 5)));
  const [revenueWeek] = useState(() => Array.from({ length: 7 }, () => Math.floor(Math.random() * 5000 + 500)));

  useEffect(() => {
    Promise.all([getStats(), getAdminOrders({ limit: 5, sort: 'newest' }), getLogs({ limit: 6 }), getAdminSettings()])
      .then(([s, o, l, set]) => {
        setStats(s.data);
        setOrders(o.data.orders || []);
        setLogs(l.data.logs || []);
        // Конвертируем объект настроек
        const raw = set.data;
        const flat = {};
        Object.entries(raw).forEach(([k, v]) => { flat[k] = typeof v === 'object' ? v.value : v; });
        setSettings(flat);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key, val) {
    const updated = { ...settings, [key]: String(val) };
    setSettings(updated);
    try {
      await saveSettings({ [key]: String(val) });
    } catch {
      toast.error('Не удалось сохранить настройку');
      setSettings(prev => ({ ...prev, [key]: String(!val) }));
    }
  }

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Spinner size={40} />
      </div>
    </AdminLayout>
  );

  const s = stats || {};

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: C.t1, marginBottom: 2 }}>
              Дашборд <span style={{ color: C.accent }}>Администратора</span>
            </h1>
            <div style={{ fontSize: 12, color: C.t2 }}>
              {new Date().toLocaleDateString('ru', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {s.products?.pending > 0 && (
              <Link to="/admin/products" style={{ background: C.amber + '20', border: `1px solid ${C.amber}44`, color: C.amber,
                borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                📦 {s.products.pending} на модерации
              </Link>
            )}
            {s.disputes?.open > 0 && (
              <Link to="/admin/disputes" style={{ background: C.red + '20', border: `1px solid ${C.red}44`, color: C.red,
                borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚖️ {s.disputes.open} споров
              </Link>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
          <StatCard label="Выручка (7д)" value={`${parseFloat(s.revenue?.week || 0).toLocaleString('ru')} ₽`} delta="+12%" trend={revenueWeek} />
          <StatCard label="Заказов всего" value={s.orders?.total || 0} delta={`+${s.orders?.today || 0}`} />
          <StatCard label="Пользователей" value={s.users?.total || 0} delta={`+${s.users?.today || 0}`} />
          <StatCard label="Продавцов" value={s.users?.sellers || 0} />
          <StatCard label="Среднее выдача" value={`${s.avgDeliveryMin || 0} мин`} />
          <StatCard label="Открытых споров" value={s.disputes?.open || 0} />
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <QuickAction emoji="📦" title="Модерация" sub={`${s.products?.pending || 0} ожидают`} to="/admin/products" />
          <QuickAction emoji="⚖️" title="Споры" sub={`${s.disputes?.open || 0} открытых`} to="/admin/disputes" />
          <QuickAction emoji="💸" title="Выплаты" sub="Заявки на вывод" to="/admin/withdrawals" />
          <QuickAction emoji="📂" title="Категории" sub="Управление" to="/admin/categories" />
        </div>

        {/* Orders + Online */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          {/* Recent orders */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>Последние заказы</span>
              <Link to="/admin/orders" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>Все →</Link>
            </div>
            {orders.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Нет заказов</div>
              : orders.map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '12px 18px',
                  borderBottom: `1px solid ${C.border}`, alignItems: 'center', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.cardHov}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{o.product_title?.slice(0, 35)}</div>
                    <div style={{ fontSize: 10, color: C.accent, fontFamily: 'monospace', marginTop: 2 }}>{o.order_number}</div>
                    <div style={{ fontSize: 10, color: C.t3 }}>{o.buyer_name} → {o.seller_name}</div>
                  </div>
                  <StatusBadge status={o.status} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{parseFloat(o.amount).toLocaleString('ru')} ₽</div>
                  <div style={{ fontSize: 10, color: C.t3 }}>{new Date(o.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
          </div>
          <OnlineTracker data={onlineData} />
        </div>

        {/* Logs + Settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Audit logs */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>🖥 Системные логи</span>
              <Link to="/admin/logs" style={{ fontSize: 11, color: C.accent, textDecoration: 'none' }}>Все →</Link>
            </div>
            {logs.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 12 }}>Нет логов</div>
              : logs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                  <span style={{ color: C.t3, fontFamily: 'monospace', fontSize: 10, flexShrink: 0 }}>
                    {new Date(l.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ flex: 1, color: C.t2 }}>{l.action}</span>
                  {l.username && <span style={{ color: C.t3 }}>{l.username}</span>}
                  <span style={{ fontSize: 9, background: '#1A1A28', color: C.t3, padding: '1px 6px', borderRadius: 6 }}>{l.entity || 'sys'}</span>
                </div>
              ))}
          </div>

          <QuickSettings settings={settings} onToggle={handleToggle} />
        </div>
      </div>
    </AdminLayout>
  );
}
