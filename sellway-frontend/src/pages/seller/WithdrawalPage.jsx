import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Card, Btn, Input } from '../../components/UI';
import { requestWithdraw, getDashboard } from '../../api/seller';

const METHODS = [
  { id:'card',   icon:'💳', label:'Банковская карта', fee:'2%' },
  { id:'sbp',    icon:'⚡', label:'СБП (Быстрые платежи)', fee:'1%' },
  { id:'paypal', icon:'🅿️', label:'PayPal', fee:'2%' },
  { id:'crypto', icon:'₿',  label:'Криптовалюта', fee:'1%' },
];

export default function WithdrawalPage() {
  const { user } = useAuth();
  const toast    = useToast();
  const [balance, setBalance] = useState(0);
  const [method, setMethod]   = useState('card');
  const [amount, setAmount]   = useState('');
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDashboard().then(r => setBalance(parseFloat(r.data.wallet?.balance || 0)));
  }, []);

  const feeRate = method === 'sbp' || method === 'crypto' ? 0.01 : 0.02;
  const fee     = amount ? Math.round(+amount * feeRate) : 0;
  const receive = amount ? +amount - fee : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || +amount < 500) return toast.warn('Минимальная сумма: 500 ₽');
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
            <div style={{ marginBottom: 20, padding: '16px', background: '#0A0A12', borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.t2, marginBottom: 4 }}>Доступно для вывода</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.t1 }}>{balance.toLocaleString('ru')} ₽</div>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 10 }}>Способ вывода</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {METHODS.map(m => (
                    <div key={m.id} onClick={() => setMethod(m.id)}
                      style={{ background: method===m.id ? C.accent+'18' : '#0A0A12', border: `1.5px solid ${method===m.id ? C.accent : C.border}`,
                        borderRadius: 10, padding: '12px', cursor: 'pointer', transition: 'all .15s' }}>
                      <div style={{ fontSize: 20, marginBottom: 5 }}>{m.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: method===m.id ? C.accent : C.t1 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: C.t3 }}>Комиссия {m.fee}</div>
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
                  style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px', color: C.t1, fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {[1000, 5000, 10000, 25000].map(v => (
                    <button key={v} type="button" onClick={() => setAmount(String(v))}
                      style={{ flex: 1, background: amount===String(v) ? C.accent+'25' : '#0A0A12', border: `1px solid ${amount===String(v) ? C.accent : C.border}`,
                        borderRadius: 7, padding: '7px 4px', color: amount===String(v) ? C.accent : C.t2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {(v/1000).toFixed(0)}к
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Реквизиты" value={account} onChange={e => setAccount(e.target.value)}
                placeholder={method==='card' ? 'Номер карты' : method==='sbp' ? 'Номер телефона' : method==='crypto' ? 'Адрес кошелька' : 'Email PayPal'} />
              <div style={{ background: '#0A0A12', borderRadius: 9, padding: '14px 16px' }}>
                {[['Сумма', amount ? `${parseFloat(amount).toLocaleString('ru')} ₽` : '—'],
                  [`Комиссия (${(feeRate*100).toFixed(0)}%)`, `${fee.toLocaleString('ru')} ₽`],
                  ['К получению', `${receive.toLocaleString('ru')} ₽`]].map(([l, v], i) => (
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
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 12 }}>📏 Лимиты</div>
              {[['Минимум', '500 ₽'],['Максимум в день','100 000 ₽'],['Время обработки','до 24 часов']].map(([l,v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <span style={{ color: C.t2 }}>{l}</span><span style={{ color: C.t1, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </SellerLayout>
  );
}
