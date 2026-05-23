import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Badge, Stars, Modal, Toggle } from '../../components/UI';
import { getUsers, updateUser } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const ROLE_COLOR  = { buyer: C.t2, seller: C.accent, admin: C.amber, moderator: '#A78BFA' };
const STATUS_COLOR = { active: C.green, banned: C.red, pending_verify: C.amber };
const STATUS_LABEL = { active: 'Активен', banned: 'Заблокирован', pending_verify: 'Ожидает верификации' };

function UserModal({ user, onClose, onSave }) {
  const [role, setRole]     = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(user.id, { role, status });
      toast.success('Пользователь обновлён');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  }

  return (
    <Modal title={`Пользователь: ${user.username}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Info */}
        <div style={{ background: '#0A0A12', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
          {[['Email', user.email], ['Роль текущая', user.role], ['Регистрация', new Date(user.created_at).toLocaleString('ru')],
            ['Последний вход', user.last_login_at ? new Date(user.last_login_at).toLocaleString('ru') : 'Никогда'],
            ['Баланс', `${parseFloat(user.balance || 0).toLocaleString('ru')} ₽`],
            ['Email подтверждён', user.email_verified ? '✓ Да' : '✕ Нет']].map(([l, v]) => (
            <div key={l}>
              <div style={{ color: C.t3, marginBottom: 2 }}>{l}</div>
              <div style={{ color: C.t1, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Роль</label>
          <select value={role} onChange={e => setRole(e.target.value)}
            style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="buyer">👤 Покупатель</option>
            <option value="seller">📦 Продавец</option>
            <option value="moderator">🔍 Модератор</option>
            <option value="admin">🛡 Администратор</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Статус</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="active">✅ Активен</option>
            <option value="pending_verify">⏳ Ожидает верификации</option>
            <option value="banned">🚫 Заблокирован</option>
          </select>
        </div>

        {status === 'banned' && (
          <div style={{ background: '#2A1010', border: `1px solid ${C.red}44`, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: C.red }}>
            ⚠️ Пользователь не сможет войти в систему
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn full variant="ghost" onClick={onClose}>Отмена</Btn>
          <Btn full loading={saving} onClick={handleSave}>Сохранить</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [role, setRole]       = useState('');
  const [status, setStatus]   = useState('');
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getUsers({ search, role, status, limit: 100 })
      .then(r => setUsers(r.data.users || []))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [search, role, status]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(id, data) {
    await updateUser(id, data);
    load();
  }

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px' }} className="fade-in">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>👥 Пользователи</h1>
          <div style={{ fontSize: 13, color: C.t2 }}>
            Всего: <span style={{ color: C.t1, fontWeight: 700 }}>{users.length}</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3, fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по никнейму / email..."
              style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px 9px 36px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          {[
            [role, setRole, [['', 'Все роли'], ['buyer', 'Покупатели'], ['seller', 'Продавцы'], ['admin', 'Администраторы']]],
            [status, setStatus, [['', 'Все статусы'], ['active', 'Активные'], ['banned', 'Заблокированные'], ['pending_verify', 'Ожидают']]],
          ].map(([val, setter, opts], i) => (
            <select key={i} value={val} onChange={e => setter(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 100px 100px 120px 80px 80px', gap: 12, padding: '10px 18px', background: '#0A0A12', borderBottom: `1px solid ${C.border}` }}>
            {['Пользователь', 'Email', 'Роль', 'Статус', 'Баланс', 'Продаж', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 800, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>
            ))}
          </div>

          {loading
            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}><Spinner size={32} /></div>
            : users.length === 0
              ? <div style={{ padding: 48, textAlign: 'center', color: C.t3, fontSize: 13 }}>Ничего не найдено</div>
              : users.map(u => (
                <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 100px 100px 120px 80px 80px', gap: 12, padding: '13px 18px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.cardHov}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: C.accent + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: C.accent, flexShrink: 0 }}>
                      {u.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{u.username}</div>
                      <div style={{ fontSize: 10, color: u.email_verified ? C.green : C.amber }}>{u.email_verified ? '✓ подтверждён' : '⚠ не подтверждён'}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>

                  <Badge color={ROLE_COLOR[u.role] || C.t2}>{u.role}</Badge>

                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: (STATUS_COLOR[u.status] || C.t3) + '22', color: STATUS_COLOR[u.status] || C.t3 }}>
                    {STATUS_LABEL[u.status] || u.status}
                  </span>

                  <div style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>{parseFloat(u.balance || 0).toLocaleString('ru')} ₽</div>
                  <div style={{ fontSize: 13, color: C.t2 }}>{u.total_sales || 0}</div>

                  <button onClick={() => setEditUser(u)}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.t2, borderRadius: 7, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✏️ Изменить
                  </button>
                </div>
              ))}
        </div>
      </div>

      {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSave} />}
    </AdminLayout>
  );
}
