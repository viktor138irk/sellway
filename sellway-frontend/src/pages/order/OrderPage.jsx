import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useOrderWebSocket } from '../../hooks/useOrderWebSocket';
import { getOrder, sendMessage, confirmOrder, rateBuyer, openDispute } from '../../api/orders';
import { sendServiceProposal, acceptServiceProposal } from '../../api/serviceOrders';
import { C, Spinner, Btn, StatusBadge, Modal, Input, Textarea, Stars } from '../../components/UI';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;
const isServiceOrder = o => o?.delivery_type === 'service' || o?.meta?.service;

function Step({ n, label, done, active }) {
  return <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}><div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:done?C.green:active?C.accent:'#2A2A40', fontSize:12, fontWeight:800, color:'#fff' }}>{done ? 'OK' : n}</div><span style={{ fontSize:10, color:done||active?C.t1:C.t3, whiteSpace:'nowrap' }}>{label}</span></div>;
}
function RatingPicker({ value, onChange, label = 'Оценка' }) {
  return <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
    <div style={{ fontSize:12, fontWeight:800, color:C.t2 }}>{label}</div>
    <div style={{ display:'flex', gap:6 }}>
      {[1,2,3,4,5].map(n => <button key={n} type="button" onClick={()=>onChange(n)} aria-label={`${n} из 5`} style={{ width:34, height:34, border:'none', background:'transparent', color:value >= n ? C.amber : C.t3, fontSize:28, cursor:'pointer', lineHeight:1, padding:0, filter:value >= n ? 'drop-shadow(0 0 7px rgba(245,158,11,.35))' : 'none' }}>★</button>)}
    </div>
  </div>;
}
function getSteps(order) { return isServiceOrder(order) ? ['Заявка','Смета','Работа','Финал'] : ['Оплата','Передача','Подтверждение']; }
function getStep(order) {
  if (isServiceOrder(order)) {
    const ns = order.meta?.negotiation_status;
    if (order.status === 'confirmed') return 3;
    if (order.status === 'paid' || ns === 'accepted') return 2;
    if (ns === 'awaiting_customer') return 1;
    return 0;
  }
  if (['pending','paid'].includes(order.status)) return 0;
  if (order.status === 'delivered' || order.status === 'delivering') return 1;
  if (['confirmed','disputed','cancelled','refunded'].includes(order.status)) return 2;
  return 0;
}

function ProposalPanel({ order, isBuyer, onReload }) {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const proposal = order.meta?.proposal;
  const waiting = order.meta?.negotiation_status === 'awaiting_customer';

  async function accept() {
    setLoading(true);
    try { await acceptServiceProposal(order.id); toast.success('Смета подтверждена, средства зарезервированы'); onReload(); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка подтверждения сметы'); }
    finally { setLoading(false); }
  }

  return <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background:'#10101F' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'start', flexWrap:'wrap' }}>
      <div>
        <div style={{ fontSize:13, fontWeight:900, color:C.accent, marginBottom:4 }}>Поэтапная услуга</div>
        <div style={{ fontSize:12, color:C.t2 }}>Стартовая цена: от {money(order.amount)}. Финальная смета утверждается заказчиком.</div>
      </div>
      {!isBuyer && order.status === 'pending' && <Btn size="sm" onClick={()=>setModal(true)}>{proposal ? 'Изменить смету' : 'Отправить смету'}</Btn>}
    </div>
    {proposal && <div style={{ marginTop:12, background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8 }}><b style={{ color:C.t1 }}>Смета</b><b style={{ color:C.t1 }}>{money(proposal.amount)}</b></div>
      {proposal.note && <div style={{ fontSize:12, color:C.t2, lineHeight:1.5, marginBottom:8 }}>{proposal.note}</div>}
      {proposal.steps?.length > 0 && <div style={{ display:'flex', flexDirection:'column', gap:6 }}>{proposal.steps.map((s,i)=><div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, background:'#111119', borderRadius:8, padding:'8px 10px' }}><span style={{ color:C.t2, fontSize:12 }}>{s.title}</span><span style={{ color:C.t1, fontSize:12, fontWeight:800 }}>{money(s.amount)}</span></div>)}</div>}
      {isBuyer && waiting && <div style={{ marginTop:12 }}><Btn full variant="green" loading={loading} onClick={accept}>Подтвердить смету и зарезервировать средства</Btn></div>}
      {!isBuyer && waiting && <div style={{ fontSize:11, color:C.amber, marginTop:10 }}>Ожидаем подтверждения заказчика.</div>}
    </div>}
    {!proposal && <div style={{ fontSize:12, color:C.t3, marginTop:10 }}>Смета ещё не отправлена.</div>}
    {modal && <ProposalModal order={order} onClose={()=>setModal(false)} onDone={()=>{setModal(false); onReload();}} />}
  </div>;
}

