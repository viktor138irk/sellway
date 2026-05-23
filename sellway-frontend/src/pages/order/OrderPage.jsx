import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useOrderWebSocket } from '../../hooks/useOrderWebSocket';
import { getOrder, sendMessage, confirmOrder, openDispute, cancelOrder } from '../../api/orders';
import { C, Spinner, Btn, StatusBadge, Modal } from '../../components/UI';

function Step({ n, label, done, active }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? C.green : active ? C.accent : '#2A2A40', fontSize: 12, fontWeight: 800, color: '#fff', transition: 'background .3s' }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: 10, color: done || active ? C.t1 : C.t3, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

const STEPS = ['Оплата', 'Передача', 'Подтверждение'];
function getStep(status) {
  if (['pending','paid'].includes(status)) return 0;
  if (status === 'delivered' || status === 'delivering') return 1;
  if (['confirmed','disputed','cancelled','refunded'].includes(status)) return 2;
  return 0;
}

export default function OrderPage() {
  const { id }          = useParams();
  const { user }        = useAuth();
  const navigate        = useNavigate();
  const toast           = useToast();
  const [order, setOrder]     = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [msg, setMsg]           = useState('');
  const [sending, setSending]   = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [disputeModal, setDisputeModal]   = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showKey, setShowKey]             = useState(false);
  const bottomRef = useRef();

  // WebSocket
  const handleWsMessage = useCallback((data) => {
    if (data.type === 'message') {
      setMessages(prev => [...prev, data.payload]);
    } else if (data.type === 'order_update') {
      setOrder(prev => ({ ...prev, ...data.payload }));
    }
  }, []);

  const { send, ready } = useOrderWebSocket(id, handleWsMessage);

  useEffect(() => {
    loadOrder();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadOrder() {
    try {
      const { data } = await getOrder(id);
      setOrder(data.order);
      setMessages(data.messages);
    } catch {
      toast.error('Заказ не найден');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e) {
    e?.preventDefault();
    if (!msg.trim() || sending) return;
    const text = msg.trim();
    setMsg('');
    setSending(true);
    try {
      const { data } = await sendMessage(id, text);
      // Оптимистичное добавление + broadcast через WS
      send({ type: 'message', payload: data });
      setMessages(prev => [...prev, data]);
    } catch {
      toast.error('Не удалось отправить сообщение');
      setMsg(text);
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm() {
    setActionLoading('confirm');
    try {
      await confirmOrder(id);
      toast.success('Получение подтверждено! Средства переведены продавцу.');
      loadOrder();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setActionLoading('');
    }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) return toast.warn('Укажите причину спора');
    setActionLoading('dispute');
    try {
      await openDispute(id, disputeReason);
      toast.info('Спор открыт. Модератор рассмотрит в течение 24 часов.');
      setDisputeModal(false);
      loadOrder();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setActionLoading('');
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Spinner size={40} />
    </div>
  );
  if (!order) return null;

  const isBuyer  = user?.id === order.buyer_id;
  const step     = getStep(order.status);
  const closed   = ['confirmed', 'cancelled', 'refunded', 'disputed'].includes(order.status);

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px' }} className="fade-in">
      <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', color: C.t2, fontSize: 13, cursor: 'pointer', marginBottom: 20, fontFamily: 'inherit' }}>
        ← Назад
      </button>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: '#0A0A12', padding: '16px 22px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>Сделка {order.order_number}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{new Date(order.created_at).toLocaleString('ru')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusBadge status={order.status} />
              <span style={{ fontSize: 12, background: '#0A2A1A', color: C.green, padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}>
                🔒 Escrow
              </span>
            </div>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                <Step n={i + 1} label={s} done={i < step} active={i === step} />
                {i < STEPS.length - 1 && (
                  <div style={{ width: 60, height: 2, background: i < step ? C.accent : '#2A2A40', margin: '0 8px', marginBottom: 18, transition: 'background .3s' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Product info */}
        <div style={{ padding: '14px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{order.product_title}</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>
              {isBuyer ? `Продавец: ${order.seller_name}` : `Покупатель: ${order.buyer_name}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.t1 }}>{parseFloat(order.amount).toLocaleString('ru')} ₽</div>
            {!isBuyer && <div style={{ fontSize: 11, color: C.green }}>Вы получите: {parseFloat(order.seller_amount).toLocaleString('ru')} ₽</div>}
          </div>
        </div>

        {/* Key reveal (buyer only, after delivery) */}
        {isBuyer && order.key_value && ['delivered', 'confirmed'].includes(order.status) && (
          <div style={{ padding: '14px 22px', borderBottom: `1px solid ${C.border}`, background: '#0A1A0A' }}>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 8 }}>🔑 Ваш товар/ключ</div>
            {showKey ? (
              <div style={{ background: '#111', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: 14, color: C.t1, letterSpacing: 1, wordBreak: 'break-all' }}>
                {order.key_value}
              </div>
            ) : (
              <Btn size="sm" variant="green" onClick={() => setShowKey(true)} icon="👁">Показать ключ</Btn>
            )}
          </div>
        )}

        {/* Chat */}
        <div style={{ height: 340, overflowY: 'auto', padding: '16px 18px', background: '#0D0D15', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => {
            if (m.is_system) return (
              <div key={i} style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: C.t3, background: '#1A1A28', padding: '4px 12px', borderRadius: 20 }}>{m.message}</span>
              </div>
            );
            const isMe = m.sender_id === user?.id;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 8 }}>
                {!isMe && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.accent + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.accent, flexShrink: 0, alignSelf: 'flex-end' }}>
                    {m.sender_name?.[0]?.toUpperCase()}
                  </div>
                )}
                <div style={{ maxWidth: '72%' }}>
                  {!isMe && <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{m.sender_name}</div>}
                  <div style={{ borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '10px 14px',
                    background: isMe ? C.accent : '#1C1C2C' }}>
                    <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{m.message}</div>
                  </div>
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>
                    {new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!closed ? (
          <form onSubmit={handleSend} style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, background: C.card }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: ready ? C.green : C.t3, flexShrink: 0 }} title={ready ? 'Online' : 'Reconnecting...'} />
              <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Напишите сообщение..."
                style={{ flex: 1, background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <Btn type="submit" loading={sending} disabled={!msg.trim()}>→</Btn>
          </form>
        ) : (
          <div style={{ padding: '12px 18px', background: '#0A1A10', borderTop: `1px solid ${C.border}`, textAlign: 'center', fontSize: 12, color: C.t3 }}>
            Сделка закрыта
          </div>
        )}

        {/* Actions (buyer) */}
        {isBuyer && order.status === 'delivered' && (
          <div style={{ padding: '16px 20px', background: '#0A1E10', borderTop: `1px solid #1A4020` }}>
            <div style={{ fontSize: 13, color: C.green, fontWeight: 700, marginBottom: 12 }}>
              ✓ Товар передан продавцом. Проверьте и подтвердите получение.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn full variant="green" loading={actionLoading === 'confirm'} onClick={handleConfirm} icon="✅">
                Подтвердить получение
              </Btn>
              <Btn full variant="danger" onClick={() => setDisputeModal(true)}>
                ⚠️ Открыть спор
              </Btn>
            </div>
          </div>
        )}

        {/* Confirmed */}
        {order.status === 'confirmed' && (
          <div style={{ padding: '20px', background: '#0A1E10', borderTop: `1px solid #1A4020`, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginBottom: 6 }}>Сделка завершена!</div>
            <div style={{ fontSize: 13, color: C.t2 }}>
              {isBuyer ? 'Спасибо за покупку! Оставьте отзыв продавцу.' : 'Средства зачислены на ваш баланс.'}
            </div>
          </div>
        )}

        {/* Disputed */}
        {order.status === 'disputed' && (
          <div style={{ padding: '16px 20px', background: '#1E0A0A', borderTop: `1px solid #4A2020`, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 4 }}>⚠️ Спор открыт</div>
            <div style={{ fontSize: 12, color: C.t2 }}>Модератор рассмотрит обращение в течение 24 часов.</div>
          </div>
        )}
      </div>

      {/* Dispute modal */}
      {disputeModal && (
        <Modal title="Открыть спор" onClose={() => setDisputeModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
              Средства будут заморожены до решения модератора. Опишите проблему подробно.
            </p>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Причина спора</label>
              <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} rows={4}
                placeholder="Опишите проблему подробно..."
                style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9,
                  padding: '11px 13px', color: C.t1, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn full variant="ghost" onClick={() => setDisputeModal(false)}>Отмена</Btn>
              <Btn full variant="danger" loading={actionLoading === 'dispute'} onClick={handleDispute}>Открыть спор</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
