import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C } from '../UI';
import { getNotifications, readAllNotifs, readNotif } from '../../api/seller';
import { getCategories } from '../../api/products';
import useMediaQuery from '../../hooks/useMediaQuery';
import UserAvatar from '../UserAvatar';

const byOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name);

function publicCategoryTree(categories) {
  const available = new Set(categories.filter(cat => Number(cat.subtree_product_count ?? cat.product_count ?? 0) > 0).map(cat => cat.id));
  let changed = true;
  while (changed) {
    changed = false;
    categories.forEach(cat => {
      if (available.has(cat.id) && cat.parent_id && !available.has(cat.parent_id)) {
        available.add(cat.parent_id);
        changed = true;
      }
    });
  }
  const map = new Map(categories.filter(cat => available.has(cat.id)).map(cat => [cat.id, { ...cat, children: [] }]));
  const roots = [];
  map.forEach(cat => {
    if (cat.parent_id && map.has(cat.parent_id)) map.get(cat.parent_id).children.push(cat);
    else roots.push(cat);
  });
  map.forEach(cat => cat.children.sort(byOrder));
  return roots.sort(byOrder);
}

function MenuCategoryIcon({ cat }) {
  const img = cat.display_image_url || cat.image_url || cat.parent_image_url || '';
  return <span style={{ width:24, height:24, borderRadius:6, flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:C.media, color:C.t2, fontSize:11, fontWeight:800 }}>
    {img ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : String(cat.name || '?').slice(0, 1).toUpperCase()}
  </span>;
}

function EnvelopeIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6.5h16v11H4z" />
    <path d="m5 7.5 7 5 7-5" />
  </svg>;
}

