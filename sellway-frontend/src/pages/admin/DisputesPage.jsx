import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Modal, StatusBadge } from '../../components/UI';
import { getDisputes, resolveDispute } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

function DisputeModal({ dispute, onClose, onResolve }) {
  const [winner, setWinner]       = useState('');
  const [resolution, setResolution] = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleResolve() {
    if (!winner) return;
    setLoading(true);
    await onResolve(dispute.id, { winner, resolution });
    setLoading(false);
    onClose();
  }

  return (
    <Modal title={`Спор по заказу ${dispute.order_number}`} onClose={onClose} width={580}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Participants */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[['🛒 Покупатель', dispute.buyer_name, 'buyer'], ['📦 Продавец', dispute.seller_name, 'seller']].map(([role, name, val]) => (
            <div key={val} onClick={() => setWinner(val)}
              style={{ background: winner === val ? (val==='buyer'?C.green:C.accent)+'18' : '#0A0A12',
                border: `2px solid ${winner===val ? (val==='buyer'?C.green:C.accent) : C.border}`,
                borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all .15s', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 4 }}>{role}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.t1, marginBottom: 8 }}>{name}</div>
              <div style={{ fontSize: 11, color: winner===val ? (val==='buyer'?C.green:C.accent) : C.t3, fontWeight: 700 }}>
                {winner===val ? '✓ Победитель' : 'Выбрать победителем'}
              </div>
            </div>
          ))}
        </div>

        {/* Order info */}
        <div style={{ background: '#0A0A12', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
          {[['Заказ', dispute.order_number],['Сумма', `${parseFloat(dispute.amount).toLocaleString('ru')} ₽`],
            ['Открыл', dispute.opener_name],['Дата', new Date(dispute.created_at).toLocaleString('ru')]].map(([l,v])=>(
            <div key={l}><div style={{ color:C.t3, marginBottom:2 }}>{l}</div><div style={{ color:C.t1, fontWeight:600 }}>{v}</div></div>
          ))}
        </div>

        {/* Reason */}
        <div style={{ background: '#1A100A', border: `1px solid ${C.amber}33`, borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 6 }}>ПРИЧИНА СПОРА</div>
          <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{dispute.reason}</div>
        </div>

        {/* Resolution */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.t2, display: 'block', marginBottom: 8 }}>Решение (для сторон)</label>
          <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3}
            placeholder="Опишите решение по спору..."
            style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.t1, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
        </div>

        {winner && (
          <div style={{ background: (winner==='buyer'?C.green:C.accent)+'15', border: `1px solid ${(winner==='buyer'?C.green:C.accent)}33`, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: winner==='buyer'?C.green:C.accent }}>
            {winner === 'buyer'
              ? `✅ Средства (${parseFloat(dispute.amount).toLocaleString('ru')} ₽) будут возвращены покупателю`
              : `✅ Средства будут переведены продавцу`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn full variant="ghost" onClick={onClose}>Закрыть</Btn>
          <Btn full disabled={!winner} loading={loading} onClick={handleResolve}>⚖️ Вынести решение</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function DisputesPage() {
  const toast = useToast();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('open');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    getDisputes({ status: filter })
      .then(r => setDisputes(r.data.disputes || []))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleResolve(id, data) {
    try {
      await resolveDispute(id, data);
      toast.success(`Спор решён в пользу ${data.winner === 'buyer' ? 'покупателя' : 'продавца'}`);
      setDisputes(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  }

  const FILTER_OPTS = [['open','🔴 Открытые'],['reviewing','🟡 На рассмотрении'],['resolved_buyer','🟢 Решены (покупатель)'],['resolved_seller','🟢 Решены (продавец)']];

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>⚖️ Споры / Арбитраж</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTER_OPTS.map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                style={{ background: filter===v ? C.accent : 'transparent', border: `1px solid ${filter===v?'transparent':C.border}`, color: filter===v?'#fff':C.t2, borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div>
          : disputes.length === 0
            ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>
                <div style={{ fontSize: 15, color: C.t2 }}>Споров нет</div>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {disputes.map(d => (
                  <div key={d.id} style={{ background: C.card, border: `1px solid ${d.status==='open'?C.red+'44':C.border}`, borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: C.accent, fontFamily: 'monospace', fontWeight: 700 }}>{d.order_number}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: d.status==='open' ? C.red+'22' : C.amber+'22',
                            color: d.status==='open' ? C.red : C.amber }}>
                            {d.status === 'open' ? '🔴 Открыт' : '🟡 Рассматривается'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: C.t2 }}>
                          {d.buyer_name} (покупатель) vs {d.seller_name} (продавец) · Открыл: <strong style={{ color: C.t1 }}>{d.opener_name}</strong>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.t1 }}>{parseFloat(d.amount).toLocaleString('ru')} ₽</div>
                        <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{new Date(d.created_at).toLocaleString('ru')}</div>
                      </div>
                      {filter === 'open' && <Btn size="sm" onClick={() => setSelected(d)}>⚖️ Рассмотреть</Btn>}
                      <button onClick={() => setSelected(d)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.t2, borderRadius: 7, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Детали
                      </button>
                    </div>
                    <div style={{ background: '#1A100A', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
                      <span style={{ color: C.amber, fontWeight: 700 }}>Причина: </span>{d.reason}
                    </div>
                    {d.resolution && (
                      <div style={{ background: '#0A1A0A', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.green, marginTop: 8 }}>
                        <span style={{ fontWeight: 700 }}>Решение: </span>{d.resolution}
                      </div>
                    )}
                  </div>
                ))}
              </div>}
      </div>

      {selected && <DisputeModal dispute={selected} onClose={() => setSelected(null)} onResolve={handleResolve} />}
    </AdminLayout>
  );
}
