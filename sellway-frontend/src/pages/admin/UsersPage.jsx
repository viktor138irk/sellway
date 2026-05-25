import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Textarea, Badge, Modal } from '../../components/UI';
import { getUsers, updateUser } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';
import UserAvatar from '../../components/UserAvatar';
import SellerMeta from '../../components/SellerMeta';
import { sendAdminUserMessage } from '../../api/support';

const ROLE_COLOR = { buyer: C.t2, seller: C.green, freelancer: C.accent, admin: C.amber, moderator: C.amber };
const ROLE_LABEL = { buyer: 'Покупатель', seller: 'Продавец', freelancer: 'Фрилансер', admin: 'Админ', moderator: 'Модератор' };
const STATUS_COLOR = { active: C.green, banned: C.red, pending_verify: C.amber };
const STATUS_LABEL = { active: 'Активен', banned: 'Заблокирован', pending_verify: 'Ожидает' };
const COMMERCIAL_ROLES = ['seller', 'freelancer', 'admin'];
const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

function UserModal({ user, onClose, onSave }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [sellerSettings, setSellerSettings] = useState({
    seller_verified: Boolean(user.seller_verified),
    custom_commission_rate: user.custom_commission_rate ?? '',
    custom_withdrawal_commission_rate: user.custom_withdrawal_commission_rate ?? '',
    referral_commission_rate: user.referral_commission_rate ?? '0.0100',
    referred_by: user.referred_by_email || user.referred_by_username || '',
  });
  const [saving, setSaving] = useState(false);
  const [directMessage, setDirectMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const toast = useToast();
  const isCommercial = COMMERCIAL_ROLES.includes(role);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { role, status };
      if (isCommercial) {
        payload.seller_verified = sellerSettings.seller_verified;
        payload.custom_commission_rate = sellerSettings.custom_commission_rate;
        payload.custom_withdrawal_commission_rate = sellerSettings.custom_withdrawal_commission_rate;
        payload.referral_commission_rate = sellerSettings.referral_commission_rate;
        payload.referred_by = sellerSettings.referred_by;
      }
      await onSave(user.id, payload);
      toast.success('Пользователь обновлён');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  }

  async function handleMessage() {
    if (!directMessage.trim()) return toast.warn('Введите сообщение');
    setSendingMessage(true);
    try {
      await sendAdminUserMessage(user.id, directMessage);
      setDirectMessage('');
      toast.success('Сообщение отправлено пользователю');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка отправки сообщения');
    } finally {
      setSendingMessage(false);
    }
  }

  return (
    <Modal title={`Пользователь: ${user.username}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 12 }}>
          {[
            ['Email', user.email], ['Текущая роль', ROLE_LABEL[user.role] || user.role], ['Регистрация', new Date(user.created_at).toLocaleString('ru')],
            ['Последний вход', user.last_login_at ? new Date(user.last_login_at).toLocaleString('ru') : 'Никогда'], ['Баланс', money(user.balance)], ['Заморожено', money(user.held)],
          ].map(([l, v]) => <div key={l}><div style={{ color: C.t3, marginBottom: 2 }}>{l}</div><div style={{ color: C.t1, fontWeight: 700 }}>{v}</div></div>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Роль</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="buyer">Покупатель</option>
              <option value="seller">Продавец</option>
              <option value="freelancer">Фрилансер</option>
              <option value="moderator">Модератор</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Статус</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="active">Активен</option>
              <option value="pending_verify">Ожидает верификации</option>
              <option value="banned">Заблокирован</option>
            </select>
          </div>
        </div>

        {isCommercial && <div style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.t1 }}>{role === 'freelancer' ? 'Фрилансер' : 'Продавец'}: комиссии и реферальная система</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>Код создаётся автоматически для продавцов и фрилансеров.</div>
          </div>
          <SellerMeta seller={user} />
          <label style={{ display:'flex', gap:10, alignItems:'center', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'11px 12px', cursor:'pointer' }}>
            <input type="checkbox" checked={sellerSettings.seller_verified} onChange={e => setSellerSettings(s => ({ ...s, seller_verified:e.target.checked }))} style={{ accentColor:C.accent }} />
            <span style={{ color:C.t1, fontSize:13, fontWeight:700 }}>Аккаунт прошел модерацию и может публиковать {role === 'freelancer' ? 'услуги' : 'товары'}</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Input label="Индивидуальная комиссия с продаж" type="number" step="0.0001" min="0" max="0.5" value={sellerSettings.custom_commission_rate} helper="Пусто = общая ставка, 0 = без комиссии, 0.07 = 7%" onChange={e => setSellerSettings(s => ({ ...s, custom_commission_rate: e.target.value }))} />
            <Input label="Индивидуальная комиссия вывода" type="number" step="0.0001" min="0" max="0.5" value={sellerSettings.custom_withdrawal_commission_rate} helper="Пусто = ставка метода, 0 = вывод без комиссии" onChange={e => setSellerSettings(s => ({ ...s, custom_withdrawal_commission_rate: e.target.value }))} />
            <Input label="Реферальный процент" type="number" step="0.0001" min="0" max="0.5" value={sellerSettings.referral_commission_rate} helper="0.01 = 1% с оборота" onChange={e => setSellerSettings(s => ({ ...s, referral_commission_rate: e.target.value }))} />
          </div>
          <Input label="Реферер" value={sellerSettings.referred_by} placeholder="email, username или referral code" helper="Оставьте пустым, чтобы убрать реферера" onChange={e => setSellerSettings(s => ({ ...s, referred_by: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {[
              ['Код', user.referral_code || 'создастся', C.accent],
              ['Реф. доход', money(user.referral_earnings), C.green],
              ['Приглашено', user.referred_sellers_count || 0, C.t1],
              ['Оборот рефералов', money(user.referral_turnover), C.amber],
              ['Заказов рефералов', user.referral_orders_count || 0, C.t1],
            ].map(([l, v, color]) => <div key={l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}><div style={{ color: C.t3, fontSize: 11 }}>{l}</div><div style={{ color, fontWeight: 900, fontSize: 14, marginTop: 3, wordBreak: 'break-all' }}>{v}</div></div>)}
          </div>
        </div>}

        <div style={{ background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:14, display:'grid', gap:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>Личное сообщение</div>
          <div style={{ fontSize:12, color:C.t2 }}>Сообщение появится у пользователя в чате поддержки и в уведомлениях.</div>
          <Textarea rows={3} value={directMessage} onChange={e=>setDirectMessage(e.target.value)} placeholder="Напишите пользователю..." />
          <div><Btn loading={sendingMessage} onClick={handleMessage}>Отправить сообщение</Btn></div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}><Btn full variant="ghost" onClick={onClose}>Отмена</Btn><Btn full loading={saving} onClick={handleSave}>Сохранить</Btn></div>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getUsers({ search, role, status, limit: 100 }).then(r => setUsers(r.data.users || [])).catch(() => toast.error('Ошибка загрузки')).finally(() => setLoading(false));
  }, [search, role, status]);
  useEffect(() => { load(); }, [load]);
  async function handleSave(id, data) { await updateUser(id, data); load(); }

  return <AdminLayout><div style={{ padding: 'clamp(16px,4vw,28px)' }} className="fade-in">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}><h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>Пользователи</h1><div style={{ fontSize: 13, color: C.t2 }}>Всего: <span style={{ color: C.t1, fontWeight: 700 }}>{users.length}</span></div></div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по никнейму / email..." style={{ flex: 1, minWidth: 220, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
      <select value={role} onChange={e => setRole(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' }}><option value="">Все роли</option><option value="buyer">Покупатели</option><option value="seller">Продавцы</option><option value="freelancer">Фрилансеры</option><option value="moderator">Модераторы</option><option value="admin">Администраторы</option></select>
      <select value={status} onChange={e => setStatus(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' }}><option value="">Все статусы</option><option value="active">Активные</option><option value="banned">Заблокированные</option><option value="pending_verify">Ожидают</option></select>
    </div>
    {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div> : <div className="admin-users-list" style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
      <div className="admin-users-list-head" style={{ display:'grid', gridTemplateColumns:'minmax(220px,1.6fr) 150px 140px 130px 100px', gap:14, alignItems:'center', padding:'11px 16px', background:C.field, borderBottom:`1px solid ${C.border}` }}>
        {['Пользователь', 'Тип', 'Статус', 'Баланс', ''].map(label => <div key={label} style={{ fontSize:10, color:C.t3, fontWeight:800, textTransform:'uppercase' }}>{label}</div>)}
      </div>
      {users.length === 0 ? <div style={{ padding:42, textAlign:'center', color:C.t2 }}>Пользователи не найдены</div> : users.map(u => <div key={u.id} className="admin-user-row" style={{ display:'grid', gridTemplateColumns:'minmax(220px,1.6fr) 150px 140px 130px 100px', gap:14, alignItems:'center', padding:'12px 16px', borderBottom:`1px solid ${C.border}`, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <UserAvatar user={u} size={38} radius={10} initialsLength={1} background={(ROLE_COLOR[u.role] || C.accent) + '33'} style={{ color:ROLE_COLOR[u.role] || C.accent }} />
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:800, color:C.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.username}</div>
            <div style={{ fontSize:11, color:C.t3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
          </div>
        </div>
        <div><Badge color={ROLE_COLOR[u.role] || C.t2}>{ROLE_LABEL[u.role] || u.role}</Badge></div>
        <div style={{ color:STATUS_COLOR[u.status] || C.t3, fontWeight:800, fontSize:12 }}>{STATUS_LABEL[u.status] || u.status}</div>
        <div style={{ color:C.t1, fontWeight:800, fontSize:13 }}>{money(u.balance)}</div>
        <Btn size="sm" variant="ghost" onClick={() => setEditUser(u)}>Открыть</Btn>
      </div>)}
    </div>}
  </div>{editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSave} />}</AdminLayout>;
}
