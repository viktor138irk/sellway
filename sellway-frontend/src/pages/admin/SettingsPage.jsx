import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Toggle, Textarea } from '../../components/UI';
import { getAdminSettings, saveSettings, runSettingsAction } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

const PAGES = {
  finance: {
    title: 'Финансы',
    subtitle: 'Комиссии, системы вывода средств и правила сделок',
    groups: [
      { title: 'Финансы', keys: [
        ['default_seller_commission_rate','Комиссия с продаж по умолчанию','number','0.07','Удерживается с продажи, если у продавца нет индивидуальной ставки. 0.07 = 7%'],
        ['default_referral_commission_rate','Реферальный процент по умолчанию','number','0.01','Например: 0.01 = 1%'],
        ['withdrawal_commission','Резервная комиссия вывода','number','0.02','Используется только если у способа вывода не задана своя ставка'],
        ['min_withdrawal','Мин. сумма вывода (₽)','number','500',''],
        ['max_withdrawal_daily','Макс. вывод в день (₽)','number','100000',''],
        ['auto_payouts_enabled','Автовыплаты включены','toggle','true','Глобально разрешить продавцам автовыплаты'],
        ['auto_payout_min_balance','Мин. баланс для автовыплаты (₽)','number','500',''],
        ['auto_payout_interval_hours','Интервал автовыплат (часов)','number','24',''],
        ['usdt_rub_rate_fallback','Резервный курс USDT/RUB','number','90','Используется, если курс ЦБ недоступен'],
      ]},
      { title: 'Системы вывода средств', keys: [
        ['withdraw_method_card_enabled','Карты включены','toggle','true','Показывать вывод на банковские карты'],
        ['withdraw_method_card_commission','Комиссия вывода на карту','number','0.02','Для всех без индивидуальной ставки вывода. 0 = без комиссии'],
        ['withdraw_method_sbp_enabled','СБП включен','toggle','true','Показывать вывод через СБП'],
        ['withdraw_method_sbp_commission','Комиссия вывода через СБП','number','0.01','Для всех без индивидуальной ставки вывода. 0 = без комиссии'],
        ['withdraw_method_paypal_enabled','PayPal включен','toggle','true','Показывать вывод PayPal'],
        ['withdraw_method_paypal_commission','Комиссия вывода PayPal','number','0.02','Для всех без индивидуальной ставки вывода. 0 = без комиссии'],
        ['withdraw_method_crypto_enabled','Криптовалюта включена','toggle','true','Показывать вывод криптовалютой'],
        ['withdraw_method_crypto_commission','Комиссия вывода USDT','number','0','Вывод USDT выполняется без комиссии'],
      ]},
      { title: 'Сделки', keys: [
        ['escrow_auto_confirm_hours','Авто-подтверждение (часов)','number','48','Через сколько часов после выдачи сделка считается завершенной'],
        ['auto_review_rating','Оценка авто-отзыва','number','5','От 1 до 5'],
      ]},
    ],
  },
  telegram: {
    title: 'Настройки телеграм',
    subtitle: 'Бот, привязка аккаунтов и SOCKS5 для Telegram',
    groups: [
      { title: 'Telegram', keys: [
        ['TELEGRAM_BOT_TOKEN','Токен бота','password','','Токен от @BotFather'],
        ['TELEGRAM_BOT_USERNAME','Username бота','text','SellWayBot','Без символа @'],
        ['TELEGRAM_ADMIN_BOT_TOKEN','Токен админ-бота','password','','Отдельный бот для админских уведомлений'],
        ['TELEGRAM_ADMIN_BOT_USERNAME','Username админ-бота','text','','Без символа @'],
        ['TELEGRAM_ADMIN_CHAT_ID','Chat ID админа','text','','Для системных уведомлений'],
      ]},
      { title: 'SOCKS5 для Telegram', keys: [
        ['PROXY_ENABLED','Использовать SOCKS5','toggle','false','Нужно, если Telegram недоступен напрямую'],
        ['PROXY_SCHEME','Схема прокси','text','socks5h','Рекомендуется socks5h, чтобы DNS api.telegram.org резолвил прокси'],
        ['PROXY_HOST','Хост прокси','text','127.0.0.1','IP или домен прокси'],
        ['PROXY_PORT','Порт прокси','number','1080',''],
        ['PROXY_USERNAME','Логин прокси','text','','Оставь пустым, если авторизация не нужна'],
        ['PROXY_PASSWORD','Пароль прокси','password','','Оставь пустым, если авторизация не нужна'],
      ]},
    ],
  },
  notifications: {
    title: 'Уведомления',
    subtitle: 'SMTP для писем и SMSPilot для кодов подтверждения',
    groups: [
      { title: 'SMTP', keys: [
        ['SMTP_HOST','SMTP хост','text','smtp.yandex.ru','Например: smtp.yandex.ru'],
        ['SMTP_PORT','SMTP порт','number','465','Обычно 465 или 587'],
        ['SMTP_SECURE','Защищенное соединение','toggle','true','true для 465, false для 587'],
        ['SMTP_USER','SMTP пользователь','text','noreply@sellway.pro','Email отправителя'],
        ['SMTP_PASS','SMTP пароль','password','','Пароль приложения или почтового ящика'],
        ['SMTP_FROM','Email отправителя','text','noreply@sellway.pro','Должен быть разрешен SMTP-провайдером'],
        ['SMTP_FAMILY','IP-протокол подключения','number','4','Оставьте 4, если IPv6 на сервере не настроен'],
        ['SMTP_CONNECTION_TIMEOUT','Таймаут подключения (мс)','number','15000','Увеличьте только для медленных SMTP-серверов'],
      ]},
      { title: 'SMSPilot', keys: [
        ['SMSPILOT_ENABLED','Включить SMSPilot','toggle','false','Отправка SMS-кодов подтверждения'],
        ['SMSPILOT_API_KEY','API ключ','password','','Ключ из личного кабинета SMSPilot'],
        ['SMSPILOT_SENDER','Отправитель','text','','Имя отправителя, если оно настроено в SMSPilot'],
        ['SMS_CODE_TEMPLATE','Шаблон SMS','text','Ваш код подтверждения {{code}}','Используй {{code}} на месте кода'],
      ]},
    ],
  },
  system: {
    title: 'Система',
    subtitle: 'Платформа и опасная зона обслуживания',
    groups: [
      { title: 'Платформа', keys: [
        ['maintenance_mode','Режим обслуживания','toggle','false','Закрыть сайт для пользователей'],
        ['new_seller_requires_verify','Верификация продавцов','toggle','true','Требовать проверку новых продавцов'],
        ['terms_version','Версия правил площадки','text','1.0','Показывается в согласии при регистрации'],
        ['terms_title','Заголовок правил площадки','text','Правила SellWay',''],
        ['terms_content','Текст правил площадки','textarea','','Если заполнено, публичная страница /terms покажет этот текст вместо стандартных блоков'],
      ]},
    ],
  },
};

