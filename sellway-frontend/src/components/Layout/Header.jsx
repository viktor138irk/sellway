import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C, Spinner } from '../UI';
import { getNotifications, readAllNotifs } from '../../api/seller';

export default function Header() {
  const { user, logout }     = useAuth();
  const navigate             = useNavigate();
  const location             = useLocation();
  const [q, setQ]            = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUser, setShowUser]     = useState(false);
  const [notifs, setNotifs]         = useState([]);
  const [unread, setUnread]         = useState(0);
  const notifsRef = useRef();

  useEffect(() => {
    if (!user) return;
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handler = (e) => {
      if (!notifsRef.current?.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function loadNotifs() {
    try {
      const { data } = await getNotifications();
      setNotifs(data.slice(0, 10));
      setUnread(data.filter(n => !n.is_read).length);
    } catch {}
  }

  async function handleReadAll() {
    await readAllNotifs().catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
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
    ['/catalog?delivery=auto', '⚡ Авто-выдача'],
    ['/catalog?sort=newest', 'Новинки'],
  ];

  return (
    <header style={{ background: '#0F0F18', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 200 }}>
      {/* Top bar */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 58, display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, background: `linear-gradient(135deg,${C.accent},#A78BFA)`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚡</div>
          <span style={{ fontSize: 17, fontWeight: 900, color: C.t1, letterSpacing: -0.5 }}>SellWay</span>
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3, pointerEvents: 'none' }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск товаров..."
            style={{ width: '100%', background: '#141420', border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '8px 12px 8px 36px', color: C.t1, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
        </form>

        {/* Right */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {user ? (
            <>
              {/* Notifications */}
              <div ref={notifsRef} style={{ position: 'relative' }}>
                <button onClick={() => setShowNotifs(p => !p)}
                  style={{ width: 34, height: 34, borderRadius: 9, background: showNotifs ? '#1A1A28' : 'transparent',
                    border: `1px solid ${C.border}`, color: C.t2, fontSize: 15, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  🔔
                  {unread > 0 && (
                    <span style={{ position: 'absolute', top: -3, right: -3, width: 16, height: 16,
                      borderRadius: '50%', background: C.red, color: '#fff', fontSize: 9, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 9 ? '9+' : unread}</span>
                  )}
                </button>
                {showNotifs && (
                  <div style={{ position: 'absolute', top: 42, right: 0, width: 340, background: C.card,
                    border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 300 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>Уведомления</span>
                      {unread > 0 && <button onClick={handleReadAll} style={{ background: 'transparent', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Прочитать все</button>}
                    </div>
                    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Уведомлений нет</div>
                      ) : notifs.map(n => (
                        <div key={n.id} onClick={() => { if (n.link) navigate(n.link); setShowNotifs(false); }}
                          style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, cursor: n.link ? 'pointer' : 'default',
                            background: n.is_read ? 'transparent' : C.accent + '08', transition: 'background .15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = C.cardHov}
                          onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : C.accent + '08'}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 2 }}>{n.title}</div>
                          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4 }}>{n.body}</div>
                          <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>{new Date(n.created_at).toLocaleString('ru')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* User menu */}
              <div style={{ position: 'relative' }}>
                <div onClick={() => setShowUser(p => !p)}
                  style={{ width: 34, height: 34, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', cursor: 'pointer' }}>
                  {user.username?.slice(0, 2).toUpperCase()}
                </div>
                {showUser && (
                  <div onClick={() => setShowUser(false)} style={{ position: 'absolute', top: 42, right: 0, width: 200,
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 300, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{user.username}</div>
                      <div style={{ fontSize: 11, color: C.t2 }}>{user.email}</div>
                    </div>
                    {[
                      [user.role === 'seller' || user.role === 'admin' ? '/seller' : '/profile', '📊 Личный кабинет'],
                      ['/profile/settings', '⚙️ Настройки'],
                      ...(user.role === 'admin' ? [['/admin', '🛡 Админ-панель']] : []),
                    ].map(([to, label]) => (
                      <Link key={to} to={to} style={{ display: 'block', padding: '10px 16px', fontSize: 13, color: C.t2,
                        textDecoration: 'none', borderBottom: `1px solid ${C.border}`, transition: 'color .15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = C.t1}
                        onMouseLeave={e => e.currentTarget.style.color = C.t2}>{label}</Link>
                    ))}
                    <button onClick={handleLogout} style={{ width: '100%', background: 'transparent', border: 'none',
                      color: C.red, fontSize: 13, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                      🚪 Выйти
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.t2, borderRadius: 8,
                padding: '7px 14px', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Войти</Link>
              <Link to="/register" style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8,
                padding: '7px 16px', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}>Регистрация</Link>
            </>
          )}
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '0 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 0 }}>
          {navLinks.map(([to, label]) => (
            <Link key={to} to={to}
              style={{ padding: '9px 16px', fontSize: 13, color: location.pathname + location.search === to ? C.accent : C.t2,
                textDecoration: 'none', fontWeight: 600, borderBottom: `2px solid ${location.pathname === to.split('?')[0] ? C.accent : 'transparent'}`,
                transition: 'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = C.t1}
              onMouseLeave={e => e.currentTarget.style.color = location.pathname + location.search === to ? C.accent : C.t2}>
              {label}
            </Link>
          ))}
          {user?.role === 'seller' && (
            <Link to="/seller/products/new" style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: 13,
              color: C.accent, textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              + Продать
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
