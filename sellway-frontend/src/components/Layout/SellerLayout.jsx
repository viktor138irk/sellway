import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C, Stars } from '../UI';

const BASE_NAV = [
  ['/seller', '📊', 'Дашборд'],
  ['/seller/products', '📦', 'Товары'],
  ['/seller/orders', '🛒', 'Заказы'],
  ['/seller/finances', '💰', 'Финансы'],
  ['/seller/referrals', '🤝', 'Рефералы'],
  ['/seller/withdrawal', '⬆️', 'Вывод средств'],
  ['/seller/reviews', '⭐', 'Отзывы'],
  ['/seller/promo', '🏷️', 'Акции'],
  ['/seller/settings', '⚙️', 'Настройки'],
];

export default function SellerLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const roleLabel = user?.role === 'freelancer' ? 'Фрилансер' : user?.role === 'admin' ? 'Администратор' : 'Продавец';
  const nav = BASE_NAV.map(item => user?.role === 'freelancer' && item[0] === '/seller/products' ? ['/seller/products', '🧑‍💻', 'Услуги'] : item);

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 90px)' }}>
      <aside style={{ width: 220, background: '#0F0F18', borderRight: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 58, height: 58, borderRadius: 14, background: `linear-gradient(135deg,${C.accent},#A78BFA)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#fff' }}>
            {user?.username?.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{roleLabel}</div>
          </div>
          {user?.rating > 0 && <Stars n={user.rating} size={13} />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginTop: 4 }}>
            <div style={{ textAlign: 'center', background: '#0A0A12', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{user?.total_sales || 0}</div>
              <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Продаж</div>
            </div>
            <div style={{ textAlign: 'center', background: '#0A0A12', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{user?.rating?.toFixed?.(1) || '—'}</div>
              <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Рейтинг</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {nav.map(([to, icon, label]) => {
            const active = location.pathname === to || (to !== '/seller' && location.pathname.startsWith(to));
            return (
              <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, marginBottom: 2, background: active ? C.accent + '18' : 'transparent', borderLeft: `3px solid ${active ? C.accent : 'transparent'}`, color: active ? C.accent : C.t2, fontSize: 13, fontWeight: active ? 700 : 400, textDecoration: 'none', transition: 'all .15s' }}>
                <span style={{ fontSize: 15 }}>{icon}</span>{label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
          <Link to="/" style={{ fontSize: 12, color: C.t3, textDecoration: 'none' }}>← Вернуться в магазин</Link>
        </div>
      </aside>
      <main style={{ flex: 1, overflowX: 'hidden' }}>{children}</main>
    </div>
  );
}