const RESTART_KEYS = new Set([
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_ADMIN_BOT_TOKEN', 'TELEGRAM_ADMIN_BOT_USERNAME', 'TELEGRAM_ADMIN_CHAT_ID',
  'PROXY_ENABLED', 'PROXY_SCHEME', 'PROXY_HOST', 'PROXY_PORT', 'PROXY_USERNAME', 'PROXY_PASSWORD',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'SMTP_FAMILY', 'SMTP_CONNECTION_TIMEOUT',
  'SMSPILOT_ENABLED', 'SMSPILOT_API_KEY', 'SMSPILOT_SENDER', 'SMS_CODE_TEMPLATE',
]);

function valueToString(raw, fallback = '') {
  let value = raw;
  let depth = 0;
  while (value && typeof value === 'object' && 'value' in value && depth < 5) {
    value = value.value;
    depth += 1;
  }
  if (value === undefined || value === null) return String(fallback ?? '');
  if (typeof value === 'object') return String(fallback ?? '');
  return String(value);
}

function SettingField({ item, value, changed, onChange }) {
  const [key, label, type, def, helper] = item;
  const val = valueToString(value, def);
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background: changed ? C.accent+'08' : 'transparent', gap:18, flexWrap:'wrap' }}>
      <div style={{ flex:'1 1 260px' }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.t1, marginBottom:2 }}>
          {label}{changed && <span style={{ marginLeft:8, fontSize:10, color:C.accent, fontWeight:800 }}>изменено</span>}
        </div>
        {helper && <div style={{ fontSize:11, color:C.t3 }}>{helper}</div>}
      </div>
      <div style={{ flex:'0 1 320px', display:'flex', justifyContent:'flex-end' }}>
        {type === 'toggle'
          ? <Toggle value={val === 'true'} onChange={v => onChange(key, v)} />
          : type === 'textarea'
            ? <Textarea rows={8} value={val} onChange={e => onChange(key, e.target.value)} style={{ width:300 }} />
            : <Input type={type} value={val} onChange={e => onChange(key, e.target.value)} autoComplete="new-password" style={{ width:type === 'number' ? 130 : 300, textAlign:type === 'number' ? 'right' : 'left' }} />}
      </div>
    </div>
  );
}

