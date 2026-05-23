import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Toggle } from '../../components/UI';
import { getAdminSettings, saveSettings } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const SECTIONS = [
  { title: '💰 Финансы', keys: [
    ['platform_commission','Комиссия платформы (доля)','number','0.07','Например: 0.07 = 7%'],
    ['withdrawal_commission','Комиссия при выводе (доля)','number','0.02',''],
    ['min_withdrawal','Мин. сумма вывода (₽)','number','500',''],
    ['max_withdrawal_daily','Макс. вывод в день (₽)','number','100000',''],
  ]},
  { title: '⏱ Сделки', keys: [
    ['escrow_auto_confirm_hours','Авто-подтверждение (часов)','number','48','Часов до авто-подтверждения'],
    ['auto_review_rating','Оценка авто-отзыва','number','5','От 1 до 5'],
  ]},
  { title: '🔧 Платформа', keys: [
    ['maintenance_mode','Режим обслуживания','toggle','false','Закрыть сайт для пользователей'],
    ['new_seller_requires_verify','Верификация продавцов','toggle','true','Требовать проверку новых продавцов'],
  ]},
  { title: '✈️ Telegram', keys: [
    ['TELEGRAM_BOT_TOKEN','Токен бота','password','','Токен от @BotFather'],
    ['TELEGRAM_BOT_USERNAME','Username бота','text','SellWayBot','Без символа @'],
    ['TELEGRAM_ADMIN_CHAT_ID','Chat ID админа','text','','Для системных уведомлений'],
  ]},
  { title: '🧦 SOCKS5 для Telegram', keys: [
    ['PROXY_ENABLED','Использовать SOCKS5','toggle','false','Нужно, если Telegram недоступен напрямую'],
    ['PROXY_HOST','Хост прокси','text','127.0.0.1','IP или домен прокси'],
    ['PROXY_PORT','Порт прокси','number','1080',''],
    ['PROXY_USERNAME','Логин прокси','text','','Оставь пустым, если авторизация не нужна'],
    ['PROXY_PASSWORD','Пароль прокси','password','','Оставь пустым, если авторизация не нужна'],
  ]},
];

const RESTART_KEYS = new Set([
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_ADMIN_CHAT_ID',
  'PROXY_ENABLED',
  'PROXY_HOST',
  'PROXY_PORT',
  'PROXY_USERNAME',
  'PROXY_PASSWORD',
]);

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [changed, setChanged]   = useState({});

  useEffect(() => {
    getAdminSettings()
      .then(r => {
        const flat = {};
        Object.entries(r.data).forEach(([k,v]) => { flat[k] = typeof v === 'object' ? v.value : v; });
        setSettings(flat);
      })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  function update(key, val) {
    setSettings(prev => ({ ...prev, [key]: String(val) }));
    setChanged(prev => ({ ...prev, [key]: String(val) }));
  }

  async function handleSave() {
    if (!Object.keys(changed).length) return toast.info('Нет изменений');
    setSaving(true);
    try {
      const { data } = await saveSettings(changed);
      if (data.restartRequired || Object.keys(changed).some(key => RESTART_KEYS.has(key))) {
        toast.warn('Сохранено. Перезапусти sellway-api и sellway-bot в PM2');
      } else {
        toast.success('Настройки сохранены ✅');
      }
      setChanged({});
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  }

  if (loading) return <AdminLayout><div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding:'24px 28px', maxWidth:800 }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:900, color:C.t1, marginBottom:4 }}>⚙️ Настройки платформы</h1>
            <p style={{ fontSize:13, color:C.t2 }}>Изменения применяются ко всем пользователям немедленно</p>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {Object.keys(changed).length > 0 && (
              <span style={{ fontSize:12, color:C.amber, background:C.amber+'18', padding:'5px 12px', borderRadius:20, fontWeight:700 }}>
                {Object.keys(changed).length} несохранённых изменений
              </span>
            )}
            <Btn loading={saving} onClick={handleSave}>Сохранить все</Btn>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {SECTIONS.map(section => (
            <div key={section.title} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
              <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background:'#0A0A12' }}>
                <span style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{section.title}</span>
              </div>
              <div style={{ padding:'6px 0' }}>
                {section.keys.map(([key, label, type, def, helper]) => {
                  const val = settings[key] ?? def;
                  const isChanged = key in changed;
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background: isChanged ? C.accent+'08' : 'transparent', transition:'background .2s' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.t1, marginBottom:2 }}>
                          {label}
                          {isChanged && <span style={{ marginLeft:8, fontSize:10, color:C.accent, fontWeight:800 }}>● изменено</span>}
                        </div>
                        {helper && <div style={{ fontSize:11, color:C.t3 }}>{helper}</div>}
                      </div>
                      <div style={{ marginLeft:24, flexShrink:0 }}>
                        {type === 'toggle'
                          ? <Toggle value={val === 'true'} onChange={v => update(key, v)} />
                          : <input type={type} value={val} onChange={e => update(key, e.target.value)}
                              autoComplete="new-password"
                              style={{ background:'#0A0A12', border:`1px solid ${isChanged ? C.accent : C.border}`, borderRadius:8, padding:'8px 12px', color:C.t1, fontSize:14, fontWeight:700, outline:'none', fontFamily:'inherit', width:type === 'number' ? 120 : 300, textAlign:type === 'number' ? 'right' : 'left', transition:'border-color .2s' }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(changed).some(key => RESTART_KEYS.has(key)) && (
            <div style={{ background:C.amber+'12', border:`1px solid ${C.amber}44`, borderRadius:12, padding:'14px 18px', color:C.amber, fontSize:12, fontWeight:700 }}>
              После сохранения Telegram/SOCKS5 настроек выполни на сервере: pm2 restart sellway-api sellway-bot --update-env
            </div>
          )}

          {/* Danger zone */}
          <div style={{ background:'#1A0808', border:`1px solid ${C.red}44`, borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.red}22` }}>
              <span style={{ fontSize:14, fontWeight:800, color:C.red }}>⚠️ Опасная зона</span>
            </div>
            <div style={{ padding:22, display:'flex', flexDirection:'column', gap:14 }}>
              {[['Сбросить статистику модерации','Очистить счётчики проверок (не удаляет данные)'],['Принудительное завершение просроченных сделок','Закрыть сделки старше 72ч без подтверждения'],].map(([label, desc]) => (
                <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div><div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{label}</div><div style={{ fontSize:11, color:C.t2, marginTop:2 }}>{desc}</div></div>
                  <button onClick={() => toast.warn('Функция в разработке')} style={{ background:'transparent', border:`1px solid ${C.red}`, color:C.red, borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:700, flexShrink:0, marginLeft:16 }}>
                    Выполнить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
