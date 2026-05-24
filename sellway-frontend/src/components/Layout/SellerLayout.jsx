import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C, Stars } from '../UI';
import useMediaQuery from '../../hooks/useMediaQuery';

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
  const isMobile = useMediaQuery('(max-width: 760px)');
  const roleLabel = user?.role === 'freelancer' ? 'Фрилансер' : user?.role === 'admin' ? 'Администратор' : 'Продавец';
  const nav = BASE_NAV.map(item => user?.role === 'freelancer' && item[0] === '/seller/products' ? ['/seller/products', '🧑‍💻', 'Услуги'] : item);

  return (
    <div className="seller-shell" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: isMobile ? 'auto' : 'calc(100vh - 90px)', width: '100%', minWidth: 0 }}>
      <aside className="seller-sidebar" style={{ width: isMobile ? '100%' : 220, background: '#0F0F18', borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', flexShrink: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'column', alignItems: 'stretch', overflow: 'hidden' }}>
        <div className="seller-identity" style={{ padding: isMobile ? '12px 14px' : '20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: isMobile ? 40 : 58, height: isMobile ? 40 : 58, borderRadius: 14, background: `linear-gradient(135deg,${C.accent},#A78BFA)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 14 : 20, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
            {user?.username?.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'center', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{roleLabel}</div>
          </div>
          {!isMobile && user?.rating > 0 && <Stars n={user.rating} size={13} />}
          {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginTop: 4 }}>
            <div style={{ textAlign: 'center', background: '#0A0A12', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{user?.total_sales || 0}</div>
              <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Продаж</div>
            </div>
            <div style={{ textAlign: 'center', background: '#0A0A12', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{user?.rating?.toFixed?.(1) || '—'}</div>
              <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Рейтинг</div>
            </div>
          </div>}
        </div>

        <nav className="seller-nav" style={{ flex: 1, padding: isMobile ? '9px 10px' : '10px 8px', overflowY: isMobile ? 'hidden' : 'auto', overflowX: isMobile ? 'auto' : 'hidden', display: isMobile ? 'flex' : 'block', gap: isMobile ? 6 : 0, whiteSpace: isMobile ? 'nowrap' : 'normal' }}>
          {nav.map(([to, icon, label]) => {
            const active = location.pathname === to || (to !== '/seller' && location.pathname.startsWith(to));
            return (
              <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: isMobile ? '9px 11px' : '9px 10px', borderRadius: 8, marginBottom: isMobile ? 0 : 2, background: active ? C.accent + '18' : 'transparent', borderLeft: isMobile ? 'none' : `3px solid ${active ? C.accent : 'transparent'}`, borderBottom: isMobile ? `2px solid ${active ? C.accent : 'transparent'}` : 'none', color: active ? C.accent : C.t2, fontSize: 13, fontWeight: active ? 700 : 400, textDecoration: 'none', transition: 'all .15s', flex: '0 0 auto' }}>
                <span style={{ fontSize: 15 }}>{icon}</span>{label}
              </Link>
            );
          })}
        </nav>

        {!isMobile && <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
          <Link to="/" style={{ fontSize: 12, color: C.t3, textDecoration: 'none' }}>← Вернуться в магазин</Link>
        </div>}
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</main>
    </div>
  );
}
