import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { C } from '../components/UI';
import { getPublicTheme } from '../api/publicSettings';

const PALETTES = {
  classic: {
    bg: '#0B0B12', card: '#111119', cardHov: '#16161F',
    border: '#1E1E2E', accent: '#7C6EFF', accentL: '#9B8FFF',
    green: '#34D399', amber: '#FBBF24', red: '#F87171',
    t1: '#E8E8F0', t2: '#8888A8', t3: '#55556A',
    field: '#0A0A12', media: '#0A0A14', header: '#0F0F18',
    soft: '#1A1A28', infoBg: '#1A2E4A', toggle: '#2A2A40',
    shadow: '0 12px 40px rgba(0,0,0,.55)',
  },
  clear: {
    bg: '#F5F7FB', card: '#FFFFFF', cardHov: '#F7FAFF',
    border: '#DFE6F0', accent: '#1769F4', accentL: '#0C55D6',
    green: '#138A61', amber: '#CA7800', red: '#D43C4C',
    t1: '#122033', t2: '#536277', t3: '#8491A5',
    field: '#F7F9FC', media: '#EFF3F8', header: '#FFFFFF',
    soft: '#EDF3FF', infoBg: '#E8F1FF', toggle: '#C4CEDC',
    shadow: '0 12px 32px rgba(27,45,75,.12)',
  },
};

const ThemeContext = createContext({ theme: 'clear', siteTheme: 'clear' });
const privateArea = pathname => /^\/(admin|seller|profile|orders)(\/|$)/.test(pathname);

export function ThemeProvider({ children }) {
  const location = useLocation();
  const [siteTheme, setSiteTheme] = useState('clear');
  const requestedTheme = new URLSearchParams(location.search).get('theme');
  const previewTheme = requestedTheme === 'classic' || requestedTheme === 'clear' ? requestedTheme : null;
  const theme = privateArea(location.pathname) ? 'classic' : (previewTheme || siteTheme);

  Object.assign(C, PALETTES[theme]);

  useEffect(() => {
    let alive = true;
    getPublicTheme()
      .then(({ data }) => {
        if (alive) setSiteTheme(data?.theme === 'classic' ? 'classic' : 'clear');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--sw-bg', C.bg);
    document.documentElement.style.setProperty('--sw-card', C.card);
    document.documentElement.style.setProperty('--sw-text', C.t1);
    document.documentElement.style.setProperty('--sw-muted', C.t3);
    document.documentElement.style.setProperty('--sw-border', C.border);
    document.body.style.background = C.bg;
    document.body.style.color = C.t1;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'clear' ? '#FFFFFF' : C.bg);
  }, [theme]);

  const value = useMemo(() => ({ theme, siteTheme }), [theme, siteTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
