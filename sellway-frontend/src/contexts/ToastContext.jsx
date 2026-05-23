import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((msg, type = 'success', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const success = useCallback((msg) => add(msg, 'success'), [add]);
  const error   = useCallback((msg) => add(msg, 'error', 5000), [add]);
  const info    = useCallback((msg) => add(msg, 'info'), [add]);
  const warn    = useCallback((msg) => add(msg, 'warn', 4000), [add]);

  const C = { success: '#34D399', error: '#F87171', info: '#7C6EFF', warn: '#FBBF24' };
  const ICON = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };

  return (
    <ToastContext.Provider value={{ success, error, info, warn }}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: '#1A1A26', border: `1px solid ${C[t.type]}44`,
            borderRadius: 12, padding: '13px 18px', minWidth: 280, maxWidth: 400,
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: `0 4px 24px ${C[t.type]}22`,
            animation: 'slideIn .2s ease',
          }}>
            <span style={{ color: C[t.type], fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{ICON[t.type]}</span>
            <span style={{ fontSize: 13, color: '#E8E8F0', flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }`}</style>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
