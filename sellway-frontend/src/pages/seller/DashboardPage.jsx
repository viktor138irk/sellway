import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Card, Spinner, StatusBadge, Btn } from '../../components/UI';
import { getDashboard } from '../../api/seller';

function StatCard({ icon, label, value, sub, color = C.accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {sub && <span style={{ fontSize: 11, color: C.t3 }}>{sub}</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.t2 }}>{label}</div>
    </div>
  );
}

export default function SellerDashboard() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <SellerLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <Spinner size={40} />
      </div>
    </SellerLayout>
  );

  const { wallet, seller, referral, recentOrders = [], products = [] } = data || {};
  const nextPayout = wallet?.balance * 0.7; // упрощённо

  return (
    <SellerLayout>
      <div style={{ padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.t1, marginBottom: 4 }}>Дашборд</h1>
          <p style={{ fontSize: 13, color: C.t2 }}>{new Date().toLocaleDateString('ru', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Balance + Payout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px' }}>
            <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>Баланс аккаунта</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: C.t1, marginBottom: 16 }}>
              {parseFloat(wallet?.balance || 0).toLocaleString('ru')} ₽
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to="/seller/withdrawal"><Btn size="sm" icon="⬆️">Вывести</Btn></Link>
              <Link to="/seller/finances"><Btn size="sm" variant="ghost" icon="📋">История</Btn></Link>
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.t2 }}>Следующая выплата</div>
              <span style={{ fontSize: 10, background: C.accent + '22', color: C.accent, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Еженедельно</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.t1, marginBottom: 14 }}>
              {parseFloat(nextPayout || 0).toLocaleString('ru')} ₽
            </div>
            <div style={{ height: 6, background: '#1A1A28', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: '70%', height: '100%', background: C.accent, borderRadius: 3, transition: 'width 1s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.t2 }}>
              <span>До выплаты: 3 дня</span>
              <span style={{ color: C.accent }}>70%</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard icon="📦" label="Товаров" value={products.length} />
          <StatCard icon="🛒" label="Продаж всего" value={seller?.total_sales || 0} color={C.green} />
          <StatCard icon="⭐" label="Рейтинг" value={seller?.rating ? parseFloat(seller.rating).toFixed(1) : '—'} color={C.amber} />
          <StatCard icon="💰" label="Заморожено" value={`${parseFloat(wallet?.held || 0).toLocaleString('ru')} ₽`} color={C.t2} />
        </div>

        {referral?.code && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 6 }}>Реферальная программа</div>
              <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>Приглашайте продавцов и получайте вознаграждение с их оборота</div>
              <div style={{ fontSize: 12, color: C.t3, fontFamily: 'monospace', wordBreak: 'break-all' }}>{referral.link}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.accent }}>{referral.code}</div>
              <div style={{ fontSize: 11, color: C.t3 }}>код</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.green }}>{parseFloat(referral.earnings || 0).toLocaleString('ru')} ₽</div>
              <div style={{ fontSize: 11, color: C.t3 }}>{referral.referredCount || 0} продавцов</div>
            </div>
          </div>
        )}

        {/* Recent orders */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>Последние заказы</span>
            <Link to="/seller/orders" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>Все заказы →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.t3 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 14, color: C.t2, marginBottom: 16 }}>Пока нет продаж</div>
              <Link to="/seller/products/new"><Btn size="sm" icon="+" >Добавить товар</Btn></Link>
            </div>
          ) : (
            <div>
              {recentOrders.map((o, i) => (
                <Link key={o.id} to={`/orders/${o.id}`}
                  style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 12,
                    padding: '14px 20px', borderBottom: `1px solid ${C.border}`, textDecoration: 'none',
                    transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.cardHov}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{o.product_title}</div>
                    <div style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace', marginTop: 2 }}>{o.order_number}</div>
                  </div>
                  <StatusBadge status={o.status} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{parseFloat(o.seller_amount).toLocaleString('ru')} ₽</div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{new Date(o.created_at).toLocaleDateString('ru')}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Products quick */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>Мои товары</span>
            <Link to="/seller/products/new" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>+ Добавить</Link>
          </div>
          {products.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: C.t3, fontSize: 13 }}>Нет товаров</div>
          ) : (
            <div style={{ display: 'flex', gap: 14, padding: '16px 20px', overflowX: 'auto' }}>
              {products.map(p => (
                <Link key={p.id} to={`/seller/products/${p.id}`}
                  style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px',
                    minWidth: 170, flexShrink: 0, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, background: p.status === 'active' ? C.green + '22' : C.amber + '22',
                      color: p.status === 'active' ? C.green : C.amber, padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>
                      {p.status === 'active' ? 'Активен' : p.status === 'pending' ? 'На проверке' : p.status}
                    </span>
                    <span style={{ fontSize: 10, color: C.t3 }}>{p.keys_count} ключей</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, lineHeight: 1.3 }}>{p.title}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.accent }}>{parseFloat(p.price).toLocaleString('ru')} ₽</div>
                  <div style={{ fontSize: 11, color: C.t3 }}>продано: {p.sales_count}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </SellerLayout>
  );
}
