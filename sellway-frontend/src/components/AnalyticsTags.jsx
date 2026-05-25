import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getPublicSeoSettings } from '../api/publicSettings';

function addScript(id, src) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export default function AnalyticsTags() {
  const location = useLocation();
  const initializedGoogleId = useRef('');
  const initializedYandexId = useRef('');
  const googleTrackedLocation = useRef('');
  const yandexTrackedLocation = useRef('');
  const [settings, setSettings] = useState({ yandexMetrikaId: '', googleAnalyticsId: '' });
  const path = `${location.pathname}${location.search}`;
  const shouldTrack = !/^\/(admin|seller|profile|orders)(\/|$)/.test(location.pathname);

  useEffect(() => {
    let active = true;
    getPublicSeoSettings()
      .then(({ data }) => {
        if (active) setSettings({
          yandexMetrikaId: String(data?.yandexMetrikaId || ''),
          googleAnalyticsId: String(data?.googleAnalyticsId || ''),
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const { googleAnalyticsId, yandexMetrikaId } = settings;
    if (shouldTrack && googleAnalyticsId && initializedGoogleId.current !== googleAnalyticsId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
      addScript('sellway-google-tag', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAnalyticsId)}`);
      window.gtag('js', new Date());
      window.gtag('config', googleAnalyticsId, { send_page_view: false });
      initializedGoogleId.current = googleAnalyticsId;
    }
    if (shouldTrack && yandexMetrikaId && initializedYandexId.current !== yandexMetrikaId) {
      window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); };
      window.ym.l = window.ym.l || Date.now();
      addScript('sellway-yandex-metrika', 'https://mc.yandex.ru/metrika/tag.js');
      window.ym(Number(yandexMetrikaId), 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
      });
      initializedYandexId.current = yandexMetrikaId;
      yandexTrackedLocation.current = path;
    }
  }, [settings.googleAnalyticsId, settings.yandexMetrikaId, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack) return;
    if (settings.googleAnalyticsId && window.gtag && googleTrackedLocation.current !== path) {
      window.gtag('event', 'page_view', {
        page_location: window.location.href,
        page_path: path,
        page_title: document.title,
      });
      googleTrackedLocation.current = path;
    }
    if (settings.yandexMetrikaId && window.ym && yandexTrackedLocation.current !== path) {
      window.ym(Number(settings.yandexMetrikaId), 'hit', window.location.href, { title: document.title });
      yandexTrackedLocation.current = path;
    }
  }, [path, shouldTrack, settings.googleAnalyticsId, settings.yandexMetrikaId]);

  return null;
}
