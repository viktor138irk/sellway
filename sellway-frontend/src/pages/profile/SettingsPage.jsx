import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getTelegramLink, uploadSellerAvatar } from '../../api/seller';
import { C, Btn, Input, Card } from '../../components/UI';
import UserAvatar from '../../components/UserAvatar';
import client from '../../api/client';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const avatarRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState(['profile', 'security', 'telegram', 'notifications'].includes(requestedTab) ? requestedTab : 'profile');
  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({ username: user?.username || '', phone: user?.phone || '' });
  const [smsCode, setSmsCode] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Password form
  const [pwd, setPwd] = useState({ current: '', new: '', confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});

  // Telegram
  const [tgLink, setTgLink]   = useState(null);
  const [tgAppLink, setTgAppLink] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [showQR, setShowQR]   = useState(false);

  useEffect(() => {
    if (['profile', 'security', 'telegram', 'notifications'].includes(requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  function selectTab(nextTab) {
    setTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.put('/auth/profile', profile);
      await refreshUser();
      toast.success('Профиль обновлён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(file) {
    if (!file) return;
    setAvatarLoading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await uploadSellerAvatar(fd);
      await refreshUser();
      toast.success(user?.role === 'buyer' ? 'Аватар обновлён' : 'Логотип магазина обновлён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось загрузить изображение');
    } finally {
      setAvatarLoading(false);
      if (avatarRef.current) avatarRef.current.value = '';
    }
  }

  async function resendEmailVerification() {
    setEmailLoading(true);
    try {
      const { data } = await client.post('/auth/resend-verification');
      toast.success(data.message || 'Письмо подтверждения отправлено');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отправить письмо подтверждения');
    } finally {
      setEmailLoading(false);
    }
  }

  async function sendSmsCode() {
    if (!profile.phone.trim()) return toast.warn('Введите номер телефона');
    setSmsLoading(true);
    try {
      await client.post('/auth/phone/send-code', { phone: profile.phone });
      toast.success('Код отправлен по SMS');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отправить SMS');
    } finally {
      setSmsLoading(false);
    }
  }

  async function verifySmsCode() {
    if (!smsCode.trim()) return toast.warn('Введите код из SMS');
    setSmsLoading(true);
    try {
      await client.post('/auth/phone/verify', { code: smsCode });
      await refreshUser();
      setSmsCode('');
      toast.success('Телефон подтверждён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Неверный код');
    } finally {
      setSmsLoading(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    const errs = {};
    if (!pwd.current) errs.current = 'Введите текущий пароль';
    if (pwd.new.length < 8) errs.new = 'Минимум 8 символов';
    if (pwd.new !== pwd.confirm) errs.confirm = 'Пароли не совпадают';
    if (Object.keys(errs).length) return setPwdErrors(errs);
    setPwdErrors({});
    setSaving(true);
    try {
      await client.post('/auth/change-password', { currentPassword: pwd.current, newPassword: pwd.new });
      toast.success('Пароль изменён');
      setPwd({ current: '', new: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Неверный текущий пароль');
    } finally {
      setSaving(false);
    }
  }

  async function closeOtherSessions() {
    setSessionsLoading(true);
    try {
      const { data } = await client.post('/auth/logout-other-sessions');
      toast.success(data.message || 'Другие сессии завершены');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось завершить сессии');
    } finally {
      setSessionsLoading(false);
    }
  }

  async function generateTelegramLink() {
    setTgLoading(true);
    try {
      const { data } = await getTelegramLink();
      setTgLink(data.link);
      setTgAppLink(data.appLink || data.link);
      toast.success('Ссылка сгенерирована');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка генерации ссылки');
    } finally {
      setTgLoading(false);
    }
  }

  async function copyTgLink() {
    await navigator.clipboard.writeText(tgLink);
    toast.success('Ссылка скопирована!');
  }

  const TABS = [['profile','Профиль'],['security','Безопасность'],['telegram','Telegram'],['notifications','Уведомления']];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px' }} className="fade-in">
      <h1 style={{ fontSize: 30, fontWeight: 650, color: C.t1, marginBottom: 24 }}>Настройки профиля</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 28 }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => selectTab(key)}
            style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === key ? C.accent : 'transparent'}`,
              color: tab === key ? C.accent : C.t2, padding: '10px 18px', fontSize: 13, fontWeight: tab === key ? 700 : 400,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1, transition: 'color .15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        <Card style={{ padding: 24 }}>
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
              <UserAvatar user={user} size={64} radius={8} background={C.accent} />
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{user?.username}</div>
                <div style={{ fontSize: 12, color: C.t2 }}>{user?.email}</div>
                <div style={{ fontSize: 11, color: user?.email_verified ? C.green : C.amber, marginTop: 3 }}>
                  {user?.email_verified ? 'Email подтверждён' : 'Email не подтверждён'}
                </div>
                {!user?.email_verified && <div style={{ marginTop:8 }}><Btn type="button" size="sm" variant="ghost" loading={emailLoading} onClick={resendEmailVerification}>Отправить письмо повторно</Btn></div>}
              </div>
              <div>
                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAvatar(e.target.files?.[0])} />
                <Btn type="button" variant="ghost" size="sm" loading={avatarLoading} onClick={() => avatarRef.current?.click()}>{user?.role === 'buyer' ? 'Сменить аватар' : 'Сменить логотип'}</Btn>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 5 }}>{user?.role === 'buyer' ? 'Показывается в вашем профиле' : 'Используется как логотип магазина'}</div>
              </div>
            </div>
            <Input label="Никнейм" value={profile.username}
              onChange={e => setProfile(p => ({ ...p, username: e.target.value }))} />
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Input label="Телефон" value={profile.phone} placeholder="+7 999 123-45-67"
                helper={user?.phone_verified ? 'Телефон подтверждён' : 'Нужен SMS-код подтверждения'}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'end' }}>
                <Input label="Код из SMS" value={smsCode} placeholder="123456"
                  onChange={e => setSmsCode(e.target.value)} />
                <Btn type="button" variant="ghost" loading={smsLoading} onClick={sendSmsCode}>Отправить код</Btn>
                <Btn type="button" loading={smsLoading} onClick={verifySmsCode}>Подтвердить</Btn>
              </div>
            </div>
            <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 13px' }}>
              <div style={{ fontSize: 12, color: C.t3, marginBottom: 2 }}>Email (нельзя изменить)</div>
              <div style={{ fontSize: 14, color: C.t2 }}>{user?.email}</div>
            </div>
            <Btn type="submit" loading={saving}>Сохранить изменения</Btn>
          </form>
        </Card>
      )}

      {/* Security tab */}
      {tab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 20 }}>Смена пароля</h3>
            <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Текущий пароль" type="password" value={pwd.current}
                onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} error={pwdErrors.current} />
              <Input label="Новый пароль" type="password" value={pwd.new}
                onChange={e => setPwd(p => ({ ...p, new: e.target.value }))} error={pwdErrors.new}
                helper="Минимум 8 символов" />
              <Input label="Подтвердите новый пароль" type="password" value={pwd.confirm}
                onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} error={pwdErrors.confirm} />
              <Btn type="submit" loading={saving}>Изменить пароль</Btn>
            </form>
          </Card>

          <Card style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 14 }}>Активные сессии</div>
            <div style={{ background: C.field, borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: C.t1 }}>Текущая сессия</div>
                <div style={{ fontSize: 11, color: C.t3 }}>Этот браузер · Сейчас</div>
              </div>
              <span style={{ fontSize: 10, background: C.green + '22', color: C.green, padding: '2px 8px', borderRadius: 20 }}>Активна</span>
            </div>
            <button type="button" disabled={sessionsLoading} onClick={closeOtherSessions} style={{ marginTop: 12, background: 'transparent', border: 'none', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Завершить все остальные сессии
            </button>
          </Card>
        </div>
      )}

      {/* Telegram tab */}
      {tab === 'telegram' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <div style={{ width: 50, height: 50, borderRadius: 8, background: C.infoBg, color:C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily:'var(--sw-serif)', fontSize: 20 }}>TG</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>Telegram-уведомления</div>
                <div style={{ fontSize: 12, color: C.t2 }}>Получайте уведомления о заказах, выплатах и спорах</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[['Новые заказы','Мгновенно при покупке'],['Зачисления','Когда деньги приходят на баланс'],['Споры','При открытии спора по вашему заказу'],['Выводы','Статус заявок на вывод средств']].map(([title, desc]) => (
                <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{title}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{desc}</div>
                  </div>
                  <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: '16px', background: C.field, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 12 }}>Как привязать Telegram</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: C.t2, marginBottom: 16 }}>
                {['1. Нажмите "Получить ссылку привязки"', '2. Перейдите по ссылке в Telegram', '3. Нажмите START в боте', '4. Готово — уведомления включены!'].map(s => (
                  <div key={s}>{s}</div>
                ))}
              </div>
              <Btn onClick={generateTelegramLink} loading={tgLoading} full>
                Получить ссылку привязки
              </Btn>
            </div>

            {tgLink && (
              <div style={{ marginTop: 16, background: C.infoBg, border: `1px solid ${C.accent}44`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>Ссылка привязки (действует 10 минут):</div>
                <div style={{ background: C.card, borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: C.accent, wordBreak: 'break-all', marginBottom: 12 }}>
                  {tgLink}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={copyTgLink} size="sm">Скопировать</Btn>
                  <a href={tgAppLink || tgLink} target="_blank" rel="noopener noreferrer">
                    <Btn size="sm" variant="ghost">Открыть в Telegram</Btn>
                  </a>
                </div>
              </div>
            )}
          </Card>

          <Card style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 12 }}>Команды бота</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['/start', 'Привязать аккаунт'],['/balance','Баланс и статистика'],['/orders','Последние заказы'],['/stop','Отключить уведомления']].map(([cmd, desc]) => (
                <div key={cmd} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                  <code style={{ color: C.accent, fontFamily: 'monospace', flexShrink: 0 }}>{cmd}</code>
                  <span style={{ color: C.t2 }}>{desc}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Notifications tab */}
      {tab === 'notifications' && (
        <Card style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 20 }}>События для уведомлений</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[['orders','Новые заказы','При создании/изменении заказа'],['payments','Выплаты','Зачисления и выводы средств'],['reviews','Отзывы','Новые отзывы на ваши товары'],['disputes','Споры','Открытие и решение споров']].map(([key, title, desc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{title}</div>
                    <div style={{ fontSize: 12, color: C.t2 }}>{desc}</div>
                  </div>
                </div>
                <span style={{ color:C.green, fontSize:12, fontWeight:700 }}>Включено</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize:12, color:C.t2 }}>Уведомления отправляются в привязанный Telegram и внутри сайта. Привязку можно изменить на вкладке Telegram.</div>
        </Card>
      )}
    </div>
  );
}
