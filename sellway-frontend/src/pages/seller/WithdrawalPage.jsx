import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Card, Btn, Input, Toggle } from '../../components/UI';
import { requestWithdraw, getDashboard, getWithdrawConfig, saveAutoPayout } from '../../api/seller';

export default function WithdrawalPage() {
  const { user } = useAuth();
  const toast    = useToast();
  const [balance, setBalance] = useState(0);
  const [method, setMethod]   = useState('card');
  const [methods, setMethods] = useState([]);
  const [limits, setLimits] = useState({ minAmount: 500, maxDaily: 100000 });
  const [usdtRate, setUsdtRate] = useState(0);
  const [autoPayout, setAutoPayout] = useState({ enabled: false, method: 'card', threshold: 500, requisites: { account: '' } });
  const [autoSaving, setAutoSaving] = useState(false);
  const [amount, setAmount]   = useState('');
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDashboard().then(r => setBalance(parseFloat(r.data.wallet?.balance || 0)));
    getWithdrawConfig().then(r => {
      const available = (r.data.methods || []).filter(m => m.enabled);
      setMethods(available);
      setLimits({ minAmount: r.data.minAmount || 500, maxDaily: r.data.maxDaily || 100000 });
      setUsdtRate(parseFloat(r.data.usdtRate || 0));
      setAutoPayout({
        enabled: Boolean(r.data.autoPayout?.enabled),
        method: r.data.autoPayout?.method || available[0]?.id || 'card',
        threshold: r.data.autoPayout?.threshold || r.data.autoPayoutMinBalance || r.data.minAmount || 500,
        requisites: r.data.autoPayout?.requisites || { account: '' },
      });
      if (available.length) setMethod(available[0].id);
    }).catch(()=>{});
  }, []);

  const selectedMethod = methods.find(m => m.id === method);
  const feeRate = selectedMethod?.commission || 0;
  const fee     = amount ? Math.round(+amount * feeRate) : 0;
  const receive = amount ? +amount - fee : 0;
  const toUsdt = (rub) => usdtRate > 0 ? (parseFloat(rub || 0) / usdtRate) : 0;
  const payoutPreview = method === 'crypto' ? `${toUsdt(receive).toLocaleString('ru', { maximumFractionDigits: 2 })} USDT` : `${receive.toLocaleString('ru')} ₽`;

  async function handleAutoSave() {
    setAutoSaving(true);
    try {
      await saveAutoPayout(autoPayout);
      toast.success('Настройки автовыплат сохранены');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения автовыплат');
    } finally {
      setAutoSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || +amount < limits.minAmount) return toast.warn(`Минимальная сумма: ${limits.minAmount.toLocaleString('ru')} ₽`);
    if (+amount > balance) return toast.warn('Недостаточно средств');
    if (!account.trim()) return toast.warn('Укажите реквизиты');
    setLoading(true);
    try {
      await requestWithdraw({ amount: +amount, method, requisites: { account: account.trim() } });
      toast.success('Заявка на вывод подана! Обработка до 24 часов.');
      setAmount(''); setAccount('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setLoading(false); }
  }

  return (
    <SellerLayout>
      <div style={{ padding: '28px', maxWidth: 800 }} className="fade-in">
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.t1, marginBottom: 24 }}>⬆️ Вывод средств</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <Card style={{ padding: 24 }}>
            <div style={{ marginBottom: 20, padding: '16px', background: C.field, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.t2, marginBottom: 4 }}>Доступно для вывода</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.t1 }}>{balance.toLocaleString('ru')} ₽</div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:10, fontSize:12, color:C.t2 }}>
                <span>Баланс: <b style={{ color:C.accent }}>{toUsdt(balance).toLocaleString('ru', { maximumFractionDigits: 2 })} USDT</b></span>
                <span>Будет выведено: <b style={{ color:C.green }}>{payoutPreview}</b></span>
              </div>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 10 }}>Способ вывода</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {methods.map(m => (
                    <div key={m.id} onClick={() => setMethod(m.id)}
                      style={{ background: method===m.id ? C.infoBg : C.field, border: `1.5px solid ${method===m.id ? C.accent : C.border}`,
                        borderRadius: 8, padding: '12px', cursor: 'pointer', transition: 'all .15s' }}>
                      <div style={{ fontSize: 20, marginBottom: 5 }}>{m.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: method===m.id ? C.accent : C.t1 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: C.t3 }}>Комиссия {(m.commission*100).toFixed(2).replace(/\.?0+$/,'')}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>Сумма (₽)</label>
                  <button type="button" onClick={() => setAmount(String(Math.floor(balance)))}
                    style={{ background: 'transparent', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Весь баланс
                  </button>
                </div>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                  style={{ width: '100%', background: C.field, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 13px', color: C.t1, fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {[1000, 5000, 10000, 25000].map(v => (
                    <button key={v} type="button" onClick={() => setAmount(String(v))}
                      style={{ flex: 1, background: amount===String(v) ? C.infoBg : C.field, border: `1px solid ${amount===String(v) ? C.accent : C.border}`,
                        borderRadius: 7, padding: '7px 4px', color: amount===String(v) ? C.accent : C.t2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {(v/1000).toFixed(0)}к
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Реквизиты" value={account} onChange={e => setAccount(e.target.value)}
                placeholder={selectedMethod?.placeholder || 'Реквизиты'} />
              <div style={{ background: C.field, borderRadius: 8, padding: '14px 16px' }}>
                {[['Сумма', amount ? `${parseFloat(amount).toLocaleString('ru')} ₽` : '—'],
                  [`Комиссия (${(feeRate*100).toFixed(0)}%)`, `${fee.toLocaleString('ru')} ₽`],
                  ['К получению', method === 'crypto' ? payoutPreview : `${receive.toLocaleString('ru')} ₽`]].map(([l, v], i) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: 13 }}>
                    <span style={{ color: C.t2 }}>{l}</span>
                    <span style={{ color: i===2 ? C.accent : C.t1, fontWeight: i===2 ? 800 : 400 }}>{v}</span>
                  </div>
                ))}
              </div>
              <Btn type="submit" full loading={loading} size="lg">Подать заявку на вывод</Btn>
            </form>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 12 }}>Лимиты</div>
              {[['Минимум', `${limits.minAmount.toLocaleString('ru')} ₽`],['Максимум в день',`${limits.maxDaily.toLocaleString('ru')} ₽`],['Время обработки','до 24 часов']].map(([l,v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <span style={{ color: C.t2 }}>{l}</span><span style={{ color: C.t1, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: 18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>Автовыплаты</div>
                  <div style={{ fontSize:11, color:C.t3, marginTop:2 }}>Автоматическая заявка при достижении порога</div>
                </div>
                <Toggle value={autoPayout.enabled} onChange={v => setAutoPayout(p => ({ ...p, enabled:v }))} />
              </div>
              <div style={{ display:'grid', gap:12 }}>
                <div>
                  <div style={{ fontSize:11, color:C.t2, fontWeight:700, marginBottom:6 }}>Метод</div>
                  <select value={autoPayout.method} onChange={e => setAutoPayout(p => ({ ...p, method:e.target.value }))} style={{ width:'100%', background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', color:C.t1, fontFamily:'inherit' }}>
                    {methods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <Input label="Порог (₽)" type="number" value={autoPayout.threshold} onChange={e => setAutoPayout(p => ({ ...p, threshold:e.target.value }))} />
                <Input label="Реквизиты" value={autoPayout.requisites?.account || ''} onChange={e => setAutoPayout(p => ({ ...p, requisites:{ ...(p.requisites || {}), account:e.target.value } }))} placeholder="Карта, телефон или USDT TRC20" />
                {autoPayout.method === 'crypto' && <div style={{ fontSize:12, color:C.t2, background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:10 }}>
                  При текущем балансе будет доступно примерно <b style={{ color:C.accent }}>{toUsdt(balance).toLocaleString('ru', { maximumFractionDigits: 2 })} USDT</b>.
                </div>}
                <Btn size="sm" loading={autoSaving} onClick={handleAutoSave}>Сохранить автовыплаты</Btn>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </SellerLayout>
  );
}
