import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Badge, Modal } from '../../components/UI';
import { getUsers, updateUser } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const ROLE_COLOR = { buyer: C.t2, seller: C.green, freelancer: C.accent, admin: C.amber, moderator: '#A78BFA' };
const ROLE_LABEL = { buyer: 'Покупатель', seller: 'Продавец', freelancer: 'Фрилансер', admin: 'Админ', moderator: 'Модератор' };
const STATUS_COLOR = { active: C.green, banned: C.red, pending_verify: C.amber };
const STATUS_LABEL = { active: 'Активен', banned: 'Заблокирован', pending_verify: 'Ожидает' };
const COMMERCIAL_ROLES = ['seller', 'freelancer', 'admin'];
const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

function UserModal({ user, onClose, onSave }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [sellerSettings, setSellerSettings] = useState({
    custom_commission_rate: user.custom_commission_rate ?? '',
    referral_commission_rate: user.referral_commission_rate ?? '0.0100',
    referred_by: user.referred_by_email || user.referred_by_username || '',
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isCommercial = COMMERCIAL_ROLES.includes(role);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { role, status };
      if (isCommercial) {
        payload.custom_commission_rate = sellerSettings.custom_commission_rate;
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

  return (
    <Modal title={`Пользователь: ${user.username}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 12 }}>
          {[
            ['Email', user.email], ['Текущая роль', ROLE_LABEL[user.role] || user.role], ['Регистрация', new Date(user.created_at).toLocaleString('ru')],
            ['Последний вход', user.last_login_at ? new Date(user.last_login_at).toLocaleString('ru') : 'Никогда'], ['Баланс', money(user.balance)], ['Заморожено', money(user.held)],
          ].map(([l, v]) => <div key={l}><div style={{ color: C.t3, marginBottom: 2 }}>{l}</div><div style={{ color: C.t1, fontWeight: 700 }}>{v}</div></div>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Роль</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="buyer">Покупатель</option>
              <option value="seller">Продавец</option>
              <option value="freelancer">Фрилансер</option>
              <option value="moderator">Модератор</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Статус</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="active">Активен</option>
              <option value="pending_verify">Ожидает верификации</option>
              <option value="banned">Заблокирован</option>
            </select>
          </div>
        </div>

        {isCommercial && <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.t1 }}>{role === 'freelancer' ? 'Фрилансер' : 'Продавец'}: комиссии и реферальная система</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>Код создаётся автоматически для продавцов и фрилансеров.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Input label="Персональная комиссия" type="number" step="0.0001" min="0" max="0.5" value={sellerSettings.custom_commission_rate} helper="Пусто = ставка по умолчанию. 0.07 = 7%" onChange={e => setSellerSettings(s => ({ ...s, custom_commission_rate: e.target.value }))} />
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
            ].map(([l, v, color]) => <div key={l} style={{ background: '#111119', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}><div style={{ color: C.t3, fontSize: 11 }}>{l}</div><div style={{ color, fontWeight: 900, fontSize: 14, marginTop: 3, wordBreak: 'break-all' }}>{v}</div></div>)}
          </div>
        </div>}

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
    {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>{users.map(u => <div key={u.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginBottom: 12 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><div style={{ width: 36, height: 36, borderRadius: 10, background: (ROLE_COLOR[u.role] || C.accent) + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: ROLE_COLOR[u.role] || C.accent }}>{u.username?.[0]?.toUpperCase()}</div><div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 800, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</div><div style={{ fontSize: 11, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div></div></div><Badge color={ROLE_COLOR[u.role] || C.t2}>{ROLE_LABEL[u.role] || u.role}</Badge></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}><div style={{ background: '#0A0A12', borderRadius: 9, padding: 9 }}><div style={{ fontSize: 10, color: C.t3 }}>Баланс</div><div style={{ color: C.t1, fontWeight: 800 }}>{money(u.balance)}</div></div><div style={{ background: '#0A0A12', borderRadius: 9, padding: 9 }}><div style={{ fontSize: 10, color: C.t3 }}>Статус</div><div style={{ color: STATUS_COLOR[u.status] || C.t3, fontWeight: 800 }}>{STATUS_LABEL[u.status] || u.status}</div></div></div>
      {COMMERCIAL_ROLES.includes(u.role) && <div style={{ background: '#10101F', border: `1px solid ${C.accent}22`, borderRadius: 10, padding: 10, marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: 11, color: C.t3 }}>Реф. код</span><b style={{ color: C.accent, fontSize: 12 }}>{u.referral_code || '—'}</b></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}><div><div style={{ fontSize: 10, color: C.t3 }}>Доход</div><div style={{ color: C.green, fontWeight: 800, fontSize: 12 }}>{money(u.referral_earnings)}</div></div><div><div style={{ fontSize: 10, color: C.t3 }}>Приглашено</div><div style={{ color: C.t1, fontWeight: 800, fontSize: 12 }}>{u.referred_sellers_count || 0}</div></div></div></div>}
      <Btn size="sm" full variant="ghost" onClick={() => setEditUser(u)}>Изменить</Btn>
    </div>)}</div>}
  </div>{editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSave} />}</AdminLayout>;
}
