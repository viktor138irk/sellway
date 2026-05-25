import { useState, useEffect } from 'react';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Card, Btn, Input } from '../../components/UI';
import { requestWithdraw, getDashboard, getWithdrawConfig, saveAutoPayout } from '../../api/seller';
import { useToast } from '../../contexts/ToastContext';
import useMediaQuery from '../../hooks/useMediaQuery';

const METHOD_ICON = { card: '💳', sbp: '📱', paypal: '🌐', crypto: '₮' };

export default function WithdrawalPage() {
  const toast = useToast();
  const isMobile = useMediaQuery('(max-width: 860px)');
  const [balance, setBalance] = useState(0);
  const [method, setMethod] = useState('card');
  const [methods, setMethods] = useState([]);
  const [limits, setLimits] = useState({ minAmount: 500, maxDaily: 100000 });
  const [usdtRate, setUsdtRate] = useState(0);
  const [autoAllowed, setAutoAllowed] = useState(true);
  const [autoPayout, setAutoPayout] = useState({ enabled: false, threshold: 500 });
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  useEffect(() => {
    getDashboard().then(response => setBalance(Number(response.data.wallet?.balance || 0)));
    getWithdrawConfig().then(response => {
      const config = response.data;
      const available = (config.methods || []).filter(item => item.enabled);
      const savedMethod = available.some(item => item.id === config.autoPayout?.method) ? config.autoPayout.method : available[0]?.id || 'card';
      const savedAccount = config.autoPayout?.requisites?.account || '';
      setMethods(available);
      setLimits({ minAmount: config.minAmount || 500, maxDaily: config.maxDaily || 100000 });
      setUsdtRate(Number(config.usdtRate || 0));
      setAutoAllowed(config.autoPayoutsEnabled !== false);
      setAutoPayout({
        enabled: Boolean(config.autoPayout?.enabled),
        threshold: config.autoPayout?.threshold || config.autoPayoutMinBalance || config.minAmount || 500,
      });
      setMethod(savedMethod);
      setAccount(savedAccount);
    }).catch(() => toast.error('Не удалось загрузить способы вывода'));
  }, []);

  const selectedMethod = methods.find(item => item.id === method);
  const feeRate = Number(selectedMethod?.commission || 0);
  const fee = amount ? Number((Number(amount) * feeRate).toFixed(2)) : 0;
  const receive = amount ? Number(amount) - fee : 0;
  const toUsdt = rub => usdtRate > 0 ? Number(rub || 0) / usdtRate : 0;
  const payoutPreview = method === 'crypto' ? `${toUsdt(receive).toLocaleString('ru', { maximumFractionDigits: 2 })} USDT` : `${receive.toLocaleString('ru')} ₽`;

  async function saveAutomaticPreference() {
    if (autoPayout.enabled && !account.trim()) return toast.warn('Укажите реквизиты для автовыплаты');
    setAutoSaving(true);
    try {
      await saveAutoPayout({ enabled: autoPayout.enabled, method, threshold: autoPayout.threshold, requisites: { account: account.trim() } });
      toast.success(autoPayout.enabled ? 'Автовыплата сохранена' : 'Автовыплата отключена');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения автовыплаты');
    } finally {
      setAutoSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!amount || Number(amount) < limits.minAmount) return toast.warn(`Минимальная сумма: ${limits.minAmount.toLocaleString('ru')} ₽`);
    if (Number(amount) > balance) return toast.warn('Недостаточно средств');
    if (!account.trim()) return toast.warn('Укажите реквизиты');
    setLoading(true);
    try {
      await requestWithdraw({ amount: Number(amount), method, requisites: { account: account.trim() } });
      if (autoAllowed) {
        await saveAutoPayout({ enabled: autoPayout.enabled, method, threshold: autoPayout.threshold, requisites: { account: account.trim() } });
      }
      toast.success(autoPayout.enabled ? 'Заявка подана, реквизиты автовыплаты сохранены' : 'Заявка на вывод подана');
      setBalance(current => Math.max(0, current - Number(amount)));
      setAmount('');
      if (!autoPayout.enabled) setAccount('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка вывода средств');
    } finally {
      setLoading(false);
    }
  }

  return <SellerLayout>
    <div style={{ padding:'clamp(16px,4vw,28px)', maxWidth:920 }} className="fade-in">
      <h1 style={{ fontSize:24, fontWeight:800, color:C.t1, marginBottom:22 }}>💳 Вывод средств</h1>
      <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'minmax(360px,1fr) 255px', gap:18 }}>
        <Card style={{ padding:'clamp(16px,3vw,24px)' }}>
          <div style={{ marginBottom:20, padding:16, background:C.field, borderRadius:8, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:11, color:C.t2, marginBottom:4 }}>Доступно для вывода</div>
            <div style={{ fontSize:28, fontWeight:900, color:C.t1 }}>{balance.toLocaleString('ru')} ₽</div>
            <div style={{ fontSize:12, color:C.t2, marginTop:8 }}>Эквивалент: <b style={{ color:C.accent }}>{toUsdt(balance).toLocaleString('ru', { maximumFractionDigits:2 })} USDT</b></div>
          </div>
          <form onSubmit={handleSubmit} style={{ display:'grid', gap:16 }}>
            <label style={{ display:'grid', gap:7 }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.t2 }}>Способ вывода</span>
              <select value={method} onChange={event => setMethod(event.target.value)} style={{ width:'100%', background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:'11px 12px', color:C.t1, fontSize:13, fontFamily:'inherit' }}>
                {methods.map(item => <option key={item.id} value={item.id}>{METHOD_ICON[item.id] || ''} {item.label} · комиссия {(Number(item.commission) * 100).toFixed(2).replace(/\.?0+$/, '')}%</option>)}
              </select>
            </label>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.t2 }}>Сумма (₽)</label>
                <button type="button" onClick={() => setAmount(String(Math.floor(balance)))} style={{ border:0, background:'transparent', color:C.accent, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Весь баланс</button>
              </div>
              <input type="number" min={limits.minAmount} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" style={{ width:'100%', boxSizing:'border-box', background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:'11px 13px', color:C.t1, fontSize:16, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
            </div>
            <Input label="Реквизиты" value={account} onChange={event => setAccount(event.target.value)} placeholder={selectedMethod?.placeholder || 'Укажите реквизиты'} />
            {autoAllowed && <div style={{ background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:14, display:'grid', gap:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, color:C.t1, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={autoPayout.enabled} onChange={event => setAutoPayout(current => ({ ...current, enabled:event.target.checked }))} style={{ accentColor:C.accent, width:17, height:17 }} />
                Автовыплата
              </label>
              {autoPayout.enabled && <>
                <Input label="Порог выплаты (₽)" type="number" min={limits.minAmount} value={autoPayout.threshold} onChange={event => setAutoPayout(current => ({ ...current, threshold:event.target.value }))} helper="При достижении порога заявка создаётся автоматически на сохранённые реквизиты." />
                <div style={{ fontSize:11, color:C.t2 }}>Способ и реквизиты сохранятся после подачи заявки или по кнопке ниже.</div>
              </>}
              <div><Btn size="sm" type="button" variant="ghost" loading={autoSaving} onClick={saveAutomaticPreference}>{autoPayout.enabled ? 'Сохранить автовыплату' : 'Отключить автовыплату'}</Btn></div>
            </div>}
            <div style={{ background:C.field, borderRadius:8, padding:'12px 14px' }}>
              {[['Сумма', amount ? `${Number(amount).toLocaleString('ru')} ₽` : '—'], [`Комиссия (${(feeRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)`, `${fee.toLocaleString('ru')} ₽`], ['К получению', payoutPreview]].map(([label, value], index) => <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'6px 0', borderTop:index ? `1px solid ${C.border}` : 'none', fontSize:13 }}><span style={{ color:C.t2 }}>{label}</span><b style={{ color:index === 2 ? C.green : C.t1 }}>{value}</b></div>)}
            </div>
            <Btn type="submit" full loading={loading} size="lg">Подать заявку на вывод</Btn>
          </form>
        </Card>
        <Card style={{ padding:18, alignSelf:'start' }}>
          <div style={{ fontSize:14, fontWeight:800, color:C.t1, marginBottom:12 }}>Лимиты</div>
          {[['Минимум', `${limits.minAmount.toLocaleString('ru')} ₽`], ['Максимум в день', `${limits.maxDaily.toLocaleString('ru')} ₽`], ['Обработка', 'до 24 часов']].map(([label, value]) => <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'8px 0', borderBottom:`1px solid ${C.border}`, fontSize:12 }}><span style={{ color:C.t2 }}>{label}</span><b style={{ color:C.t1 }}>{value}</b></div>)}
        </Card>
      </div>
    </div>
  </SellerLayout>;
}
