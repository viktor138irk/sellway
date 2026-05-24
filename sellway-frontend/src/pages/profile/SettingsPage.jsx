import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getTelegramLink, uploadSellerAvatar } from '../../api/seller';
import { C, Btn, Input, Card, Toggle, Modal } from '../../components/UI';
import client from '../../api/client';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const avatarRef = useRef(null);
  const [tab, setTab]   = useState('profile');
  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({ username: user?.username || '', phone: user?.phone || '' });
  const [smsCode, setSmsCode] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);

  // Password form
  const [pwd, setPwd] = useState({ current: '', new: '', confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});

  // Telegram
  const [tgLink, setTgLink]   = useState(null);
  const [tgAppLink, setTgAppLink] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [showQR, setShowQR]   = useState(false);

  // Notifications prefs
  const [notifPrefs, setNotifPrefs] = useState({
    orders: true, payments: true, reviews: true, disputes: true,
  });

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
      toast.success('Логотип магазина обновлён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось загрузить логотип');
    } finally {
      setAvatarLoading(false);
      if (avatarRef.current) avatarRef.current.value = '';
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

  const TABS = [['profile','👤 Профиль'],['security','🔒 Безопасность'],['telegram','✈️ Telegram'],['notifications','🔔 Уведомления']];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px' }} className="fade-in">
      <h1 style={{ fontSize: 22, fontWeight: 900, color: C.t1, marginBottom: 24 }}>⚙️ Настройки</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 28 }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
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
              <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg,${C.accent},#A78BFA)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user?.username?.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{user?.username}</div>
                <div style={{ fontSize: 12, color: C.t2 }}>{user?.email}</div>
                <div style={{ fontSize: 11, color: user?.email_verified ? C.green : C.amber, marginTop: 3 }}>
                  {user?.email_verified ? '✓ Email подтверждён' : '⚠ Email не подтверждён'}
                </div>
              </div>
              {['seller','freelancer','admin'].includes(user?.role) && <div>
                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAvatar(e.target.files?.[0])} />
                <Btn type="button" variant="ghost" size="sm" loading={avatarLoading} onClick={() => avatarRef.current?.click()}>Сменить логотип</Btn>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 5 }}>Используется как логотип магазина</div>
              </div>}
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
            <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px' }}>
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
              <Btn type="submit" loading={saving} icon="🔒">Изменить пароль</Btn>
            </form>
          </Card>

          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 4 }}>Двухфакторная аутентификация</div>
                <div style={{ fontSize: 12, color: C.t2 }}>Защитите аккаунт через TOTP (Google Authenticator)</div>
              </div>
              <Btn variant="ghost" size="sm">Включить 2FA</Btn>
            </div>
          </Card>

          <Card style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 14 }}>Активные сессии</div>
            <div style={{ background: '#0A0A12', borderRadius: 9, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: C.t1 }}>Текущая сессия</div>
                <div style={{ fontSize: 11, color: C.t3 }}>Этот браузер · Сейчас</div>
              </div>
              <span style={{ fontSize: 10, background: C.green + '22', color: C.green, padding: '2px 8px', borderRadius: 20 }}>Активна</span>
            </div>
            <button style={{ marginTop: 12, background: 'transparent', border: 'none', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
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
              <div style={{ width: 50, height: 50, borderRadius: 14, background: '#229ED9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>✈️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>Telegram-уведомления</div>
                <div style={{ fontSize: 12, color: C.t2 }}>Получайте уведомления о заказах, выплатах и спорах</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[['🛒 Новые заказы','Мгновенно при покупке'],['💰 Зачисления','Когда деньги приходят на баланс'],['⚠️ Споры','При открытии спора по вашему заказу'],['📤 Выводы','Статус заявок на вывод средств']].map(([title, desc]) => (
                <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{title}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{desc}</div>
                  </div>
                  <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: '16px', background: '#0A0A12', borderRadius: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 12 }}>Как привязать Telegram</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: C.t2, marginBottom: 16 }}>
                {['1. Нажмите "Получить ссылку привязки"', '2. Перейдите по ссылке в Telegram', '3. Нажмите START в боте', '4. Готово — уведомления включены!'].map(s => (
                  <div key={s}>{s}</div>
                ))}
              </div>
              <Btn onClick={generateTelegramLink} loading={tgLoading} full icon="🔗">
                Получить ссылку привязки
              </Btn>
            </div>

            {tgLink && (
              <div style={{ marginTop: 16, background: '#0A1A1A', border: `1px solid ${C.accent}44`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>Ссылка привязки (действует 10 минут):</div>
                <div style={{ background: '#0A0A12', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: C.accent, wordBreak: 'break-all', marginBottom: 12 }}>
                  {tgLink}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={copyTgLink} size="sm" icon="📋">Скопировать</Btn>
                  <a href={tgAppLink || tgLink} target="_blank" rel="noopener noreferrer">
                    <Btn size="sm" variant="ghost" icon="✈️">Открыть в Telegram</Btn>
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
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 20 }}>Настройки уведомлений</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[['orders','🛒','Новые заказы','При создании/изменении заказа'],['payments','💰','Выплаты','Зачисления и выводы средств'],['reviews','⭐','Отзывы','Новые отзывы на ваши товары'],['disputes','⚠️','Споры','Открытие и решение споров']].map(([key, icon, title, desc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{title}</div>
                    <div style={{ fontSize: 12, color: C.t2 }}>{desc}</div>
                  </div>
                </div>
                <Toggle value={notifPrefs[key]} onChange={v => setNotifPrefs(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <Btn onClick={() => toast.success('Настройки сохранены')} loading={saving}>Сохранить</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
