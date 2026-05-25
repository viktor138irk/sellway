import { useEffect, useState } from 'react';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Btn, Card, Input, Spinner } from '../../components/UI';
import { createPromo, disablePromo, getPromos } from '../../api/seller';
import { useToast } from '../../contexts/ToastContext';

const initial = { code: '', discount_pct: '', discount_fixed: '', max_uses: '', expires_at: '' };

export default function PromotionsPage() {
  const toast = useToast();
  const [promos, setPromos] = useState([]);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    getPromos().then(({ data }) => setPromos(data.promos || [])).catch(() => toast.error('Не удалось загрузить акции')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPromo(form);
      setForm(initial);
      toast.success('Промокод создан');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось создать промокод');
    } finally {
      setSaving(false);
    }
  }

  async function disable(id) {
    try {
      await disablePromo(id);
      toast.success('Промокод отключен');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отключить промокод');
    }
  }

  return <SellerLayout><div style={{ padding:'clamp(16px,4vw,28px)', display:'grid', gap:20, maxWidth:980 }} className="fade-in">
    <header>
      <h1 style={{ color:C.t1, fontSize:28, margin:'0 0 6px' }}>Акции</h1>
      <p style={{ color:C.t2, fontSize:13, margin:0 }}>Промокоды действуют на ваши товары и услуги при оформлении покупки.</p>
    </header>
    <Card style={{ padding:20 }}>
      <form onSubmit={submit} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12, alignItems:'end' }}>
        <Input label="Код" value={form.code} placeholder="WELCOME10" onChange={e=>setForm(v=>({ ...v, code:e.target.value.toUpperCase() }))} />
        <Input label="Скидка (%)" type="number" min="0" max="100" step="0.01" value={form.discount_pct} onChange={e=>setForm(v=>({ ...v, discount_pct:e.target.value, discount_fixed:'' }))} />
        <Input label="Или скидка (руб.)" type="number" min="0" step="0.01" value={form.discount_fixed} onChange={e=>setForm(v=>({ ...v, discount_fixed:e.target.value, discount_pct:'' }))} />
        <Input label="Лимит применений" type="number" min="1" value={form.max_uses} onChange={e=>setForm(v=>({ ...v, max_uses:e.target.value }))} />
        <Input label="Действует до" type="datetime-local" value={form.expires_at} onChange={e=>setForm(v=>({ ...v, expires_at:e.target.value }))} />
        <Btn type="submit" loading={saving}>Создать</Btn>
      </form>
    </Card>
    <Card style={{ overflow:'hidden' }}>
      <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, color:C.t1, fontWeight:700 }}>Ваши промокоды</div>
      {loading ? <div style={{ padding:42, display:'flex', justifyContent:'center' }}><Spinner/></div> : promos.length === 0 ? <div style={{ padding:36, textAlign:'center', color:C.t3 }}>Акций пока нет</div> : promos.map(p => {
        const expired = p.expires_at && new Date(p.expires_at) < new Date();
        const active = p.is_active && !expired && (!p.max_uses || p.used_count < p.max_uses);
        const discount = p.discount_pct ? `${Number(p.discount_pct).toLocaleString('ru')}%` : `${Number(p.discount_fixed).toLocaleString('ru')} ₽`;
        return <div key={p.id} style={{ display:'flex', gap:14, alignItems:'center', padding:'13px 18px', borderBottom:`1px solid ${C.border}`, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 150px' }}><div style={{ fontWeight:800, color:C.t1 }}>{p.code}</div><div style={{ fontSize:11, color:active ? C.green : C.t3 }}>{active ? 'Активен' : 'Отключен или истек'}</div></div>
          <div style={{ color:C.accent, fontWeight:800 }}>{discount}</div>
          <div style={{ color:C.t2, fontSize:12, minWidth:120 }}>{p.used_count || 0}{p.max_uses ? ` / ${p.max_uses}` : ''} использований</div>
          {p.is_active && <Btn size="sm" variant="ghost" onClick={()=>disable(p.id)}>Отключить</Btn>}
        </div>;
      })}
    </Card>
  </div></SellerLayout>;
}
