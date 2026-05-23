import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProduct } from '../../api/products';
import { createOrder } from '../../api/orders';
import { createPayment } from '../../api/payments';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { C, Spinner, Btn, Stars, Modal, Badge } from '../../components/UI';

export default function ProductPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [product, setProduct]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [imgIdx, setImgIdx]       = useState(0);
  const [tab, setTab]             = useState('desc');
  const [buyLoading, setBuyLoading] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getProduct(id)
      .then(r => setProduct(r.data))
      .catch(() => { toast.error('Товар не найден'); navigate('/catalog'); })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleBuy() {
    if (!user) return navigate('/login', { state: { from: { pathname: `/product/${id}` } } });
    if (user.id === product.seller_id) return toast.warn('Нельзя купить свой товар');
    if (product.keys_count < 1) return toast.warn('Товар не в наличии');

    // Проверяем баланс
    if (parseFloat(user.balance || 0) < parseFloat(product.price)) {
      const needed = (parseFloat(product.price) - parseFloat(user.balance || 0)).toFixed(2);
      setTopupAmount(String(Math.ceil(parseFloat(needed) / 100) * 100));
      return setTopupModal(true);
    }

    setBuyLoading(true);
    try {
      const { data } = await createOrder(id);
      toast.success('Заказ создан!');
      navigate(`/orders/${data.order.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка создания заказа');
    } finally {
      setBuyLoading(false);
    }
  }

  async function handleTopup(e) {
    e.preventDefault();
    if (!topupAmount || +topupAmount < 100) return toast.warn('Минимум 100 ₽');
    setTopupLoading(true);
    try {
      const { data } = await createPayment({ amount: +topupAmount });
      window.location.href = data.confirmationUrl;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка платежа');
      setTopupLoading(false);
    }
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div>;
  if (!product) return null;

  const images = product.images || [];
  const disc = product.old_price ? Math.round((1-product.price/product.old_price)*100) : 0;

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px' }} className="fade-in">
      {/* Breadcrumb */}
      <div style={{ display:'flex', gap:6, fontSize:12, color:C.t2, marginBottom:22, alignItems:'center', flexWrap:'wrap' }}>
        <Link to="/" style={{ color:C.accent, textDecoration:'none' }}>Главная</Link>
        <span>›</span>
        <Link to="/catalog" style={{ color:C.accent, textDecoration:'none' }}>Каталог</Link>
        {product.category_name && <><span>›</span><Link to={`/catalog?category=${product.category_slug}`} style={{ color:C.accent, textDecoration:'none' }}>{product.category_name}</Link></>}
        <span>›</span>
        <span style={{ color:C.t1 }}>{product.title.slice(0,40)}{product.title.length>40?'...':''}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'420px 1fr', gap:28 }}>
        {/* Images */}
        <div>
          <div style={{ background:'#0A0A14', borderRadius:16, overflow:'hidden', aspectRatio:'1', border:`1px solid ${C.border}`, marginBottom:10, position:'relative' }}>
            {images.length > 0
              ? <img src={images[imgIdx]} alt={product.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:80 }}>📦</div>}
            {disc > 0 && <div style={{ position:'absolute', top:12, left:12, background:C.red, color:'#fff', fontSize:13, fontWeight:800, padding:'4px 10px', borderRadius:8 }}>−{disc}%</div>}
          </div>
          {images.length > 1 && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {images.map((src,i) => (
                <div key={i} onClick={() => setImgIdx(i)}
                  style={{ width:60, height:60, borderRadius:8, overflow:'hidden', cursor:'pointer', border:`2px solid ${i===imgIdx?C.accent:C.border}`, transition:'border-color .15s' }}>
                  <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {/* Badges */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:16 }}>
            {product.delivery_type === 'auto' && <Badge color={C.green}>⚡ Авто-выдача</Badge>}
            {product.seller_verified && <Badge color='#60A5FA'>✓ Продавец проверен</Badge>}
            {product.guarantee_days > 0 && <Badge color={C.t2}>🛡️ Гарантия {product.guarantee_days} дн.</Badge>}
            <Badge color={C.t3}>🛒 Куплено: {product.sales_count}</Badge>
          </div>

          <h1 style={{ fontSize:24, fontWeight:900, color:C.t1, marginBottom:8, lineHeight:1.3 }}>{product.title}</h1>

          {product.category_name && (
            <div style={{ fontSize:13, color:C.t2, marginBottom:18 }}>
              🎮 Категория: <Link to={`/catalog?category=${product.category_slug}`} style={{ color:C.accent, textDecoration:'none' }}>{product.category_name}</Link>
            </div>
          )}

          {/* Price */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
              <span style={{ fontSize:32, fontWeight:900, color:C.t1 }}>{parseFloat(product.price).toLocaleString('ru')} ₽</span>
              {product.old_price && <span style={{ fontSize:16, color:C.t3, textDecoration:'line-through' }}>{parseFloat(product.old_price).toLocaleString('ru')} ₽</span>}
            </div>
            {product.keys_count > 0
              ? <div style={{ fontSize:12, color:C.green, marginTop:4 }}>● В наличии: {product.keys_count} шт.</div>
              : <div style={{ fontSize:12, color:C.red, marginTop:4 }}>● Нет в наличии</div>}
          </div>

          {/* Buy buttons */}
          <div style={{ display:'flex', gap:10, marginBottom:20 }}>
            <Btn full size="lg" loading={buyLoading} onClick={handleBuy} disabled={product.keys_count < 1} icon="⚡">
              Купить сейчас
            </Btn>
            <button style={{ width:46, height:46, borderRadius:9, background:C.card, border:`1px solid ${C.border}`, color:C.t2, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🤍</button>
          </div>

          {/* Guarantees */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:22 }}>
            {[['🔒','Безопасная сделка','Средства заморожены до подтверждения'],['⚡',product.delivery_type==='auto'?'Авто-выдача':'Ручная выдача',product.delivery_type==='auto'?'Мгновенно, 24/7':'Продавец передаёт вручную'],['🛡️','Гарантия',product.guarantee_days>0?`${product.guarantee_days} дней`:'Уточните у продавца'],['↩️','Возврат','При открытии спора']].map(([icon,t,d])=>(
              <div key={t} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:9, padding:'10px 14px', display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
                <div><div style={{ fontSize:12, fontWeight:700, color:C.t1 }}>{t}</div><div style={{ fontSize:11, color:C.t2, marginTop:2 }}>{d}</div></div>
              </div>
            ))}
          </div>

          {/* Seller card */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:42, height:42, borderRadius:12, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:'#fff', flexShrink:0 }}>
                {product.seller_name?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:C.t1 }}>{product.seller_name}</span>
                  {product.seller_verified && <Badge color='#60A5FA' small>✓ Проверен</Badge>}
                </div>
                {product.seller_rating > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                    <Stars n={product.seller_rating} size={12}/>
                    <span style={{ fontSize:11, color:C.t2 }}>{parseFloat(product.seller_rating).toFixed(1)} · {product.seller_sales} продаж</span>
                  </div>
                )}
              </div>
              <span style={{ color:C.t3, fontSize:18 }}>›</span>
            </div>
          </div>

          {/* Tags */}
          {product.tags?.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:14 }}>
              {product.tags.map(t=><span key={t} style={{ fontSize:11, background:'#1A1A28', color:C.t2, padding:'4px 10px', borderRadius:7 }}>{t}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop:36 }}>
        <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:24 }}>
          {['desc','reviews'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{ background:'transparent', border:'none', borderBottom:`2px solid ${tab===t?C.accent:'transparent'}`, color:tab===t?C.accent:C.t2, padding:'11px 22px', fontSize:14, fontWeight:tab===t?700:400, cursor:'pointer', fontFamily:'inherit', marginBottom:-1 }}>
              {t==='desc'?'📄 Описание':`⭐ Отзывы (${product.reviews_count})`}
            </button>
          ))}
        </div>

        {tab === 'desc' && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:24 }}>
            {product.description
              ? <div style={{ fontSize:14, color:C.t2, lineHeight:1.8, whiteSpace:'pre-wrap' }}>{product.description}</div>
              : <div style={{ color:C.t3, fontSize:13 }}>Описание не указано</div>}
          </div>
        )}

        {tab === 'reviews' && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:24 }}>
            {!product.reviews?.length
              ? <div style={{ textAlign:'center', color:C.t3, padding:32 }}><div style={{ fontSize:32, marginBottom:12 }}>⭐</div><div style={{ fontSize:14, color:C.t2 }}>Пока нет отзывов</div></div>
              : <>
                  <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
                    <div style={{ fontSize:48, fontWeight:900, color:C.t1 }}>{parseFloat(product.rating).toFixed(1)}</div>
                    <div><Stars n={product.rating} size={20}/><div style={{ fontSize:13, color:C.t2, marginTop:4 }}>{product.reviews_count} отзывов</div></div>
                  </div>
                  {product.reviews.map((r,i)=>(
                    <div key={i} style={{ borderTop:`1px solid ${C.border}`, paddingTop:16, marginTop:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:`hsl(${i*80+200},50%,35%)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#fff', fontWeight:700 }}>{r.buyer_name?.[0]?.toUpperCase()}</div>
                          <span style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{r.buyer_name}</span>
                          {r.is_auto && <span style={{ fontSize:10, color:C.t3 }}>авто</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}><Stars n={r.rating} size={12}/><span style={{ fontSize:11, color:C.t3 }}>{new Date(r.created_at).toLocaleDateString('ru')}</span></div>
                      </div>
                      {r.comment && <p style={{ fontSize:13, color:C.t2, lineHeight:1.55 }}>{r.comment}</p>}
                    </div>
                  ))}
                </>}
          </div>
        )}
      </div>

      {/* Topup modal */}
      {topupModal && (
        <Modal title="Пополнить баланс" onClose={()=>setTopupModal(false)}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'#0A1A10', border:`1px solid ${C.green}33`, borderRadius:10, padding:'12px 16px', fontSize:13, color:C.green }}>
              Для покупки нужно <strong>{parseFloat(product.price).toLocaleString('ru')} ₽</strong>. Пополните баланс через ЮKassa.
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:C.t2, display:'block', marginBottom:8 }}>Сумма пополнения (₽)</label>
              <input type="number" value={topupAmount} onChange={e=>setTopupAmount(e.target.value)} min={100}
                style={{ width:'100%', background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:9, padding:'11px 13px', color:C.t1, fontSize:16, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
              <div style={{ display:'flex', gap:6, marginTop:8 }}>
                {[500,1000,2000,5000].map(v=>(
                  <button key={v} type="button" onClick={()=>setTopupAmount(String(v))}
                    style={{ flex:1, background:topupAmount===String(v)?C.accent+'25':'#0A0A12', border:`1px solid ${topupAmount===String(v)?C.accent:C.border}`, borderRadius:7, padding:'7px 4px', color:topupAmount===String(v)?C.accent:C.t2, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                    {v.toLocaleString('ru')} ₽
                  </button>
                ))}
              </div>
            </div>
            <Btn full loading={topupLoading} onClick={handleTopup} icon="💳">Перейти к оплате (ЮKassa)</Btn>
            <div style={{ fontSize:11, color:C.t3, textAlign:'center' }}>Безопасная оплата через ЮKassa · Карты, СБП, электронные кошельки</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
