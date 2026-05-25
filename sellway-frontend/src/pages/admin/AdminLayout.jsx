import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C } from '../../components/UI';
import UserAvatar from '../../components/UserAvatar';
import useMediaQuery from '../../hooks/useMediaQuery';

const SECTIONS = [
  { title:'Основное', icon:'🏠', items:[['/admin','Обзор'], ['/admin/orders','Заказы'], ['/admin/products','Модерация'], ['/admin/published-products','Опубликованные позиции'], ['/admin/users','Пользователи'], ['/admin/disputes','Споры'], ['/admin/support','Поддержка']] },
  { title:'Финансы', icon:'💳', items:[['/admin/withdrawals','Выплаты'], ['/admin/referrals','Рефералы'], ['/admin/logs','Аудит-логи']] },
  { title:'Контент', icon:'🗂️', items:[['/admin/categories','Категории товаров'], ['/admin/service-categories','Категории услуг']] },
  { title:'Настройки', icon:'⚙️', items:[['/admin/settings/finance','Финансы'], ['/admin/settings/telegram','Настройки Telegram'], ['/admin/settings/notifications','Уведомления'], ['/admin/settings/seo','SEO'], ['/admin/settings/system','Система']] },
];

function MenuIcon({ open }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {open ? <><path d="M6 6 18 18" /><path d="m18 6-12 12" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
  </svg>;
}

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const sectionForPath = SECTIONS.find(section => section.items.some(([path]) => path === '/admin' ? location.pathname === path : location.pathname.startsWith(path)));
  const [openSections, setOpenSections] = useState(() => new Set([sectionForPath?.title || SECTIONS[0].title]));

  useEffect(() => {
    if (isMobile) setMenuOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    if (!sectionForPath) return;
    setOpenSections(current => new Set([...current, sectionForPath.title]));
  }, [sectionForPath?.title]);

  async function handleLogout() { await logout(); navigate('/'); }
  function isActive(path) { return path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path); }
  function toggleSection(title) {
    setOpenSections(current => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <div className="admin-shell" style={{ display:'flex', flexDirection:isMobile ? 'column' : 'row', minHeight:isMobile ? 'auto' : 'calc(100vh - 58px)', background:C.bg, minWidth:0 }}>
      <aside className="admin-sidebar" style={{ width:isMobile ? '100%' : 248, background:C.nav || C.header, borderRight:isMobile ? 'none' : `1px solid ${C.border}`, borderBottom:isMobile ? `1px solid ${C.border}` : 'none', display:'flex', flexDirection:'column', flexShrink:0, position:isMobile ? 'relative' : 'sticky', top:0, height:isMobile ? 'auto' : 'calc(100vh - 58px)', overflow:'hidden' }}>
        <div style={{ padding:'13px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:10, alignItems:'center', minWidth:0 }}>
          <UserAvatar user={user} size={36} radius={10} initialsLength={1} background={C.accent} />
          <div style={{ overflow:'hidden', minWidth:0 }}><div style={{ fontFamily:'var(--sw-serif)', fontSize:16, fontWeight:650, color:C.navText || C.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.username}</div><div style={{ fontSize:10, color:'#D48A70', fontWeight:700, textTransform:'uppercase' }}>Администратор</div></div>
          {isMobile && <button type="button" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} style={{ marginLeft:'auto', width:40, height:40, borderRadius:8, border:`1px solid ${C.border}`, color:C.navText || C.t1, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}><MenuIcon open={menuOpen} /></button>}
        </div>
        <nav className="admin-nav" hidden={isMobile && !menuOpen} style={{ flex:1, padding:'10px 8px', overflow:'hidden' }}>
          {SECTIONS.map(section => <div key={section.title} style={{ marginBottom:7 }}>
            <button type="button" onClick={() => toggleSection(section.title)} aria-expanded={openSections.has(section.title)} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, border:0, background:'transparent', color:C.navMuted || C.t3, padding:'8px 10px', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:800, textAlign:'left' }}>
              <span aria-hidden="true">{section.icon}</span><span style={{ flex:1 }}>{section.title}</span><span aria-hidden="true">{openSections.has(section.title) ? '−' : '+'}</span>
            </button>
            {openSections.has(section.title) && section.items.map(([path, label]) => { const active = isActive(path); return <Link key={path} to={path} onClick={() => isMobile && setMenuOpen(false)} style={{ display:'flex', alignItems:'center', padding:'8px 11px 8px 34px', borderRadius:6, marginBottom:2, textDecoration:'none', background:active ? C.accent : 'transparent', color:active ? '#FFF9F2' : (C.navMuted || C.t2), fontSize:12, fontWeight:active ? 700 : 500, transition:'all .15s' }}>{label}</Link>; })}
          </div>)}
        </nav>
        {(!isMobile || menuOpen) && <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:8 }}><Link to="/" style={{ fontSize:12, color:C.navMuted || C.t3, textDecoration:'none' }}>Магазин</Link><button onClick={handleLogout} style={{ background:'transparent', border:'none', color:'#D48A70', fontSize:12, cursor:'pointer', fontFamily:'inherit', textAlign:'left', padding:0 }}>Выйти</button></div>}
      </aside>
      <main style={{ flex:1, minWidth:0, maxWidth:'100%', overflowX:'hidden' }}>{children}</main>
    </div>
  );
}
