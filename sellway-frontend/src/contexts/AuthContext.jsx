import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Восстановление сессии при загрузке
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      getMe()
        .then(({ data }) => setUser(data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !['seller', 'freelancer', 'admin'].includes(user.role)) return undefined;
    const touchPresence = () => {
      if (document.visibilityState === 'visible') getMe().catch(() => {});
    };
    touchPresence();
    const timer = window.setInterval(touchPresence, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', touchPresence);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', touchPresence);
    };
  }, [user?.id, user?.role]);

  const login = useCallback(async (email, password) => {
    const { data } = await apiLogin({ email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    // data.user уже содержит balance/rating (с фиксом #13)
    // но если бэкенд старый - подстрахуемся через getMe
    if (data.user.balance === undefined) {
      const me = await getMe();
      setUser(me.data);
      return me.data;
    }
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (formData) => {
    const { data } = await apiRegister(formData);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const rt = localStorage.getItem('refreshToken');
    await apiLogout(rt).catch(() => {});
    localStorage.clear();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser(prev => ({ ...prev, ...patch }));
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await getMe();
    setUser(data);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
