import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { C, Btn, Input } from '../../components/UI';

function AuthWrap({ children, title, sub }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 90px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚡</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: C.t1, marginBottom: 8 }}>{title}</h1>
          <p style={{ fontSize: 14, color: C.t2 }}>{sub}</p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 28 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────
export function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const { login }   = useAuth();
  const { error }   = useToast();
  const navigate    = useNavigate();
  const location    = useLocation();
  const from        = location.state?.from?.pathname || '/';

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'seller' || user.role === 'admin' ? '/seller' : from, { replace: true });
    } catch (err) {
      error(err.response?.data?.error || 'Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthWrap title="Добро пожаловать" sub="Войдите в свой аккаунт SellWay">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Email" type="email" value={form.email} placeholder="you@example.com"
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <Input label="Пароль" type="password" value={form.password} placeholder="Минимум 8 символов"
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link to="/forgot-password" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>Забыли пароль?</Link>
        </div>
        <Btn type="submit" full loading={loading} size="lg">Войти</Btn>
      </form>
      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: C.t2 }}>
        Нет аккаунта?{' '}
        <Link to="/register" style={{ color: C.accent, textDecoration: 'none', fontWeight: 700 }}>Зарегистрироваться</Link>
      </div>
    </AuthWrap>
  );
}

// ── Register ──────────────────────────────────────────
export function RegisterPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialRef = params.get('ref') || '';
  const initialRole = params.get('role') === 'seller' || initialRef ? 'seller' : 'buyer';
  const [form, setForm] = useState({ email: '', username: '', password: '', role: initialRole, ref: initialRef });
  const [errors, setErrors] = useState({});
  const [loading, setLoading]  = useState(false);
  const [done, setDone]        = useState(false);
  const { register } = useAuth();
  const { error: showError, success } = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      await register(form);
      setDone(true);
      success('Аккаунт создан! Проверьте email.');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        const errs = {};
        data.errors.forEach(e => { errs[e.path || e.param] = e.msg; });
        setErrors(errs);
      } else {
        showError(data?.error || 'Ошибка регистрации');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <AuthWrap title="Проверьте почту" sub="">
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>📧</div>
        <p style={{ color: C.t2, lineHeight: 1.6 }}>
          Мы отправили ссылку подтверждения на <strong style={{ color: C.t1 }}>{form.email}</strong>.<br />
          Перейдите по ней для активации аккаунта.
        </p>
        <Link to="/login"><Btn full>Войти</Btn></Link>
      </div>
    </AuthWrap>
  );

  return (
    <AuthWrap title="Создать аккаунт" sub="Присоединяйтесь к SellWay">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>Я хочу</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['buyer','🛒','Покупать'], ['seller','📦','Продавать']].map(([val, icon, label]) => (
              <div key={val} onClick={() => setForm(f => ({ ...f, role: val }))}
                style={{ background: form.role === val ? C.accent + '18' : '#0A0A12',
                  border: `1.5px solid ${form.role === val ? C.accent : C.border}`, borderRadius: 10,
                  padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: form.role === val ? C.accent : C.t1 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <Input label="Email" type="email" value={form.email} placeholder="you@example.com"
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} error={errors.email} required />
        <Input label="Никнейм" value={form.username} placeholder="только буквы, цифры, _"
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))} error={errors.username} required />
        <Input label="Пароль" type="password" value={form.password} placeholder="Минимум 8 символов"
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))} error={errors.password} required />
        {form.role === 'seller' && (
          <Input label="Реферальный код" value={form.ref} placeholder="если есть"
            onChange={e => setForm(f => ({ ...f, ref: e.target.value.trim() }))} error={errors.ref} />
        )}
        <Btn type="submit" full loading={loading} size="lg">Создать аккаунт</Btn>
      </form>
      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: C.t2 }}>
        Уже есть аккаунт?{' '}
        <Link to="/login" style={{ color: C.accent, textDecoration: 'none', fontWeight: 700 }}>Войти</Link>
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: C.t3, textAlign: 'center', lineHeight: 1.5 }}>
        Регистрируясь, вы соглашаетесь с{' '}
        <Link to="/terms" style={{ color: C.t2 }}>Условиями использования</Link>
      </div>
    </AuthWrap>
  );
}
