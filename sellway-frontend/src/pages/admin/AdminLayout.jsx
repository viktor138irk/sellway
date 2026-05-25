import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C } from '../../components/UI';
import UserAvatar from '../../components/UserAvatar';

const SECTIONS = [
  {
    title: 'ОСНОВНОЕ',
    items: [
      ['/admin',            '01', 'Обзор'],
      ['/admin/orders',     '02', 'Заказы'],
      ['/admin/products',   '03', 'Модерация'],
      ['/admin/published-products', '04', 'Опубликованные позиции'],
      ['/admin/users',      '05', 'Пользователи'],
      ['/admin/disputes',   '06', 'Споры'],
      ['/admin/support',    '07', 'Поддержка'],
    ],
  },
  {
    title: 'ФИНАНСЫ',
    items: [
      ['/admin/withdrawals','01', 'Выплаты'],
      ['/admin/referrals',  '02', 'Рефералы'],
      ['/admin/logs',       '03', 'Аудит-логи'],
    ],
  },
  {
    title: 'КОНТЕНТ',
    items: [
      ['/admin/categories', '01', 'Категории товаров'],
      ['/admin/service-categories', '02', 'Категории услуг'],
    ],
  },
  {
    title: 'НАСТРОЙКИ',
    items: [
      ['/admin/settings/finance', '01', 'Финансы'],
      ['/admin/settings/telegram', '02', 'Настройки Telegram'],
      ['/admin/settings/notifications', '03', 'Уведомления'],
      ['/admin/settings/seo', '04', 'SEO'],
      ['/admin/settings/system', '05', 'Система'],
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
      <aside style={{ width: 248, background: C.nav || C.header, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <UserAvatar user={user} size={36} radius={10} initialsLength={1} background={C.accent} />
          <div style={{ overflow: 'hidden' }}><div style={{ fontFamily:'var(--sw-serif)', fontSize: 16, fontWeight: 650, color: C.navText || C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div><div style={{ fontSize: 10, color: '#D48A70', fontWeight: 700, textTransform: 'uppercase' }}>Администратор</div></div>
        </div>
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {SECTIONS.map(section => <div key={section.title} style={{ marginBottom: 20 }}><div style={{ fontSize: 9, fontWeight: 900, color: C.navMuted || C.t3, textTransform: 'uppercase', padding: '0 10px', marginBottom: 7 }}>{section.title}</div>{section.items.map(([path, marker, label, badge]) => { const active = isActive(path); return <Link key={path} to={path} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 6, marginBottom: 3, textDecoration: 'none', background: active ? C.accent : 'transparent', color: active ? '#FFF9F2' : (C.navMuted || C.t2), fontSize: 13, fontWeight: active ? 700 : 500, transition: 'all .15s' }}><span style={{ fontFamily:'var(--sw-serif)', fontSize: 11, opacity:active ? .72 : .45, flexShrink: 0 }}>{marker}</span><span style={{ flex: 1 }}>{label}</span>{badge && <span style={{ fontSize: 9, background: C.red + '33', color: C.red, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>{badge}</span>}</Link>; })}</div>)}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}><Link to="/" style={{ fontSize: 12, color: C.navMuted || C.t3, textDecoration: 'none' }}>Магазин</Link><button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#D48A70', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>Выйти</button></div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</main>
    </div>
  );
}
