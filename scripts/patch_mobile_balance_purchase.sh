#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SELLER_LAYOUT="$APP_DIR/sellway-frontend/src/components/Layout/SellerLayout.jsx"
HEADER="$APP_DIR/sellway-frontend/src/components/Layout/Header.jsx"
PRODUCT="$APP_DIR/sellway-frontend/src/pages/store/ProductPage.jsx"
PAYMENTS="$APP_DIR/sellway-backend/src/routes/payments.js"

cat > "$SELLER_LAYOUT" <<'EOF'
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { C, Stars } from '../UI';

const BASE_NAV = [
  ['/seller', '📊', 'Дашборд'],
  ['/seller/products', '📦', 'Товары'],
  ['/seller/orders', '🛒', 'Заказы'],
  ['/seller/finances', '💰', 'Финансы'],
  ['/seller/referrals', '🤝', 'Рефералы'],
  ['/seller/withdrawal', '⬆️', 'Вывод'],
  ['/seller/reviews', '⭐', 'Отзывы'],
  ['/seller/promo', '🏷️', 'Акции'],
  ['/seller/settings', '⚙️', 'Настройки'],
];

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

export default function SellerLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const roleLabel = user?.role === 'freelancer' ? 'Фрилансер' : user?.role === 'admin' ? 'Администратор' : 'Продавец';
  const nav = BASE_NAV.map(item => user?.role === 'freelancer' && item[0] === '/seller/products' ? ['/seller/products', '🧑‍💻', 'Услуги'] : item);

  const Nav = ({ mobile = false }) => <nav style={mobile ? { display:'flex', gap:8, overflowX:'auto', padding:'10px 12px', borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, WebkitOverflowScrolling:'touch' } : { flex:1, padding:'10px 8px', overflowY:'auto' }}>
    {nav.map(([to, icon, label]) => {
      const active = location.pathname === to || (to !== '/seller' && location.pathname.startsWith(to));
      return <Link key={to} to={to} style={mobile ? { flex:'0 0 auto', display:'flex', alignItems:'center', gap:6, padding:'9px 11px', borderRadius:10, background:active?C.accent+'22':'#10101A', border:`1px solid ${active?C.accent+'66':C.border}`, color:active?C.accent:C.t2, fontSize:12, fontWeight:700, textDecoration:'none', whiteSpace:'nowrap' } : { display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:8, marginBottom:2, background:active?C.accent+'18':'transparent', borderLeft:`3px solid ${active?C.accent:'transparent'}`, color:active?C.accent:C.t2, fontSize:13, fontWeight:active?700:400, textDecoration:'none' }}><span>{icon}</span>{label}</Link>;
    })}
  </nav>;

  return <div className="seller-layout" style={{ minHeight:'calc(100vh - 90px)' }}>
    <aside className="seller-sidebar" style={{ width:220, background:'#0F0F18', borderRight:`1px solid ${C.border}`, flexShrink:0, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'20px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ width:58, height:58, borderRadius:14, background:`linear-gradient(135deg,${C.accent},#A78BFA)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:900, color:'#fff' }}>{user?.username?.slice(0,2).toUpperCase()}</div>
        <div style={{ textAlign:'center' }}><div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{user?.username}</div><div style={{ fontSize:11, color:C.t2, marginTop:2 }}>{roleLabel}</div></div>
        {user?.rating > 0 && <Stars n={user.rating} size={13}/>} 
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, width:'100%', marginTop:4 }}>
          <div style={{ textAlign:'center', background:'#0A0A12', borderRadius:8, padding:8 }}><div style={{ fontSize:15, fontWeight:800, color:C.t1 }}>{user?.total_sales || 0}</div><div style={{ fontSize:9, color:C.t3, textTransform:'uppercase' }}>Продаж</div></div>
          <div style={{ textAlign:'center', background:'#0A0A12', borderRadius:8, padding:8 }}><div style={{ fontSize:15, fontWeight:800, color:C.green }}>{money(user?.balance)}</div><div style={{ fontSize:9, color:C.t3, textTransform:'uppercase' }}>Баланс</div></div>
        </div>
      </div>
      <Nav />
      <div style={{ padding:'14px 16px', borderTop:`1px solid ${C.border}` }}><Link to="/" style={{ fontSize:12, color:C.t3, textDecoration:'none' }}>← Вернуться в магазин</Link></div>
    </aside>

    <div className="seller-mobile-head" style={{ display:'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px' }}>
        <div style={{ width:42, height:42, borderRadius:12, background:C.accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900 }}>{user?.username?.slice(0,2).toUpperCase()}</div>
        <div style={{ minWidth:0, flex:1 }}><div style={{ color:C.t1, fontWeight:900, fontSize:14, overflow:'hidden', textOverflow:'ellipsis' }}>{user?.username}</div><div style={{ color:C.t2, fontSize:11 }}>{roleLabel}</div></div>
        <div style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:10, padding:'7px 10px', textAlign:'right' }}><div style={{ color:C.green, fontWeight:900, fontSize:13 }}>{money(user?.balance)}</div><div style={{ color:C.t3, fontSize:9 }}>Баланс</div></div>
      </div>
      <Nav mobile />
    </div>

    <main className="seller-main" style={{ flex:1, overflowX:'hidden' }}>{children}</main>
    <style>{`@media(min-width:761px){.seller-layout{display:flex}.seller-mobile-head{display:none!important}}@media(max-width:760px){.seller-layout{display:block!important;width:100%!important;max-width:100vw!important;overflow-x:hidden!important}.seller-sidebar{display:none!important}.seller-mobile-head{display:block!important;background:#0F0F18;border-bottom:1px solid ${C.border};position:sticky;top:0;z-index:50}.seller-main{width:100%!important;max-width:100vw!important;overflow-x:hidden!important}.seller-main>div{padding:14px 12px!important}}`}</style>
  </div>;
}
EOF

