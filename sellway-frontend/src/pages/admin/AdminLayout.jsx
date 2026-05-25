import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C } from '../../components/UI';
import UserAvatar from '../../components/UserAvatar';

const SECTIONS = [
  {
    title: 'ОСНОВНОЕ',
    items: [
      ['/admin',            '📊', 'Дашборд'],
      ['/admin/orders',     '🛒', 'Заказы'],
      ['/admin/products',   '📥', 'Модерация'],
      ['/admin/published-products', '📦', 'Опубликованные позиции'],
      ['/admin/users',      '👥', 'Пользователи'],
      ['/admin/disputes',   '⚖️', 'Споры'],
      ['/admin/support',    '💬', 'Поддержка'],
    ],
  },
  {
    title: 'ФИНАНСЫ',
    items: [
      ['/admin/withdrawals','💸', 'Выплаты'],
      ['/admin/referrals',  '🤝', 'Рефералы'],
      ['/admin/logs',       '📋', 'Аудит-логи'],
    ],
  },
  {
    title: 'КОНТЕНТ',
    items: [
      ['/admin/categories', '📂', 'Категории товаров'],
      ['/admin/service-categories', '🧑‍💻', 'Категории услуг'],
    ],
  },
  {
    title: 'НАСТРОЙКИ',
    items: [
      ['/admin/settings/finance', '💰', 'Финансы'],
      ['/admin/settings/telegram', '✈️', 'Настройки телеграм'],
      ['/admin/settings/notifications', '✉️', 'Уведомления'],
      ['/admin/settings/system', '⚙️', 'Система'],
    ],
  },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() { await logout(); navigate('/'); }
  function isActive(path) { if (path === '/admin') return location.pathname === '/admin'; return location.pathname.startsWith(path); }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 58px)', background: C.bg }}>
      <aside style={{ width: 220, background: '#0C0C14', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 58, height: 'calc(100vh - 58px)', overflowY: 'auto' }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <UserAvatar user={user} size={36} radius={10} initialsLength={1} background={`linear-gradient(135deg,${C.accent},#A78BFA)`} />
          <div style={{ overflow: 'hidden' }}><div style={{ fontSize: 13, fontWeight: 700, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div><div style={{ fontSize: 10, color: C.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Администратор</div></div>
        </div>
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {SECTIONS.map(section => <div key={section.title} style={{ marginBottom: 20 }}><div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: C.t3, textTransform: 'uppercase', padding: '0 8px', marginBottom: 6 }}>{section.title}</div>{section.items.map(([path, icon, label, badge]) => { const active = isActive(path); return <Link key={path} to={path} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, marginBottom: 2, textDecoration: 'none', background: active ? C.accent + '18' : 'transparent', borderLeft: `3px solid ${active ? C.accent : 'transparent'}`, color: active ? C.accentL : C.t2, fontSize: 13, fontWeight: active ? 700 : 400, transition: 'all .15s' }}><span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span><span style={{ flex: 1 }}>{label}</span>{badge && <span style={{ fontSize: 9, background: C.red + '33', color: C.red, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>{badge}</span>}</Link>; })}</div>)}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}><Link to="/" style={{ fontSize: 12, color: C.t3, textDecoration: 'none' }}>← Магазин</Link><button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>🚪 Выйти</button></div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</main>
    </div>
  );
}
