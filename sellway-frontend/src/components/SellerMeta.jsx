import { C } from './UI';

export function formatDeliveryTime(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return 'Выдач еще нет';
  if (value < 60) return `~${Math.max(1, Math.round(value))} мин`;
  if (value < 1440) {
    const hours = value / 60;
    return `~${hours < 10 ? hours.toFixed(1).replace('.', ',') : Math.round(hours)} ч`;
  }
  const days = value / 1440;
  return `~${days < 10 ? days.toFixed(1).replace('.', ',') : Math.round(days)} дн`;
}

export default function SellerMeta({ seller, compact = false, hideEmpty = false }) {
  const minutes = seller?.seller_delivery_time_min ?? seller?.response_time_min;
  const hasDelivery = Number.isFinite(Number(minutes)) && Number(minutes) > 0;
  if (!seller?.seller_online && hideEmpty && !hasDelivery) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: compact ? 6 : 9, marginTop: compact ? 5 : 7, fontSize: compact ? 10 : 11, color: C.t3 }}>
      {seller?.seller_online && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />Онлайн</span>}
      <span style={{ color: hasDelivery ? C.t2 : C.t3 }}>Средняя выдача: {formatDeliveryTime(minutes)}</span>
    </div>
  );
}