python3 - <<'PY' "$HEADER" "$PRODUCT" "$PAYMENTS"
from pathlib import Path
import sys
header=Path(sys.argv[1]); product=Path(sys.argv[2]); payments=Path(sys.argv[3])

h=header.read_text()
if "const money = v =>" not in h:
    h=h.replace("const isSellerRole = ['seller', 'freelancer', 'admin'].includes(user?.role);", "const isSellerRole = ['seller', 'freelancer', 'admin'].includes(user?.role);\n  const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;" )
if "Баланс:" not in h:
    h=h.replace("{user ? <>", "{user ? <>\n          <Link to={isSellerRole ? '/seller/finances' : '/profile/settings'} style={{ background:'#0A0A12', border:`1px solid ${C.border}`, color:C.green, borderRadius:9, padding:'7px 10px', fontSize:12, textDecoration:'none', fontWeight:800, whiteSpace:'nowrap' }}>Баланс: {money(user.balance)}</Link>")
header.write_text(h)

p=product.read_text()
p=p.replace("setTopupAmount(String(Math.ceil(parseFloat(needed) / 100) * 100));", "setTopupAmount(String(needed));")
p=p.replace("if (!topupAmount || +topupAmount < 100) return toast.warn('Минимум 100 ₽');", "if (!topupAmount || +topupAmount <= 0) return toast.warn('Некорректная сумма');")
p=p.replace("const { data } = await createPayment({ amount: +topupAmount });", "const { data } = await createPayment({ amount: +topupAmount, purpose: 'product_purchase', product_id: product.id });")
p=p.replace("Для покупки нужно {money(product.price)}. Пополните баланс через ЮKassa.", "Для покупки не хватает {money(topupAmount)}. Оплатите недостающую сумму через ЮKassa.")
p=p.replace("min={100}", "min={1}")
p=p.replace("Пополнить баланс", "Оплатить покупку")
p=p.replace("Перейти к оплате", "Оплатить покупку")
product.write_text(p)

s=payments.read_text()
s=s.replace("const { amount } = req.body;", "const { amount, purpose, product_id } = req.body;\n  const isPurchase = purpose === 'product_purchase';")
s=s.replace("if (!amount || amount < 100) {\n    return res.status(400).json({ error: 'Минимальная сумма пополнения: 100 ₽' });\n  }", "if (!amount || Number(amount) < (isPurchase ? 1 : 100)) {\n    return res.status(400).json({ error: isPurchase ? 'Некорректная сумма покупки' : 'Минимальная сумма пополнения: 100 ₽' });\n  }")
s=s.replace("const description    = `Пополнение баланса SellWay для ${req.user.username}`;", "const description    = isPurchase ? `Оплата покупки SellWay для ${req.user.username}` : `Пополнение баланса SellWay для ${req.user.username}`;")
s=s.replace("return_url: `${process.env.FRONTEND_URL}/payment/success?payment_id={payment.id}`", "return_url: `${process.env.FRONTEND_URL}/payment/success?payment_id={payment.id}${isPurchase && product_id ? `&product_id=${product_id}` : ''}`")
s=s.replace("type: 'balance_topup',", "type: isPurchase ? 'product_purchase' : 'balance_topup',\n        product_id: product_id || null,")
s=s.replace("JSON.stringify({ payment_id: payment.id, status: 'pending' })", "JSON.stringify({ payment_id: payment.id, status: 'pending', purpose: isPurchase ? 'product_purchase' : 'balance_topup', product_id: product_id || null })")
s=s.replace("if (type === 'balance_topup' && user_id) {", "if ((type === 'balance_topup' || type === 'product_purchase') && user_id) {")
s=s.replace("'💰 Баланс пополнен',\n            `На ваш счёт зачислено ${amount.toLocaleString('ru')} ₽`,", "type === 'product_purchase' ? '✅ Оплата покупки прошла' : '💰 Баланс пополнен',\n            type === 'product_purchase' ? `Оплата ${amount.toLocaleString('ru')} ₽ получена. Теперь можно завершить покупку.` : `На ваш счёт зачислено ${amount.toLocaleString('ru')} ₽`,")
payments.write_text(s)
PY

echo "Mobile seller layout, balance chip and exact purchase payment patched"
