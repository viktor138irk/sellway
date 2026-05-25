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
  editorial: {
    bg: '#F6F0E7', card: '#FFFDF9', cardHov: '#F3E9DD',
    border: '#DDCFBF', accent: '#B65239', accentL: '#93402C',
    green: '#4D6B55', amber: '#B87A32', red: '#A43E34',
    t1: '#2C241F', t2: '#6B5B50', t3: '#917F72',
    field: '#F3ECE2', media: '#EBDED1', header: '#FFFDF9',
    soft: '#EFE2D5', infoBg: '#F4DFD4', toggle: '#CAB6A3',
    nav: '#312923', navText: '#EDDFD0', navMuted: '#B9A693',
    shadow: '0 16px 38px rgba(61,41,25,.12)',
  },
};

const ThemeContext = createContext({ theme: 'editorial', siteTheme: 'editorial' });

export function ThemeProvider({ children }) {
  const location = useLocation();
  const [siteTheme, setSiteTheme] = useState('editorial');
  const requestedTheme = new URLSearchParams(location.search).get('theme');
  const previewTheme = requestedTheme === 'classic' || requestedTheme === 'editorial' ? requestedTheme : null;
  const theme = previewTheme || siteTheme;

  Object.assign(C, PALETTES[theme]);

  useEffect(() => {
    let alive = true;
    getPublicTheme()
      .then(({ data }) => {
        if (alive) setSiteTheme(data?.theme === 'classic' ? 'classic' : 'editorial');
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
    document.documentElement.style.setProperty('--sw-nav', C.nav || C.header);
    document.documentElement.style.setProperty('--sw-nav-text', C.navText || C.t1);
    document.documentElement.style.setProperty('--sw-serif', "'Fraunces', Georgia, serif");
    document.documentElement.style.setProperty('--sw-sans', "'Manrope', 'Segoe UI', sans-serif");
    document.body.style.background = C.bg;
    document.body.style.color = C.t1;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'editorial' ? '#F6F0E7' : C.bg);
  }, [theme]);

  const value = useMemo(() => ({ theme, siteTheme }), [theme, siteTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
