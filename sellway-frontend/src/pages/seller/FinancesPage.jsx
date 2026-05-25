import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner, Btn } from '../../components/UI';
import { getDashboard, getTransactions } from '../../api/seller';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useToast } from '../../contexts/ToastContext';

const money = value => `${parseFloat(value || 0).toLocaleString('ru')} ₽`;
const FILTERS = [['all', 'Все'], ['income', 'Начисления'], ['expenses', 'Списания'], ['withdrawals', 'Выводы']];
const TYPE_META = {
  credit: { title: 'Начисление', sign: '+', color: C.green },
  refund: { title: 'Возврат', sign: '+', color: C.green },
  hold: { title: 'Резервирование', sign: '-', color: C.amber },
  release: { title: 'Освобождение резерва', sign: '', color: C.t2 },
  debit: { title: 'Списание', sign: '-', color: C.red },
  commission: { title: 'Комиссия', sign: '-', color: C.red },
  withdrawal: { title: 'Вывод средств', sign: '-', color: C.red },
};
const STATUS_LABEL = { pending:'Ожидает обработки', processing:'В обработке', completed:'Выполнен', rejected:'Отклонен' };
const METHOD_LABEL = { card:'Карта', sbp:'СБП', paypal:'PayPal', crypto:'USDT' };

function TransactionAmount({ transaction }) {
  const meta = TYPE_META[transaction.type] || { sign:'', color:C.t1 };
  return <div style={{ color:meta.color, fontSize:14, fontWeight:900, whiteSpace:'nowrap' }}>{meta.sign}{money(transaction.amount)}</div>;
}

function TransactionInfo({ transaction }) {
  const meta = TYPE_META[transaction.type] || { title:transaction.type, color:C.t2 };
  return <div style={{ minWidth:0 }}>
    <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
      <span style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{meta.title}</span>
      {transaction.status && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.accent + '18', color:C.accent }}>{STATUS_LABEL[transaction.status] || transaction.status}</span>}
    </div>
    <div style={{ fontSize:11, color:C.t2, marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{transaction.description || transaction.product_title || 'Операция по счету'}</div>
    <div style={{ fontSize:10, color:C.t3, marginTop:3 }}>{new Date(transaction.created_at).toLocaleString('ru')}{transaction.method ? ` · ${METHOD_LABEL[transaction.method] || transaction.method}` : ''}</div>
  </div>;
}

export default function FinancesPage() {
  const [data, setData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const isMobile = useMediaQuery('(max-width: 760px)');
  const toast = useToast();

  useEffect(() => {
    getDashboard().then(r => setData(r.data)).catch(() => toast.error('Не удалось загрузить баланс')).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    setHistoryLoading(true);
    getTransactions({ filter }).then(r => setTransactions(r.data.transactions || [])).catch(() => {
      setTransactions([]);
      toast.error('Не удалось загрузить историю');
    }).finally(() => setHistoryLoading(false));
  }, [filter]);

  const wallet = data?.wallet;
  return (
    <SellerLayout>
      <div style={{ padding:isMobile ? '16px 12px' : '28px', maxWidth:920 }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:24 }}>
          <h1 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>Финансы</h1>
          <Link to="/seller/withdrawal"><Btn size="sm">Вывести средства</Btn></Link>
        </div>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        : <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'repeat(3,1fr)', gap:12 }}>
              {[['Доступный баланс', money(wallet?.balance), C.green], ['Заморожено', money(wallet?.held), C.amber], ['Всего получено', money(wallet?.total_in), C.t1]].map(([label, value, color]) => (
                <div key={label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'16px 18px' }}>
                  <div style={{ fontSize:12, color:C.t2, marginBottom:6 }}>{label}</div>
                  <div style={{ fontSize:22, fontWeight:900, color }}>{value}</div>
                </div>
              ))}
            </div>
            <section style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ fontSize:15, fontWeight:900, color:C.t1 }}>История транзакций</div>
                <div style={{ display:'flex', gap:6, overflowX:'auto' }}>
                  {FILTERS.map(([value, label]) => <button key={value} type="button" onClick={()=>setFilter(value)} style={{ background:filter===value ? C.accent : '#0A0A12', color:filter===value ? '#fff' : C.t2, border:`1px solid ${filter===value ? C.accent : C.border}`, borderRadius:8, padding:'7px 11px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', cursor:'pointer', fontFamily:'inherit' }}>{label}</button>)}
                </div>
              </div>
              {historyLoading ? <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner size={28}/></div>
              : transactions.length === 0 ? <div style={{ padding:42, textAlign:'center', color:C.t3, fontSize:13 }}>Операций пока нет</div>
              : <div>
                  {transactions.map(transaction => <div key={`${transaction.type}-${transaction.id}`} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr auto' : '1fr auto 110px', gap:12, alignItems:'center', padding:'13px 18px', borderBottom:`1px solid ${C.border}` }}>
                    <TransactionInfo transaction={transaction} />
                    <TransactionAmount transaction={transaction} />
                    {!isMobile && (transaction.order_id ? <Link to={`/orders/${transaction.order_id}`} style={{ color:C.accent, fontSize:11, textDecoration:'none', textAlign:'right', fontWeight:700 }}>Открыть заказ</Link> : <span />)}
                  </div>)}
                </div>}
            </section>
          </div>}
      </div>
    </SellerLayout>
  );
}