function DangerZone({ onAction, loading }) {
  const actions = [
    ['reset-moderation-stats', 'Сбросить статистику модерации', 'Очищает служебные поля модерации у товаров, статусы товаров не меняет.'],
    ['auto-confirm-expired', 'Принудительное завершение просроченных сделок', 'Завершает выданные сделки, у которых истек срок авто-подтверждения, и переводит средства продавцам.'],
  ];
  return (
    <div style={{ background:'#1A0808', border:`1px solid ${C.red}44`, borderRadius:16, overflow:'hidden' }}>
      <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.red}22` }}>
        <span style={{ fontSize:14, fontWeight:800, color:C.red }}>⚠️ Опасная зона</span>
      </div>
      <div style={{ padding:22, display:'flex', flexDirection:'column', gap:14 }}>
        {actions.map(([id, label, desc]) => (
          <div key={id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 300px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{label}</div>
              <div style={{ fontSize:11, color:C.t2, marginTop:2 }}>{desc}</div>
            </div>
            <button disabled={Boolean(loading)} onClick={() => onAction(id)} style={{ background:'transparent', border:`1px solid ${C.red}`, color:C.red, borderRadius:8, padding:'8px 14px', fontSize:12, cursor:loading ? 'wait' : 'pointer', fontFamily:'inherit', fontWeight:700, opacity:loading ? .65 : 1 }}>
              {loading === id ? 'Выполняю...' : 'Выполнить'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage({ page = 'finance' }) {
  const toast = useToast();
  const { user } = useAuth();
  const config = PAGES[page] || PAGES.finance;
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testChatId, setTestChatId] = useState('');
  const [changed, setChanged] = useState({});

  useEffect(() => {
    setLoading(true);
    getAdminSettings()
      .then(r => {
        const flat = {};
        Object.entries(r.data).forEach(([k, v]) => { flat[k] = valueToString(v); });
        setSettings(flat);
      })
      .catch(() => toast.error('Ошибка загрузки настроек'))
      .finally(() => setLoading(false));
  }, [page]);

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
        toast.warn('Сохранено. Перезапусти PM2 сервисы, чтобы env-настройки вступили в силу.');
      } else {
        toast.success('Настройки сохранены');
      }
      setChanged({});
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action, payload = {}, confirm = true) {
    if (confirm) {
      const confirmed = window.confirm('Выполнить действие? Операция применится сразу.');
      if (!confirmed) return;
    }
    setActionLoading(action);
    try {
      const { data } = await runSettingsAction(action, payload);
      toast.success(data.message || 'Готово');
    } catch (err) {
      const timeoutMessage = err.code === 'ECONNABORTED'
        ? 'Проверка превысила время ожидания. Проверьте сетевой доступ сервера к внешнему сервису.'
        : null;
      toast.error(err.response?.data?.error || timeoutMessage || err.message || 'Ошибка выполнения');
    } finally {
      setActionLoading('');
    }
  }

  if (loading) return <AdminLayout><div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding:'24px 28px', maxWidth:900 }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, gap:12, flexWrap:'wrap' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:900, color:C.t1, marginBottom:4 }}>{config.title}</h1>
            <p style={{ fontSize:13, color:C.t2 }}>{config.subtitle}</p>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            {Object.keys(changed).length > 0 && <span style={{ fontSize:12, color:C.amber, background:C.amber+'18', padding:'5px 12px', borderRadius:20, fontWeight:700 }}>{Object.keys(changed).length} изменений</span>}
            <Btn loading={saving} onClick={handleSave}>Сохранить</Btn>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {config.groups.map(group => (
            <div key={group.title} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
              <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background:'#0A0A12' }}>
                <span style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{group.title}</span>
              </div>
              <div>
                {group.keys.map(item => <SettingField key={item[0]} item={item} value={settings[item[0]]} changed={item[0] in changed} onChange={update} />)}
              </div>
            </div>
          ))}

          {page === 'finance' && (
            <div style={{ background:'#10101F', border:`1px solid ${C.accent}33`, borderRadius:12, padding:'14px 18px', color:C.t2, fontSize:12, lineHeight:1.65 }}>
              <b style={{ color:C.t1 }}>Как считаются комиссии:</b> ставка с продаж применяется к доходу от заказа. У каждого продавца можно задать индивидуальную ставку, включая <b style={{ color:C.green }}>0%</b>. Для вывода сначала проверяется индивидуальная ставка вывода, затем ставка выбранного способа; вывод USDT остается без комиссии.
            </div>
          )}

          {page === 'telegram' && (
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:22 }}>
              <div style={{ fontSize:14, fontWeight:800, color:C.t1, marginBottom:12 }}>Тест Telegram</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'end' }}>
                <Input label="Chat ID" value={testChatId || settings.TELEGRAM_ADMIN_CHAT_ID || ''} onChange={e => setTestChatId(e.target.value)} placeholder="123456789" />
                <Btn loading={actionLoading === 'test-telegram'} onClick={() => handleAction('test-telegram', { chatId: testChatId || settings.TELEGRAM_ADMIN_CHAT_ID }, false)}>Отправить тест</Btn>
              </div>
              <div style={{ marginTop:12 }}>
                <Btn variant="ghost" loading={actionLoading === 'test-telegram-connection'} onClick={() => handleAction('test-telegram-connection', {}, false)}>Проверить SOCKS5 и API Telegram</Btn>
              </div>
            </div>
          )}

          {page === 'notifications' && (
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:22 }}>
              <div style={{ fontSize:14, fontWeight:800, color:C.t1, marginBottom:12 }}>Тест SMTP</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'end' }}>
                <Input label="Email для теста" value={testEmail || user?.email || ''} onChange={e => setTestEmail(e.target.value)} placeholder="admin@example.com" />
                <Btn loading={actionLoading === 'test-smtp'} onClick={() => handleAction('test-smtp', { email: testEmail || user?.email }, false)}>Отправить тест</Btn>
              </div>
              <div style={{ color:C.t3, fontSize:11, lineHeight:1.55, marginTop:12 }}>Для сервера обычно подходят: порт 465 с защищенным соединением или порт 587 без него. Подключение выполняется по IPv4, чтобы не упираться в нерабочий IPv6 хостинга.</div>
            </div>
          )}

          {Object.keys(changed).some(key => RESTART_KEYS.has(key)) && (
            <div style={{ background:C.amber+'12', border:`1px solid ${C.amber}44`, borderRadius:12, padding:'14px 18px', color:C.amber, fontSize:12, fontWeight:700 }}>
              После сохранения Telegram, SOCKS5, SMTP или SMSPilot выполни на сервере: pm2 restart sellway-api sellway-bot sellway-admin-bot --update-env
            </div>
          )}

          {page === 'system' && <DangerZone onAction={handleAction} loading={actionLoading} />}
        </div>
      </div>
    </AdminLayout>
  );
}
