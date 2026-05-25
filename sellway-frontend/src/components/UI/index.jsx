// ── Design tokens ────────────────────────────────────
export const C = {
  bg: '#0B0B12', card: '#111119', cardHov: '#16161F',
  border: '#1E1E2E', accent: '#7C6EFF', accentL: '#9B8FFF',
  green: '#34D399', amber: '#FBBF24', red: '#F87171',
  t1: '#E8E8F0', t2: '#8888A8', t3: '#55556A',
  field: '#0A0A12', media: '#0A0A14', header: '#0F0F18',
  soft: '#1A1A28', infoBg: '#1A2E4A', toggle: '#2A2A40',
  shadow: '0 12px 40px rgba(0,0,0,.55)',
};

// ── Button ───────────────────────────────────────────
import { useState } from 'react';

export function Btn({ children, onClick, variant = 'primary', size = 'md', full, disabled, loading, type = 'button', icon }) {
  const [h, setH] = useState(false);
  const bg = disabled || loading
    ? C.soft
    : variant === 'primary' ? (h ? C.accentL : C.accent)
    : variant === 'danger'  ? (h ? '#C04040' : '#3A1010')
    : variant === 'green'   ? (h ? '#2DBF8A' : C.green)
    : h ? C.cardHov : 'transparent';
  const border = variant === 'primary' || variant === 'green' ? 'none'
    : variant === 'danger' ? `1px solid #4A2020`
    : `1px solid ${C.border}`;
  const color = disabled || loading ? C.t3
    : variant === 'danger' ? C.red
    : variant === 'primary' || variant === 'green' ? '#fff'
    : C.t1;
  const pad = size === 'sm' ? '7px 14px' : size === 'lg' ? '13px 28px' : '10px 20px';
  const fs  = size === 'sm' ? 12 : size === 'lg' ? 15 : 13;
  return (
    <button type={type} onClick={disabled || loading ? undefined : onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: bg, border, color, borderRadius: 9, padding: pad, fontSize: fs, fontWeight: 700,
        cursor: disabled || loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        transition: 'all .15s', width: full ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
      {loading ? <Spinner size={14} /> : icon && <span>{icon}</span>}
      {children}
    </button>
  );
}

// ── Input ────────────────────────────────────────────
export function Input({ label, error, helper, type = 'text', ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>{label}</label>}
      <input type={type} {...props}
        style={{ background: C.field, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 9,
          padding: '11px 13px', color: C.t1, fontSize: 14, outline: 'none', fontFamily: 'inherit',
          transition: 'border-color .15s', width: '100%', ...props.style }} />
      {(error || helper) && <div style={{ fontSize: 11, color: error ? C.red : C.t3 }}>{error || helper}</div>}
    </div>
  );
}

// ── Textarea ─────────────────────────────────────────
export function Textarea({ label, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>{label}</label>}
      <textarea {...props}
        style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 9,
          padding: '11px 13px', color: C.t1, fontSize: 14, outline: 'none', fontFamily: 'inherit',
          resize: 'vertical', lineHeight: 1.5, ...props.style }} />
    </div>
  );
}

// ── Select ───────────────────────────────────────────
export function Select({ label, children, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>{label}</label>}
      <select {...props}
        style={{ background: C.field, border: `1px solid ${C.border}`, borderRadius: 9,
          padding: '11px 13px', color: C.t1, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', ...props.style }}>
        {children}
      </select>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────
export function Spinner({ size = 24, color = C.accent }) {
  return (
    <div style={{ width: size, height: size, border: `2px solid ${color}30`, borderTop: `2px solid ${color}`,
      borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
  );
}

// ── Modal ────────────────────────────────────────────
export function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 18, width, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: C.t1 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.t2, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Badge ────────────────────────────────────────────
export function Badge({ children, color = C.accent }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: color + '22', color, display: 'inline-block' }}>{children}</span>
  );
}

// ── Card ─────────────────────────────────────────────
export function Card({ children, style, hover, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: hover && h ? C.cardHov : C.card, border: `1px solid ${hover && h ? C.accent + '55' : C.border}`,
        borderRadius: 14, transition: 'all .18s', cursor: onClick ? 'pointer' : undefined, ...style }}>
      {children}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────
export function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11,
      background: value ? C.accent : C.toggle, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 20 : 3, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </div>
  );
}

// ── Stars ────────────────────────────────────────────
export function Stars({ n, size = 12 }) {
  return <span style={{ color: C.amber, fontSize: size }}>{'★'.repeat(Math.floor(n))}{'☆'.repeat(5 - Math.floor(n))}</span>;
}

// ── Status Badge ─────────────────────────────────────
const STATUS = {
  pending:   ['⏳', '#FBBF24', 'Ожидание'],
  paid:      ['💳', '#60A5FA', 'Оплачен'],
  delivering:['📬', '#A78BFA', 'Передача'],
  delivered: ['📦', '#34D399', 'Передан'],
  service_delivered: ['✓', '#34D399', 'На подтверждении'],
  confirmed: ['✅', '#34D399', 'Завершён'],
  disputed:  ['⚠️', '#F87171', 'Спор'],
  cancelled: ['❌', '#8888A8', 'Отменён'],
  refunded:  ['↩️', '#8888A8', 'Возврат'],
};
export function StatusBadge({ status }) {
  const [icon, color, label] = STATUS[status] || ['•', C.t3, status];
  return <Badge color={color}>{icon} {label}</Badge>;
}

// ── Global styles injection ───────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
  .fade-in { animation: fadeIn .2s ease }
  input::placeholder, textarea::placeholder { color: var(--sw-muted, #66758a) }
  select option { background: var(--sw-card, #111119); color: var(--sw-text, #E8E8F0) }
`;
document.head.appendChild(style);
