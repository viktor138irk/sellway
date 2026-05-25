import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C, Stars } from '../UI';
import useMediaQuery from '../../hooks/useMediaQuery';
import UserAvatar from '../UserAvatar';

const BASE_NAV = [
  ['/seller', '01', 'Обзор'],
  ['/seller/products', '02', 'Товары'],
  ['/seller/orders', '03', 'Заказы'],
  ['/seller/finances', '04', 'Финансы'],
  ['/seller/referrals', '05', 'Рефералы'],
  ['/seller/withdrawal', '06', 'Вывод средств'],
  ['/seller/reviews', '07', 'Отзывы'],
  ['/seller/promo', '08', 'Акции'],
  ['/seller/settings', '09', 'Настройки'],
];

export default function SellerLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const roleLabel = user?.role === 'freelancer' ? 'Фрилансер' : user?.role === 'admin' ? 'Администратор' : 'Продавец';
  const nav = BASE_NAV.map(item => user?.role === 'freelancer' && item[0] === '/seller/products' ? ['/seller/products', '02', 'Услуги'] : item);

  return (
    <div className="seller-shell" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: isMobile ? 'auto' : 'calc(100vh - 90px)', width: '100%', minWidth: 0 }}>
      <aside className="seller-sidebar" style={{ width: isMobile ? '100%' : 242, background: C.nav || C.header, color:C.navText || C.t1, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden' }}>
        <div className="seller-identity" style={{ padding: isMobile ? '12px 14px' : '20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <UserAvatar user={user} size={isMobile ? 40 : 58} radius={14} background={C.accent} />
          <div style={{ textAlign: isMobile ? 'left' : 'center', minWidth: 0 }}>
            <div style={{ fontSize: 16, fontFamily:'var(--sw-serif)', fontWeight: 650, color: C.navText || C.t1 }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: C.navMuted || C.t2, marginTop: 2 }}>{roleLabel}</div>
          </div>
          {!isMobile && user?.rating > 0 && <Stars n={user.rating} size={13} />}
          {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginTop: 4 }}>
            <div style={{ textAlign: 'center', background: 'rgba(255,253,249,.06)', borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.navText || C.t1 }}>{user?.total_sales || 0}</div>
              <div style={{ fontSize: 9, color: C.navMuted || C.t3, textTransform: 'uppercase' }}>Продаж</div>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(255,253,249,.06)', borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.navText || C.t1 }}>{user?.rating?.toFixed?.(1) || '—'}</div>
              <div style={{ fontSize: 9, color: C.navMuted || C.t3, textTransform: 'uppercase' }}>Рейтинг</div>
            </div>
          </div>}
        </div>

        <nav className="seller-nav" style={{ flex: 1, padding: isMobile ? '9px 10px' : '10px 8px', overflowY: isMobile ? 'hidden' : 'auto', overflowX: isMobile ? 'auto' : 'hidden', display: isMobile ? 'flex' : 'block', gap: isMobile ? 6 : 0, whiteSpace: isMobile ? 'nowrap' : 'normal' }}>
          {nav.map(([to, icon, label]) => {
            const active = location.pathname === to || (to !== '/seller' && location.pathname.startsWith(to));
            return (
              <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '10px 12px' : '11px 12px', borderRadius: 6, marginBottom: isMobile ? 0 : 3, background: active ? C.accent : 'transparent', borderBottom: isMobile ? `2px solid ${active ? C.accent : 'transparent'}` : 'none', color: active ? '#FFF9F2' : (C.navMuted || C.t2), fontSize: 13, fontWeight: active ? 700 : 500, textDecoration: 'none', transition: 'all .15s', flex: '0 0 auto' }}>
                <span style={{ fontFamily:'var(--sw-serif)', fontSize: 12, opacity:active ? .75 : .48 }}>{icon}</span>{label}
              </Link>
            );
          })}
        </nav>

        {!isMobile && <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
          <Link to="/" style={{ fontSize: 12, color: C.navMuted || C.t3, textDecoration: 'none' }}>Вернуться в магазин</Link>
        </div>}
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</main>
    </div>
  );
}
