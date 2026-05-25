import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C, Stars } from '../UI';
import useMediaQuery from '../../hooks/useMediaQuery';
import UserAvatar from '../UserAvatar';

const BASE_NAV = [
  ['/seller', 'Обзор'],
  ['/seller/products', 'Товары'],
  ['/seller/orders', 'Заказы'],
  ['/seller/finances', 'Финансы'],
  ['/seller/referrals', 'Рефералы'],
  ['/seller/withdrawal', 'Вывод средств'],
  ['/seller/reviews', 'Отзывы'],
  ['/seller/promo', 'Акции'],
  ['/profile/favorites', 'Избранное'],
  ['/seller/settings', 'Настройки'],
];

function MenuIcon({ open }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {open ? <><path d="M6 6 18 18" /><path d="m18 6-12 12" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
  </svg>;
}

export default function SellerLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const roleLabel = user?.role === 'freelancer' ? 'Фрилансер' : user?.role === 'admin' ? 'Администратор' : 'Продавец';
  const nav = BASE_NAV.map(([path, label]) => user?.role === 'freelancer' && path === '/seller/products' ? [path, 'Услуги'] : [path, label]);

  useEffect(() => {
    if (isMobile) setMenuOpen(false);
  }, [location.pathname, isMobile]);

  return (
    <div className="seller-shell" style={{ display:'flex', flexDirection:isMobile ? 'column' : 'row', minHeight:isMobile ? 'auto' : 'calc(100vh - 90px)', width:'100%', minWidth:0 }}>
      <aside className="seller-sidebar" style={{ width:isMobile ? '100%' : 242, background:C.nav || C.header, color:C.navText || C.t1, borderRight:isMobile ? 'none' : `1px solid ${C.border}`, borderBottom:isMobile ? `1px solid ${C.border}` : 'none', flexShrink:0, display:'flex', flexDirection:'column', alignItems:'stretch', overflow:'hidden' }}>
        <div className="seller-identity" style={{ padding:isMobile ? '12px 14px' : '20px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', flexDirection:isMobile ? 'row' : 'column', alignItems:'center', gap:10, minWidth:0 }}>
          <UserAvatar user={user} size={isMobile ? 40 : 58} radius={14} background={C.accent} />
          <div style={{ textAlign:isMobile ? 'left' : 'center', minWidth:0 }}>
            <div style={{ fontSize:16, fontFamily:'var(--sw-serif)', fontWeight:650, color:C.navText || C.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.username}</div>
            <div style={{ fontSize:11, color:C.navMuted || C.t2, marginTop:2 }}>{roleLabel}</div>
          </div>
          {isMobile && <button type="button" className="cabinet-menu-toggle" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} style={{ marginLeft:'auto', width:40, height:40, borderRadius:8, border:`1px solid ${C.border}`, color:C.navText || C.t1, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}><MenuIcon open={menuOpen} /></button>}
          {!isMobile && user?.rating > 0 && <Stars n={user.rating} size={13} />}
          {!isMobile && <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, width:'100%', marginTop:4 }}>
            <div style={{ textAlign:'center', background:'rgba(255,253,249,.06)', borderRadius:6, padding:8 }}><div style={{ fontSize:15, fontWeight:800, color:C.navText || C.t1 }}>{user?.total_sales || 0}</div><div style={{ fontSize:9, color:C.navMuted || C.t3, textTransform:'uppercase' }}>Продаж</div></div>
            <div style={{ textAlign:'center', background:'rgba(255,253,249,.06)', borderRadius:6, padding:8 }}><div style={{ fontSize:15, fontWeight:800, color:C.navText || C.t1 }}>{user?.rating?.toFixed?.(1) || '—'}</div><div style={{ fontSize:9, color:C.navMuted || C.t3, textTransform:'uppercase' }}>Рейтинг</div></div>
          </div>}
        </div>

        <nav className="seller-nav" hidden={isMobile && !menuOpen} style={{ flex:1, padding:isMobile ? '10px' : '10px 8px', overflowY:isMobile ? 'hidden' : 'auto', display:isMobile ? 'grid' : 'block', gridTemplateColumns:isMobile ? 'repeat(2, minmax(0, 1fr))' : undefined, gap:isMobile ? 6 : 0 }}>
          {nav.map(([to, label]) => {
            const active = location.pathname === to || (to !== '/seller' && location.pathname.startsWith(to));
            return <Link key={to} to={to} onClick={() => isMobile && setMenuOpen(false)} style={{ display:'flex', alignItems:'center', padding:isMobile ? '11px 12px' : '11px 12px', borderRadius:6, marginBottom:isMobile ? 0 : 3, background:active ? C.accent : 'transparent', color:active ? '#FFF9F2' : (C.navMuted || C.t2), fontSize:13, fontWeight:active ? 700 : 500, textDecoration:'none', transition:'all .15s', minWidth:0 }}>{label}</Link>;
          })}
        </nav>

        {!isMobile && <div style={{ padding:'14px 16px', borderTop:`1px solid ${C.border}` }}><Link to="/" style={{ fontSize:12, color:C.navMuted || C.t3, textDecoration:'none' }}>Вернуться в магазин</Link></div>}
      </aside>
      <main style={{ flex:1, minWidth:0, maxWidth:'100%', overflowX:'hidden' }}>{children}</main>
    </div>
  );
}