function CatalogMenu({ kind, categories, mobile, onClose }) {
  const roots = useMemo(() => publicCategoryTree(categories), [categories]);
  const [path, setPath] = useState([]);
  useEffect(() => setPath([]), [kind, categories]);
  const columns = [roots];
  path.forEach((id, index) => {
    const selected = columns[index]?.find(cat => cat.id === id);
    if (selected?.children?.length) columns.push(selected.children);
  });
  const selectedForColumn = index => index > 0 ? columns[index - 1]?.find(cat => cat.id === path[index - 1]) : null;
  const queryKind = kind === 'services' ? 'services' : 'products';
  function expose(cat, level) {
    if (!cat.children.length) return;
    setPath(old => [...old.slice(0, level), cat.id]);
  }

  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:C.shadow, overflow:'hidden' }}>
    <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
      <Link to={`/catalog?kind=${queryKind}`} onClick={onClose} style={{ color:C.accent, fontWeight:700, fontSize:13, textDecoration:'none' }}>{kind === 'services' ? 'Все услуги' : 'Все товары'}</Link>
      <Link to={`/catalog?kind=${queryKind}&sort=popular`} onClick={onClose} style={{ color:C.t2, fontWeight:600, fontSize:12, textDecoration:'none' }}>Популярное</Link>
      <Link to={`/catalog?kind=${queryKind}&sort=newest`} onClick={onClose} style={{ color:C.t2, fontWeight:600, fontSize:12, textDecoration:'none' }}>Новинки</Link>
      <span style={{ color:C.t3, fontSize:11 }}>Показываются разделы с опубликованными позициями</span>
    </div>
    {roots.length === 0 ? <div style={{ padding:24, color:C.t2, fontSize:13 }}>Здесь появятся категории после публикации позиций.</div>
    : <div style={{ display:'flex', overflowX:'auto', maxHeight:mobile ? 'calc(100vh - 190px)' : 390 }}>
        {columns.slice(0, mobile ? 4 : 5).map((items, index) => {
          const parent = selectedForColumn(index);
          return <div key={index} style={{ minWidth:mobile ? 215 : 218, width:mobile ? 215 : '25%', padding:10, borderRight:index < columns.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            {parent && <Link to={`/catalog?kind=${queryKind}&category=${encodeURIComponent(parent.slug)}`} onClick={onClose} style={{ display:'block', padding:'8px 9px', marginBottom:6, fontSize:11, color:C.accent, fontWeight:700, textDecoration:'none', borderBottom:`1px solid ${C.border}` }}>Все: {parent.name}</Link>}
            {items.map(cat => cat.children.length ? <button key={cat.id} type="button" onMouseEnter={() => !mobile && expose(cat, index)} onClick={() => expose(cat, index)} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, border:'none', background:path[index] === cat.id ? C.infoBg : 'transparent', color:C.t1, padding:'8px 9px', borderRadius:7, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}>
              {index === 0 && <MenuCategoryIcon cat={cat} />}
              <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:13, fontWeight:path[index] === cat.id ? 700 : 500 }}>{cat.name}</span>
              <span aria-hidden="true" style={{ color:C.t3 }}>›</span>
            </button> : <Link key={cat.id} to={`/catalog?kind=${queryKind}&category=${encodeURIComponent(cat.slug)}`} onClick={onClose} style={{ display:'flex', alignItems:'center', gap:8, color:C.t1, padding:'8px 9px', borderRadius:7, textDecoration:'none', fontSize:13 }}>
              {index === 0 && <MenuCategoryIcon cat={cat} />}
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat.name}</span>
            </Link>)}
          </div>;
        })}
      </div>}
  </div>;
}

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [q, setQ] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [menuKind, setMenuKind] = useState('');
  const [menuCategories, setMenuCategories] = useState({ products: [], services: [] });
  const notifsRef = useRef(null);
  const userRef = useRef(null);
  const navRef = useRef(null);

  function calcUnread(list) { return list.filter(n => !n.is_read).length; }
  function setNotifState(list) { setNotifs(list.slice(0, 10)); setUnread(calcUnread(list)); }

  useEffect(() => {
    if (!user) { setNotifs([]); setUnread(0); return; }
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    Promise.all([getCategories({ type: 'product' }), getCategories({ type: 'service' })])
      .then(([products, services]) => setMenuCategories({ products: products.data || [], services: services.data || [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const closeMenus = (e) => {
      if (notifsRef.current?.contains(e.target) || userRef.current?.contains(e.target) || navRef.current?.contains(e.target)) return;
      setShowNotifs(false);
      setShowUser(false);
      setMenuKind('');
    };
    const closeOnEsc = (e) => {
      if (e.key !== 'Escape') return;
      setShowNotifs(false);
      setShowUser(false);
      setMenuKind('');
    };
    document.addEventListener('mousedown', closeMenus);
    document.addEventListener('touchstart', closeMenus);
    document.addEventListener('keydown', closeOnEsc);
    return () => {
      document.removeEventListener('mousedown', closeMenus);
      document.removeEventListener('touchstart', closeMenus);
      document.removeEventListener('keydown', closeOnEsc);
    };
  }, []);

  async function loadNotifs() {
    try {
      const { data } = await getNotifications();
      setNotifState(data || []);
    } catch {}
  }

  async function toggleNotifs() {
    const next = !showNotifs;
    setShowNotifs(next);
    setShowUser(false);
    setMenuKind('');
    if (next) await loadNotifs();
  }

  async function handleReadAll() {
    const old = notifs;
    setNotifState(old.map(n => ({ ...n, is_read: true })));
    try {
      await readAllNotifs();
      await loadNotifs();
    } catch {
      setNotifState(old);
    }
  }

  async function handleNotifClick(n) {
    const old = notifs;
    if (!n.is_read) setNotifState(old.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    try { if (!n.is_read) await readNotif(n.id); } catch { setNotifState(old); }
    if (n.link) navigate(normalizeNotificationLink(n.link));
    setShowNotifs(false);
    loadNotifs();
  }

  function normalizeNotificationLink(link) {
    return String(link || '').replace(/^\/seller\/orders\//, '/orders/');
  }

  function handleSearch(e) {
    e.preventDefault();
    if (q.trim()) navigate(`/catalog?kind=products&search=${encodeURIComponent(q)}`);
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const isSellerRole = ['seller', 'freelancer', 'admin'].includes(user?.role);
  const mobilePanelBase = isMobile
    ? { position: 'fixed', top: 101, right: 10, maxWidth: 'calc(100vw - 20px)', zIndex: 5000 }
    : { position: 'absolute', top: 42, right: 0, maxWidth: 'calc(100vw - 24px)', zIndex: 5000 };
  const notifPanelStyle = {
    ...mobilePanelBase,
    width: isMobile ? 'calc(100vw - 20px)' : 340,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    boxShadow: C.shadow,
    overflow: 'hidden',
  };
  const userPanelStyle = {
    ...mobilePanelBase,
    width: isMobile ? 'min(260px, calc(100vw - 20px))' : 220,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    boxShadow: C.shadow,
    overflow: 'hidden',
  };

  return <header className="site-header" style={{ background: C.header, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 4000, boxShadow: '0 3px 14px rgba(61,41,25,.05)' }}>
    <div className="site-header-row" style={{ width:'100%', boxSizing:'border-box', padding: isMobile ? '0 10px' : '0 24px', height: 58, display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
        <img className="site-brand-logo" src="/brand-logo.png" alt="SellWay" style={{ display:'block', width:isMobile ? 112 : 130, height:40, objectFit:'contain' }} />
      </Link>

      <form className="site-search" onSubmit={handleSearch} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск товаров и услуг..." style={{ width: '100%', boxSizing: 'border-box', background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.t1, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
      </form>

      <div className="site-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {user ? <>
          <div ref={notifsRef} style={{ position: 'relative' }}>
            <button type="button" onClick={toggleNotifs} aria-label="Уведомления" style={{ width: 34, height: 34, borderRadius: 9, background: showNotifs ? C.soft : 'transparent', border: `1px solid ${C.border}`, color: C.t2, fontSize: 15, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EnvelopeIcon />
              {unread > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999, background: C.red, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
            </button>
            {showNotifs && <div style={notifPanelStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>Уведомления</span>
                {unread > 0 && <button type="button" onClick={handleReadAll} style={{ background: 'transparent', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Прочитать все</button>}
              </div>
              <div style={{ maxHeight: isMobile ? 'calc(100vh - 118px)' : 380, overflowY: 'auto' }}>
                {notifs.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Уведомлений нет</div> : notifs.map(n => <div key={n.id} onClick={() => handleNotifClick(n)} style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, cursor: n.link ? 'pointer' : 'default', background: n.is_read ? 'transparent' : C.accent + '08', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = C.cardHov} onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : C.accent + '08'}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, flex: 1 }}>{n.title}</div>
                    {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4 }}>{n.body}</div>
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>{new Date(n.created_at).toLocaleString('ru')}</div>
                </div>)}
              </div>
            </div>}
          </div>

          <div ref={userRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => { setShowUser(p => !p); setShowNotifs(false); setMenuKind(''); }} aria-label="Меню пользователя" style={{ width:34, height:34, padding:0, borderRadius:9, background:'transparent', border:`1px solid ${showUser ? C.accent : 'transparent'}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'inherit', overflow:'hidden' }}><UserAvatar user={user} size={32} radius={8} /></button>
            {showUser && <div onClick={() => setShowUser(false)} style={userPanelStyle}>
              <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:10, alignItems:'center' }}>
                <UserAvatar user={user} size={36} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{user.username}</div>
                  <div style={{ fontSize:11, color:C.t2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
                </div>
              </div>
              {[[isSellerRole ? '/seller' : '/profile/purchases', isSellerRole ? 'Кабинет продавца' : 'Личный кабинет'], ['/profile/purchases', 'Покупки'], ['/profile/favorites', 'Избранное'], ['/profile/settings', 'Настройки'], ...(user.role === 'admin' ? [['/admin', 'Админ-панель']] : [])].map(([to, label]) => <Link key={to} to={to} style={{ display: 'block', padding: '10px 16px', fontSize: 13, color: C.t2, textDecoration: 'none', borderBottom: `1px solid ${C.border}` }}>{label}</Link>)}
              <button type="button" onClick={handleLogout} style={{ width: '100%', background: 'transparent', border: 'none', color: C.red, fontSize: 13, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>Выйти</button>
            </div>}
          </div>
        </> : <>
          <Link to="/login" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.t2, borderRadius: 8, padding: '7px 14px', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Войти</Link>
          <Link to="/register" style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}>Регистрация</Link>
        </>}
      </div>
    </div>

    <div ref={navRef} className="site-nav-wrap" style={{ borderTop: `1px solid ${C.border}`, padding: isMobile ? '0 10px' : '0 20px', position:'relative' }}>
      <div className="site-nav" style={{ width:'100%', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {[['products', 'Каталог'], ['services', 'Услуги']].map(([value, label]) => {
          const active = location.pathname === '/catalog' && (new URLSearchParams(location.search).get('kind') || 'products') === value;
          return <button key={value} type="button" onMouseEnter={() => !isMobile && setMenuKind(value)} onClick={() => setMenuKind(old => old === value ? '' : value)} style={{ padding:'9px 16px', fontSize:13, color:active || menuKind === value ? C.accent : C.t2, background:'transparent', border:'none', borderBottom:`2px solid ${active || menuKind === value ? C.accent : 'transparent'}`, fontFamily:'inherit', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', display:'flex', gap:7, alignItems:'center' }}>{value === 'products' ? '🛍️' : '🧰'} {label}<span style={{ fontSize:11 }}>⌄</span></button>;
        })}
        <Link to="/catalog?kind=products&sort=newest" onClick={() => setMenuKind('')} style={{ padding:'9px 16px', fontSize:13, color:C.t2, textDecoration:'none', fontWeight:600, borderBottom:'2px solid transparent', whiteSpace:'nowrap' }}>✨ Новинки</Link>
        {isSellerRole && <Link to="/seller/products/new" style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>{user.role === 'freelancer' ? '+ Услуга' : '+ Продать'}</Link>}
      </div>
      {menuKind && <div style={{ position:'absolute', left:isMobile ? 10 : 20, right:isMobile ? 10 : undefined, top:'100%', width:isMobile ? undefined : 'min(1160px, calc(100vw - 40px))', zIndex:5000 }}>
        <CatalogMenu kind={menuKind} categories={menuCategories[menuKind]} mobile={isMobile} onClose={() => setMenuKind('')} />
      </div>}
    </div>
  </header>;
}