function ProposalModal({ order, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(order.meta?.proposal?.amount || order.amount || '');
  const [note, setNote] = useState(order.meta?.proposal?.note || '');
  const [steps, setSteps] = useState(order.meta?.proposal?.steps || [{ title:'', amount:'' }]);
  const [loading, setLoading] = useState(false);
  const patch = (i,k,v) => { const n=[...steps]; n[i]={...n[i],[k]:v}; setSteps(n); };
  async function save() {
    if (!amount || Number(amount) < 1) return toast.warn('Укажите сумму сметы');
    setLoading(true);
    try { await sendServiceProposal(order.id, { amount:Number(amount), note, steps:steps.filter(s=>s.title).map(s=>({ ...s, amount:Number(s.amount||0) })) }); toast.success('Смета отправлена заказчику'); onDone(); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка отправки сметы'); }
    finally { setLoading(false); }
  }
  return <Modal title="Смета по услуге" onClose={onClose} width={560}><div style={{ display:'flex', flexDirection:'column', gap:14 }}>
    <Input label="Итоговая стоимость" type="number" value={amount} onChange={e=>setAmount(e.target.value)} />
    <Textarea label="Комментарий" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Что входит, сроки, условия..." />
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><b style={{ color:C.t1, fontSize:13 }}>Этапы</b><Btn size="sm" variant="ghost" onClick={()=>setSteps([...steps,{title:'',amount:''}])}>+ Этап</Btn></div>
    {steps.map((s,i)=><div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 110px 34px', gap:8 }}><Input value={s.title} onChange={e=>patch(i,'title',e.target.value)} placeholder="Название этапа" /><Input type="number" value={s.amount} onChange={e=>patch(i,'amount',e.target.value)} placeholder="₽" /><button type="button" onClick={()=>setSteps(steps.filter((_,x)=>x!==i))} style={{ background:'#3A1010', border:`1px solid #4A2020`, color:C.red, borderRadius:8, cursor:'pointer' }}>x</button></div>)}
    <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}><Btn variant="ghost" onClick={onClose}>Отмена</Btn><Btn loading={loading} onClick={save}>Отправить</Btn></div>
  </div></Modal>;
}

export default function OrderPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);
  const [sellerRating, setSellerRating] = useState(5);
  const [sellerReview, setSellerReview] = useState('');
  const [buyerRating, setBuyerRating] = useState(5);
  const [buyerReview, setBuyerReview] = useState('');
  const [showKey, setShowKey] = useState(false);
  const bottomRef = useRef();
  const handleWsMessage = useCallback((data) => { if (data.type === 'message') setMessages(prev => [...prev, data.payload]); else if (data.type === 'order_update') setOrder(prev => ({ ...prev, ...data.payload })); }, []);
  const { send, ready } = useOrderWebSocket(id, handleWsMessage);
  useEffect(() => { loadOrder(); }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  async function loadOrder() { try { const { data } = await getOrder(id); setOrder(data.order); setMessages(data.messages); } catch { toast.error('Заказ не найден'); navigate('/'); } finally { setLoading(false); } }
  async function handleSend(e) { e?.preventDefault(); if (!msg.trim() || sending) return; const text=msg.trim(); setMsg(''); setSending(true); try { const { data } = await sendMessage(id, text); send({ type:'message', payload:data }); setMessages(prev=>[...prev,data]); } catch { toast.error('Не удалось отправить сообщение'); setMsg(text); } finally { setSending(false); } }
  async function handleConfirm() { setActionLoading('confirm'); try { await confirmOrder(id, { rating: sellerRating, comment: sellerReview }); toast.success('Получение подтверждено'); setConfirmModal(false); loadOrder(); } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); } finally { setActionLoading(''); } }
  async function handleRateBuyer() { setActionLoading('rate-buyer'); try { await rateBuyer(id, { rating: buyerRating, comment: buyerReview }); toast.success('Оценка покупателя сохранена'); loadOrder(); } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); } finally { setActionLoading(''); } }
  async function handleDispute() { if (!disputeReason.trim()) return toast.warn('Укажите причину спора'); setActionLoading('dispute'); try { await openDispute(id, disputeReason); toast.info('Спор открыт'); setDisputeModal(false); loadOrder(); } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); } finally { setActionLoading(''); } }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div>;
  if (!order) return null;
  const isBuyer = user?.id === order.buyer_id;
  const steps = getSteps(order);
  const step = getStep(order);
  const closed = ['confirmed','cancelled','refunded','disputed'].includes(order.status);
  const service = isServiceOrder(order);
  const deliveredKeys = Array.isArray(order.key_values) && order.key_values.length ? order.key_values : (order.key_value ? [order.key_value] : []);

  return <div style={{ maxWidth:780, margin:'0 auto', padding:'28px 20px' }} className="fade-in">
    <button onClick={()=>navigate(-1)} style={{ background:'transparent', border:'none', color:C.t2, fontSize:13, cursor:'pointer', marginBottom:20, fontFamily:'inherit' }}>← Назад</button>
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, overflow:'hidden' }}>
      <div style={{ background:'#0A0A12', padding:'16px 22px', borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:10, flexWrap:'wrap' }}><div><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>Сделка {order.order_number}</div><div style={{ fontSize:11, color:C.t3, marginTop:2 }}>{new Date(order.created_at).toLocaleString('ru')}</div></div><div style={{ display:'flex', alignItems:'center', gap:10 }}><StatusBadge status={order.status}/><span style={{ fontSize:12, background:'#0A2A1A', color:C.green, padding:'4px 12px', borderRadius:20, fontWeight:700 }}>Escrow</span></div></div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, overflowX:'auto' }}>{steps.map((s,i)=><div key={s} style={{ display:'flex', alignItems:'center' }}><Step n={i+1} label={s} done={i<step} active={i===step}/>{i<steps.length-1 && <div style={{ width:46, height:2, background:i<step?C.accent:'#2A2A40', margin:'0 8px', marginBottom:18 }}/>}</div>)}</div>
      </div>
      <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}><div><div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>{order.product_title}</div><div style={{ fontSize:12, color:C.t2, marginTop:2 }}>{isBuyer ? `${service?'Фрилансер':'Продавец'}: ${order.seller_name}` : `Покупатель: ${order.buyer_name}`}{!service && Number(order.quantity || 1) > 1 ? ` · ${order.quantity} шт.` : ''}</div>{!isBuyer && Number(order.buyer_reviews_count || 0) > 0 && <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5 }}><Stars n={order.buyer_rating} size={12}/><span style={{ fontSize:11, color:C.t3 }}>рейтинг покупателя {parseFloat(order.buyer_rating).toFixed(1)} · {order.buyer_reviews_count} оценок</span></div>}</div><div style={{ textAlign:'right' }}><div style={{ fontSize:18, fontWeight:900, color:C.t1 }}>{service && order.meta?.negotiation_status === 'requested' ? 'от ' : ''}{money(order.amount)}</div>{!isBuyer && <div style={{ fontSize:11, color:C.green }}>Вы получите: {money(order.seller_amount)}</div>}</div></div>
      {service && <ProposalPanel order={order} isBuyer={isBuyer} onReload={loadOrder}/>} 
      {isBuyer && deliveredKeys.length > 0 && ['delivered','confirmed'].includes(order.status) && <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background:'#0A1A0A' }}><div style={{ fontSize:12, color:C.green, fontWeight:700, marginBottom:8 }}>Ваши ключи ({deliveredKeys.length} шт.)</div>{showKey ? <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{deliveredKeys.map((key, i)=><div key={i} style={{ background:'#111', borderRadius:8, padding:'12px 16px', fontFamily:'monospace', fontSize:14, color:C.t1, letterSpacing:1, wordBreak:'break-all' }}>{key}</div>)}</div> : <Btn size="sm" variant="green" onClick={()=>setShowKey(true)}>Показать ключи</Btn>}</div>}
      {isBuyer && order.file && ['delivered','confirmed'].includes(order.status) && <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.border}`, background:'#0A1A0A' }}><div style={{ fontSize:12, color:C.green, fontWeight:700, marginBottom:8 }}>Ваш файл</div><a href={order.file.url} target="_blank" rel="noopener noreferrer" style={{ color:C.accent, fontSize:14, fontWeight:700, textDecoration:'none' }}>Скачать {order.file.filename || 'файл'}</a></div>}
      <div style={{ height:340, overflowY:'auto', padding:'16px 18px', background:'#0D0D15', display:'flex', flexDirection:'column', gap:12 }}>{messages.map((m,i)=>{ if(m.is_system) return <div key={i} style={{ textAlign:'center' }}><span style={{ fontSize:11, color:C.t3, background:'#1A1A28', padding:'4px 12px', borderRadius:20 }}>{m.message}</span></div>; const isMe=m.sender_id===user?.id; return <div key={i} style={{ display:'flex', justifyContent:isMe?'flex-end':'flex-start', gap:8 }}><div style={{ maxWidth:'72%' }}>{!isMe && <div style={{ fontSize:10, color:C.t3, marginBottom:4 }}>{m.sender_name}</div>}<div style={{ borderRadius:isMe?'14px 14px 4px 14px':'14px 14px 14px 4px', padding:'10px 14px', background:isMe?C.accent:'#1C1C2C' }}><div style={{ fontSize:13, color:'#fff', lineHeight:1.5 }}>{m.message}</div></div><div style={{ fontSize:10, color:C.t3, marginTop:3, textAlign:isMe?'right':'left' }}>{new Date(m.created_at).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</div></div></div>; })}<div ref={bottomRef}/></div>
      {!closed ? <form onSubmit={handleSend} style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8, background:C.card }}><div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}><div style={{ width:6, height:6, borderRadius:'50%', background:ready?C.green:C.t3, flexShrink:0 }}/><input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Напишите сообщение..." style={{ flex:1, background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 14px', color:C.t1, fontSize:13, outline:'none', fontFamily:'inherit' }}/></div><Btn type="submit" loading={sending} disabled={!msg.trim()}>→</Btn></form> : <div style={{ padding:'12px 18px', background:'#0A1A10', borderTop:`1px solid ${C.border}`, textAlign:'center', fontSize:12, color:C.t3 }}>Сделка закрыта</div>}
      {isBuyer && order.status === 'delivered' && <div style={{ padding:'16px 20px', background:'#0A1E10', borderTop:`1px solid #1A4020` }}><div style={{ fontSize:13, color:C.green, fontWeight:700, marginBottom:12 }}>Позиция передана. Сначала поставьте оценку, затем подтвердите получение.</div><div style={{ display:'flex', gap:10, flexWrap:'wrap' }}><Btn full variant="green" loading={actionLoading==='confirm'} onClick={()=>setConfirmModal(true)}>Оценить и подтвердить</Btn><Btn full variant="danger" onClick={()=>setDisputeModal(true)}>Открыть спор</Btn></div></div>}
      {order.status === 'confirmed' && <div style={{ padding:20, background:'#0A1E10', borderTop:`1px solid #1A4020`, textAlign:'center' }}><div style={{ fontSize:16, fontWeight:800, color:C.green, marginBottom:6 }}>Сделка завершена</div><div style={{ fontSize:13, color:C.t2 }}>{isBuyer ? 'Спасибо за покупку.' : 'Средства зачислены на ваш баланс.'}</div></div>}
      {!isBuyer && order.status === 'confirmed' && !order.buyer_review && <div style={{ padding:18, background:'#10101F', borderTop:`1px solid ${C.border}` }}><div style={{ fontSize:14, fontWeight:900, color:C.t1, marginBottom:12 }}>Оцените покупателя</div><div style={{ display:'grid', gap:12 }}><RatingPicker value={buyerRating} onChange={setBuyerRating} label="Рейтинг покупателя" /><Textarea rows={3} value={buyerReview} onChange={e=>setBuyerReview(e.target.value)} placeholder="Комментарий необязателен" /><Btn loading={actionLoading==='rate-buyer'} onClick={handleRateBuyer}>Сохранить оценку</Btn></div></div>}
      {!isBuyer && order.buyer_review && <div style={{ padding:16, background:'#10101F', borderTop:`1px solid ${C.border}` }}><div style={{ fontSize:12, color:C.t2, marginBottom:5 }}>Ваша оценка покупателя</div><Stars n={order.buyer_review.rating} size={14}/>{order.buyer_review.comment && <div style={{ marginTop:6, color:C.t2, fontSize:13 }}>{order.buyer_review.comment}</div>}</div>}
      {order.status === 'disputed' && <div style={{ padding:'16px 20px', background:'#1E0A0A', borderTop:`1px solid #4A2020`, textAlign:'center' }}><div style={{ fontSize:14, fontWeight:700, color:C.red, marginBottom:4 }}>Спор открыт</div><div style={{ fontSize:12, color:C.t2 }}>Модератор рассмотрит обращение.</div></div>}
    </div>
    {confirmModal && <Modal title="Оценка и подтверждение" onClose={()=>setConfirmModal(false)}><div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:13, color:C.t2, lineHeight:1.6 }}>После подтверждения сделка будет закрыта, а средства перейдут продавцу.</div>
      <RatingPicker value={sellerRating} onChange={setSellerRating} label="Оцените продавца" />
      <Textarea rows={4} value={sellerReview} onChange={e=>setSellerReview(e.target.value)} placeholder="Комментарий к отзыву необязателен" />
      <div style={{ display:'flex', gap:10 }}><Btn full variant="ghost" onClick={()=>setConfirmModal(false)}>Отмена</Btn><Btn full variant="green" loading={actionLoading==='confirm'} onClick={handleConfirm}>Подтвердить заказ</Btn></div>
    </div></Modal>}
    {disputeModal && <Modal title="Открыть спор" onClose={()=>setDisputeModal(false)}><div style={{ display:'flex', flexDirection:'column', gap:16 }}><p style={{ fontSize:13, color:C.t2, lineHeight:1.6 }}>Средства будут заморожены до решения модератора. Опишите проблему подробно.</p><textarea value={disputeReason} onChange={e=>setDisputeReason(e.target.value)} rows={4} placeholder="Опишите проблему..." style={{ width:'100%', background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:9, padding:'11px 13px', color:C.t1, fontSize:14, outline:'none', fontFamily:'inherit', resize:'vertical' }}/><div style={{ display:'flex', gap:10 }}><Btn full variant="ghost" onClick={()=>setDisputeModal(false)}>Отмена</Btn><Btn full variant="danger" loading={actionLoading==='dispute'} onClick={handleDispute}>Открыть спор</Btn></div></div></Modal>}
  </div>;
}
