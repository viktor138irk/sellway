import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Modal } from '../../components/UI';
import { getWithdrawals, approveWithdraw, rejectWithdraw } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

const METHOD_LABEL = { card:'💳 Карта', sbp:'⚡ СБП', paypal:'🅿️ PayPal', crypto:'₿ Крипто' };
const STATUS_STYLE = { pending:{ bg:C.amber+'22', color:C.amber }, processing:{ bg:'#60A5FA22', color:'#60A5FA' }, completed:{ bg:C.green+'22', color:C.green }, rejected:{ bg:C.red+'22', color:C.red } };

export default function WithdrawalsPage() {
  const toast = useToast();
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('pending');
  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectModal, setRejectModal]   = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    setLoading(true);
    getWithdrawals({ status: filter })
      .then(r => setList(r.data.withdrawals || []))
      .catch(() => toast.error('Ошибка'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleApprove(id) {
    setActionLoading(id);
    try { await approveWithdraw(id); toast.success('Выплата одобрена ✅'); setList(p => p.filter(w => w.id !== id)); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(''); }
  }

  async function handleReject() {
    setActionLoading(rejectModal);
    try { await rejectWithdraw(rejectModal, rejectReason); toast.success('Заявка отклонена'); setList(p => p.filter(w => w.id !== rejectModal)); setRejectModal(null); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(''); }
  }

  return (
    <AdminLayout>
      <div style={{ padding:'24px 28px' }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>💸 Выплаты</h1>
          <div style={{ display:'flex', gap:6 }}>
            {[['pending','Ожидают'],['processing','В обработке'],['completed','Выполненные'],['rejected','Отклонённые']].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} style={{ background:filter===v?C.accent:'transparent', border:`1px solid ${filter===v?'transparent':C.border}`, color:filter===v?'#fff':C.t2, borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{l}</button>
            ))}
          </div>
        </div>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        : list.length === 0 ? <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:60, textAlign:'center', color:C.t3 }}><div style={{ fontSize:36, marginBottom:12 }}>💸</div><div style={{ color:C.t2, fontSize:14 }}>Заявок нет</div></div>
        : <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'180px 1fr 120px 120px 100px 80px', gap:12, padding:'10px 18px', background:'#0A0A12', borderBottom:`1px solid ${C.border}` }}>
              {['Пользователь','Реквизиты','Сумма','К выплате','Статус',''].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase', letterSpacing:1 }}>{h}</div>)}
            </div>
            {list.map(w=>{
              const st = STATUS_STYLE[w.status] || STATUS_STYLE.pending;
              const req = typeof w.requisites === 'string' ? JSON.parse(w.requisites) : w.requisites;
              return (
                <div key={w.id} style={{ display:'grid', gridTemplateColumns:'180px 1fr 120px 120px 100px 80px', gap:12, padding:'13px 18px', borderBottom:`1px solid ${C.border}`, alignItems:'center', transition:'background .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.cardHov} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div><div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{w.username}</div><div style={{ fontSize:11, color:C.t2 }}>{METHOD_LABEL[w.method]||w.method}</div><div style={{ fontSize:10, color:C.t3 }}>{new Date(w.created_at).toLocaleString('ru')}</div></div>
                  <div style={{ fontSize:12, color:C.t2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req?.account || '—'}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{parseFloat(w.amount).toLocaleString('ru')} ₽</div>
                  <div><div style={{ fontSize:14, fontWeight:800, color:C.green }}>{parseFloat(w.net_amount).toLocaleString('ru')} ₽</div><div style={{ fontSize:10, color:C.t3 }}>ком. {parseFloat(w.commission).toLocaleString('ru')} ₽</div></div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:st.bg, color:st.color }}>{w.status}</span>
                  {filter === 'pending' && (
                    <div style={{ display:'flex', gap:5 }}>
                      <button onClick={()=>handleApprove(w.id)} disabled={actionLoading===w.id} style={{ background:C.green, border:'none', color:'#fff', borderRadius:7, padding:'5px 9px', fontSize:11, cursor:'pointer', fontWeight:700 }}>✅</button>
                      <button onClick={()=>{ setRejectModal(w.id); setRejectReason(''); }} style={{ background:'transparent', border:`1px solid ${C.red}`, color:C.red, borderRadius:7, padding:'5px 9px', fontSize:11, cursor:'pointer' }}>❌</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
      </div>
      {rejectModal && (
        <Modal title="Отклонить заявку" onClose={()=>setRejectModal(null)} width={420}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} placeholder="Причина отклонения..."
              style={{ width:'100%', background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:9, padding:'10px 13px', color:C.t1, fontSize:13, outline:'none', fontFamily:'inherit', resize:'vertical' }} />
            <div style={{ display:'flex', gap:10 }}>
              <Btn full variant="ghost" onClick={()=>setRejectModal(null)}>Отмена</Btn>
              <Btn full variant="danger" loading={actionLoading===rejectModal} disabled={!rejectReason.trim()} onClick={handleReject}>Отклонить</Btn>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
