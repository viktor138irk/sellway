import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C } from '../UI';
import { getNotifications, readAllNotifs, readNotif } from '../../api/seller';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const sync = () => setIsMobile(window.matchMedia('(max-width: 640px)').matches);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  return isMobile;
}

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const notifsRef = useRef(null);
  const userRef = useRef(null);

  function calcUnread(list) { return list.filter(n => !n.is_read).length; }
  function setNotifState(list) { setNotifs(list.slice(0, 10)); setUnread(calcUnread(list)); }

  useEffect(() => {
    if (!user) { setNotifs([]); setUnread(0); return; }
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const closeMenus = (e) => {
      if (notifsRef.current?.contains(e.target) || userRef.current?.contains(e.target)) return;
      setShowNotifs(false);
      setShowUser(false);
    };
    const closeOnEsc = (e) => {
      if (e.key !== 'Escape') return;
      setShowNotifs(false);
      setShowUser(false);
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
    if (n.link) navigate(n.link);
    setShowNotifs(false);
    loadNotifs();
  }

  function handleSearch(e) {
    e.preventDefault();
    if (q.trim()) navigate(`/catalog?search=${encodeURIComponent(q)}`);
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const navLinks = [
    ['/catalog', 'Каталог'],
    ['/catalog?delivery=auto', 'Авто-выдача'],
    ['/catalog?delivery=service', 'Услуги'],
    ['/catalog?sort=newest', 'Новинки'],
  ];
  const isSellerRole = ['seller', 'freelancer', 'admin'].includes(user?.role);
  const mobilePanelBase = isMobile
    ? { position: 'fixed', top: 54, right: 10, maxWidth: 'calc(100vw - 20px)', zIndex: 5000 }
    : { position: 'absolute', top: 42, right: 0, maxWidth: 'calc(100vw - 24px)', zIndex: 5000 };
  const notifPanelStyle = {
    ...mobilePanelBase,
    width: isMobile ? 'calc(100vw - 20px)' : 340,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,.55)',
    overflow: 'hidden',
  };
  const userPanelStyle = {
    ...mobilePanelBase,
    width: isMobile ? 'min(260px, calc(100vw - 20px))' : 220,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    boxShadow: '0 12px 40px rgba(0,0,0,.55)',
    overflow: 'hidden',
  };

  return <header style={{ background: '#0F0F18', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 4000 }}>
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 10px' : '0 20px', height: 58, display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, background: `linear-gradient(135deg,${C.accent},#A78BFA)`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>S</div>
        <span style={{ fontSize: 17, fontWeight: 900, color: C.t1 }}>SellWay</span>
      </Link>

      <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск товаров и услуг..." style={{ width: '100%', boxSizing: 'border-box', background: '#141420', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', color: C.t1, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
      </form>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {user ? <>
          <div ref={notifsRef} style={{ position: 'relative' }}>
            <button type="button" onClick={toggleNotifs} aria-label="Уведомления" style={{ width: 34, height: 34, borderRadius: 9, background: showNotifs ? '#1A1A28' : 'transparent', border: `1px solid ${C.border}`, color: C.t2, fontSize: 15, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              🔔
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
            <button type="button" onClick={() => { setShowUser(p => !p); setShowNotifs(false); }} aria-label="Меню пользователя" style={{ width: 34, height: 34, borderRadius: 9, background: C.accent, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{user.username?.slice(0, 2).toUpperCase()}</button>
            {showUser && <div onClick={() => setShowUser(false)} style={userPanelStyle}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{user.username}</div>
                <div style={{ fontSize: 11, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
              </div>
              {[[isSellerRole ? '/seller' : '/profile', 'Личный кабинет'], ['/profile/settings', 'Настройки'], ...(user.role === 'admin' ? [['/admin', 'Админ-панель']] : [])].map(([to, label]) => <Link key={to} to={to} style={{ display: 'block', padding: '10px 16px', fontSize: 13, color: C.t2, textDecoration: 'none', borderBottom: `1px solid ${C.border}` }}>{label}</Link>)}
              <button type="button" onClick={handleLogout} style={{ width: '100%', background: 'transparent', border: 'none', color: C.red, fontSize: 13, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>Выйти</button>
            </div>}
          </div>
        </> : <>
          <Link to="/login" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.t2, borderRadius: 8, padding: '7px 14px', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Войти</Link>
          <Link to="/register" style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}>Регистрация</Link>
        </>}
      </div>
    </div>

    <div style={{ borderTop: `1px solid ${C.border}`, padding: isMobile ? '0 10px' : '0 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {navLinks.map(([to, label]) => <Link key={to} to={to} style={{ padding: '9px 16px', fontSize: 13, color: location.pathname + location.search === to ? C.accent : C.t2, textDecoration: 'none', fontWeight: 600, borderBottom: `2px solid ${location.pathname === to.split('?')[0] ? C.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>{label}</Link>)}
        {isSellerRole && <Link to="/seller/products/new" style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>{user.role === 'freelancer' ? '+ Услуга' : '+ Продать'}</Link>}
      </div>
    </div>
  </header>;
}
