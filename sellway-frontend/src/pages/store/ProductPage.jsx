import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProduct } from '../../api/products';
import { createCheckout } from '../../api/payments';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { C, Spinner, Btn, Stars, Modal, Badge, Textarea, Input } from '../../components/UI';
import SellerMeta from '../../components/SellerMeta';
import useMediaQuery from '../../hooks/useMediaQuery';
import { BUYER_CHECKOUT_RULES_SHORT } from '../../content/platformRules';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;
const isService = p => p?.delivery_type === 'service';
function CategoryIcon({ product, size = 20 }) {
  return <span style={{ width:size, height:size, borderRadius:6, overflow:'hidden', background:C.media, border:`1px solid ${C.border}`, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
    {product.category_image_url ? <img src={product.category_image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:Math.max(10, size * .45), fontWeight:900, color:C.t2 }}>{String(product.category_name || '?').trim().slice(0, 1).toUpperCase()}</span>}
  </span>;
}

export default function ProductPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [tab, setTab] = useState('desc');
  const [buyLoading, setBuyLoading] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [purchaseRulesAccepted, setPurchaseRulesAccepted] = useState(false);
  const [serviceMessage, setServiceMessage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [promoCode, setPromoCode] = useState('');
  const isMobile = useMediaQuery('(max-width: 760px)');

  useEffect(() => {
    setLoading(true);
    getProduct(id)
      .then(r => setProduct(r.data))
      .catch(() => { toast.error('Позиция не найдена'); navigate('/catalog'); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!product) return;
    if (product.delivery_type === 'auto') setQuantity(q => Math.min(Math.max(1, q), Math.max(1, Number(product.keys_count || 1))));
    if (product.delivery_type === 'service') setQuantity(1);
    const title = `${product.title} — SellWay`;
    const description = (product.short_desc || product.description || `${product.title} на SellWay`).slice(0, 160);
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${window.location.origin}/product/${product.id}`);
    const setPropertyMeta = (property, content) => {
      let element = document.querySelector(`meta[property="${property}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('property', property);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };
    const canonicalUrl = `${window.location.origin}/product/${product.id}`;
    setPropertyMeta('og:type', 'product');
    setPropertyMeta('og:title', title);
    setPropertyMeta('og:description', description);
    setPropertyMeta('og:url', canonicalUrl);
    if (product.images?.[0]) setPropertyMeta('og:image', new URL(product.images[0], window.location.origin).toString());
    let schema = document.querySelector('#sellway-product-schema');
    if (!schema) {
      schema = document.createElement('script');
      schema.id = 'sellway-product-schema';
      schema.type = 'application/ld+json';
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': product.delivery_type === 'service' ? 'Service' : 'Product',
      name: product.title,
      description,
      image: product.images || [],
      provider: { '@type': 'Organization', name: product.seller_name || 'SellWay' },
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'RUB',
        price: String(product.price),
        availability: product.delivery_type !== 'auto' || Number(product.keys_count) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    });
    return () => {
      document.querySelector('#sellway-product-schema')?.remove();
    };
  }, [product]);

  async function handleBuy() {
    if (user && user.id === product.seller_id) return toast.warn('Нельзя заказать свою позицию');

    if (product.delivery_type === 'auto' && product.keys_count < 1) return toast.warn('Товар не в наличии');
    if (product.delivery_type === 'auto' && quantity > product.keys_count) return toast.warn(`В наличии только ${product.keys_count} шт.`);
    if (product.delivery_type === 'file' && product.files_count < 1) return toast.warn('Файл для выдачи пока не загружен');
    setPurchaseRulesAccepted(false);
    return setCheckoutModal(true);
  }

  async function startCheckout(email = '') {
    setBuyLoading(true);
    try {
      const { data } = await createCheckout({ product_id: product.id, email, quantity: service ? 1 : quantity, message: service ? serviceMessage : '', promo_code: promoCode.trim() });
      if (data.createdAccount) toast.success('Аккаунт создан. Пароль отправлен на email.');
      window.location.href = data.confirmationUrl;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка создания платежа');
    } finally { setBuyLoading(false); }
  }

  async function handleGuestCheckout(e) {
    e.preventDefault();
    if (!purchaseRulesAccepted) return toast.warn('Подтвердите условия покупки');
    if (!user && !checkoutEmail.trim()) return toast.warn('Укажите email');
    await startCheckout(user ? '' : checkoutEmail.trim());
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div>;
  if (!product) return null;

  const service = isService(product);
  const categoryKind = product.category_type === 'service' || service ? 'services' : 'products';
  const images = product.images || [];
  const disc = product.old_price ? Math.round((1-product.price/product.old_price)*100) : 0;
  const canBuy = service ? true : product.delivery_type === 'auto' ? product.keys_count > 0 && quantity <= product.keys_count : product.delivery_type === 'file' ? product.files_count > 0 : true;
  const serviceSteps = product.meta?.service_steps || [];

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:isMobile ? '16px 12px' : '24px 20px', width:'100%', boxSizing:'border-box' }} className="fade-in">
      <div style={{ display:'flex', gap:6, fontSize:12, color:C.t2, marginBottom:22, alignItems:'center', flexWrap:'wrap' }}>
        <Link to="/" style={{ color:C.accent, textDecoration:'none' }}>Главная</Link><span>/</span>
        <Link to="/catalog" style={{ color:C.accent, textDecoration:'none' }}>Каталог</Link>
        {product.category_name && <><span>/</span><Link to={`/catalog?kind=${categoryKind}&category=${product.category_slug}`} style={{ color:C.accent, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5 }}><CategoryIcon product={product} size={18}/>{product.category_name}</Link></>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'minmax(280px, 420px) 1fr', gap:isMobile ? 18 : 28 }}>
        <div>
          <div style={{ background:C.media, borderRadius:8, overflow:'hidden', aspectRatio:'1', border:`1px solid ${C.border}`, marginBottom:10, position:'relative' }}>
            {images.length > 0 ? <img src={images[imgIdx]} alt={product.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', gap:8, alignItems:'center', justifyContent:'center', color:C.t3 }}><span style={{ fontFamily:'var(--sw-serif)', fontSize:72 }}>{String(product.title || 'S').slice(0,1)}</span><span style={{ fontSize:12, textTransform:'uppercase' }}>{service ? 'Услуга' : 'Товар'}</span></div>}
            {disc > 0 && <div style={{ position:'absolute', top:12, left:12, background:C.red, color:'#fff', fontSize:13, fontWeight:800, padding:'4px 10px', borderRadius:8 }}>-{disc}%</div>}
          </div>
          {images.length > 1 && <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{images.map((src,i)=><button key={i} onClick={()=>setImgIdx(i)} style={{ width:60, height:60, borderRadius:8, overflow:'hidden', cursor:'pointer', border:`2px solid ${i===imgIdx?C.accent:C.border}`, padding:0, background:'transparent' }}><img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></button>)}</div>}
        </div>

        <div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:16 }}>
            {service && <Badge color={C.accent}>Услуга / поэтапная сделка</Badge>}
            {product.seller_verified && <Badge color={C.green}>Проверенный автор</Badge>}
            {!service && product.guarantee_days > 0 && <Badge color={C.t2}>Гарантия {product.guarantee_days} дн.</Badge>}
          </div>

          <h1 style={{ fontSize:24, fontWeight:900, color:C.t1, marginBottom:8, lineHeight:1.3 }}>{product.title}</h1>
          {product.category_name && <div style={{ fontSize:13, color:C.t2, marginBottom:18, display:'flex', alignItems:'center', gap:6 }}>Категория: <Link to={`/catalog?kind=${categoryKind}&category=${product.category_slug}`} style={{ color:C.accent, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}><CategoryIcon product={product}/>{product.category_name}</Link></div>}

          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:32, fontWeight:900, color:C.t1 }}>{service ? 'от ' : ''}{money(product.price)}</span>
              {product.old_price && <span style={{ fontSize:16, color:C.t3, textDecoration:'line-through' }}>{money(product.old_price)}</span>}
            </div>
            {service && <div style={{ fontSize:12, color:C.accent, marginTop:6 }}>Финальная стоимость утверждается с заказчиком в сделке.</div>}
            {product.delivery_type === 'auto' && (product.keys_count > 0 ? <div style={{ fontSize:12, color:C.green, marginTop:4 }}>В наличии: {product.keys_count} шт.</div> : <div style={{ fontSize:12, color:C.red, marginTop:4 }}>Нет в наличии</div>)}
            {product.delivery_type === 'file' && (product.files_count > 0 ? <div style={{ fontSize:12, color:C.green, marginTop:4 }}>Файл готов к выдаче</div> : <div style={{ fontSize:12, color:C.red, marginTop:4 }}>Файл не загружен</div>)}
          </div>

          {!service && <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:14, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>Количество</div>
                <div style={{ fontSize:12, color:C.t2, marginTop:3 }}>
                  {product.delivery_type === 'auto' ? `Можно купить до ${product.keys_count} шт.` : 'Укажите нужное количество'}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button type="button" onClick={()=>setQuantity(q=>Math.max(1, q-1))} style={{ width:34, height:34, borderRadius:8, background:C.field, border:`1px solid ${C.border}`, color:C.t1, fontSize:18, cursor:'pointer' }}>-</button>
                <Input type="number" min="1" max={product.delivery_type === 'auto' ? product.keys_count : 100} value={quantity} onChange={e=>setQuantity(Math.min(product.delivery_type === 'auto' ? Number(product.keys_count || 1) : 100, Math.max(1, Number(e.target.value || 1))))} style={{ width:76, textAlign:'center' }} />
                <button type="button" onClick={()=>setQuantity(q=>Math.min(product.delivery_type === 'auto' ? Number(product.keys_count || 1) : 100, q+1))} style={{ width:34, height:34, borderRadius:8, background:C.field, border:`1px solid ${C.border}`, color:C.t1, fontSize:18, cursor:'pointer' }}>+</button>
              </div>
            </div>
            {quantity > 1 && <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', fontSize:13 }}><span style={{ color:C.t2 }}>Итого</span><b style={{ color:C.t1 }}>{money(Number(product.price) * quantity)}</b></div>}
          </div>}

          {service && <div style={{ background:C.infoBg, border:`1px solid ${C.accent}33`, borderRadius:8, padding:14, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:800, color:C.t1, marginBottom:8 }}>Сообщение фрилансеру</div>
            <Textarea value={serviceMessage} onChange={e=>setServiceMessage(e.target.value)} rows={4} placeholder="Кратко опишите задачу, сроки, пожелания..." style={{ width:'100%' }} />
          </div>}

          <div style={{ display:'flex', gap:10, marginBottom:20 }}>
            <Btn full size="lg" loading={buyLoading} onClick={handleBuy} disabled={!canBuy}>{service ? 'Оплатить и заказать' : 'Купить сейчас'}</Btn>
            <button style={{ width:46, height:46, borderRadius:9, background:C.card, border:`1px solid ${C.border}`, color:C.t2, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>♡</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:10, marginBottom:22 }}>
            {(service ? [['Безопасная сделка','Оплата резервируется сразу'],['Этапы','Фрилансер ведёт работу в заказе'],['Спор','Можно открыть спор по сделке'],['Цена от','Оплачивается указанная стартовая стоимость']] : [['Безопасная сделка','Средства заморожены до подтверждения'],['Выдача',product.delivery_type==='auto'?'Мгновенно':product.delivery_type==='file'?'Файл автоматически':'Продавец передает вручную'],['Гарантия',product.guarantee_days>0?`${product.guarantee_days} дней`:'Уточните у продавца'],['Возврат','При открытии спора']]).map(([t,d])=><div key={t} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:9, padding:'10px 14px' }}><div style={{ fontSize:12, fontWeight:700, color:C.t1 }}>{t}</div><div style={{ fontSize:11, color:C.t2, marginTop:2 }}>{d}</div></div>)}
          </div>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:42, height:42, borderRadius:8, background:service?C.accent:C.green, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:'#fff', flexShrink:0, overflow:'hidden' }}>{product.seller_avatar ? <img src={product.seller_avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : product.seller_name?.[0]?.toUpperCase()}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>{product.seller_name}</div>
                {product.seller_rating > 0 && <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}><Stars n={product.seller_rating} size={12}/><span style={{ fontSize:11, color:C.t2 }}>{parseFloat(product.seller_rating).toFixed(1)} · {product.seller_sales} продаж</span></div>}
                <SellerMeta seller={product} />
              </div>
            </div>
          </div>

          {product.tags?.length > 0 && <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:14 }}>{product.tags.map(t=><span key={t} style={{ fontSize:11, background:C.soft, color:C.t2, padding:'4px 10px', borderRadius:7 }}>{t}</span>)}</div>}
        </div>
      </div>

      <div style={{ marginTop:36 }}>
        <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:24 }}>
          {['desc','reviews'].map(t=><button key={t} onClick={()=>setTab(t)} style={{ background:'transparent', border:'none', borderBottom:`2px solid ${tab===t?C.accent:'transparent'}`, color:tab===t?C.accent:C.t2, padding:'11px 22px', fontSize:14, fontWeight:tab===t?700:400, cursor:'pointer', fontFamily:'inherit', marginBottom:-1 }}>{t==='desc'?'Описание':`Отзывы (${product.reviews_count})`}</button>)}
        </div>
        {tab === 'desc' && <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:24 }}>
          {service && serviceSteps.length > 0 && <div style={{ marginBottom:20 }}><div style={{ fontSize:14, fontWeight:900, color:C.t1, marginBottom:10 }}>Типовые этапы</div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>{serviceSteps.map((s,i)=><div key={i} style={{ background:C.field, border:`1px solid ${C.border}`, borderRadius:8, padding:12 }}><div style={{ color:C.t1, fontWeight:800, fontSize:13 }}>{s.title}</div>{s.description && <div style={{ color:C.t2, fontSize:12, marginTop:5, lineHeight:1.4 }}>{s.description}</div>}</div>)}</div></div>}
          {product.description ? <div style={{ fontSize:14, color:C.t2, lineHeight:1.8, whiteSpace:'pre-wrap' }}>{product.description}</div> : <div style={{ color:C.t3, fontSize:13 }}>Описание не указано</div>}
        </div>}
        {tab === 'reviews' && <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:24 }}>{!product.reviews?.length ? <div style={{ textAlign:'center', color:C.t3, padding:32 }}>Пока нет отзывов</div> : product.reviews.map((r,i)=><div key={i} style={{ borderTop:i?`1px solid ${C.border}`:'none', paddingTop:i?16:0, marginTop:i?16:0 }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}><b style={{ color:C.t1, fontSize:13 }}>{r.buyer_name}</b><span style={{ fontSize:11, color:C.t3 }}>{new Date(r.created_at).toLocaleDateString('ru')}</span></div><Stars n={r.rating} size={12}/>{r.comment && <p style={{ fontSize:13, color:C.t2, lineHeight:1.55 }}>{r.comment}</p>}</div>)}</div>}
      </div>

      {checkoutModal && <Modal title={user ? 'Подтверждение заказа' : 'Покупка без регистрации'} onClose={()=>setCheckoutModal(false)}>
        <form onSubmit={handleGuestCheckout} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {!user && <><div style={{ background:C.infoBg, border:`1px solid ${C.accent}33`, borderRadius:8, padding:'12px 16px', fontSize:13, color:C.t2, lineHeight:1.5 }}>Укажите email. Мы автоматически создадим аккаунт покупателя, отправим пароль на почту и перенаправим на оплату.</div>
          <Input label="Email для доступа к покупке" type="email" value={checkoutEmail} onChange={e=>setCheckoutEmail(e.target.value)} placeholder="you@example.com" required /></>}
          <Input label="Промокод" value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())} placeholder="Если есть" />
          <label style={{ display:'flex', gap:10, alignItems:'flex-start', background:C.field, border:`1px solid ${purchaseRulesAccepted ? C.accent + '55' : C.border}`, borderRadius:8, padding:'12px 14px', cursor:'pointer' }}>
            <input type="checkbox" checked={purchaseRulesAccepted} onChange={e=>setPurchaseRulesAccepted(e.target.checked)} style={{ marginTop:3, accentColor:C.accent }} />
            <span style={{ color:C.t2, fontSize:12, lineHeight:1.6 }}>{BUYER_CHECKOUT_RULES_SHORT}{' '}<Link to="/terms" target="_blank" style={{ color:C.accent }}>Правила площадки</Link></span>
          </label>
          <Btn type="submit" full loading={buyLoading}>Перейти к оплате</Btn>
        </form>
      </Modal>}
    </div>
  );
}
