import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProducts, getCategories } from '../../api/products';
import { C, Spinner, Stars } from '../../components/UI';
import SellerMeta from '../../components/SellerMeta';
import useMediaQuery from '../../hooks/useMediaQuery';

function ProductCard({ p }) {
  const [imgIdx, setImgIdx] = useState(0);
  const [hov, setHov] = useState(false);
  const [fav, setFav] = useState(false);
  const navigate = useNavigate();
  const images = p.images || [];
  const service = p.delivery_type === 'service';
  const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return (
    <div onClick={() => navigate(`/product/${p.id}`)} onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); setImgIdx(0); }} style={{ background: C.card, border: `1px solid ${hov ? C.accent+'55' : C.border}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s', display: 'flex', flexDirection: 'column', boxShadow: hov ? C.shadow : 'none' }}>
      <div style={{ position: 'relative', height: 148, background: C.media, overflow: 'hidden' }}>
        {images.length > 0 ? <img src={images[imgIdx]} alt={p.title} style={{ width:'100%', height:'100%', objectFit:'cover', transition:'transform .3s', transform: hov?'scale(1.04)':'scale(1)' }} /> : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', gap:5, alignItems:'center', justifyContent:'center', color:C.t3 }}><span style={{ fontFamily:'var(--sw-serif)', fontSize:32 }}>{String(p.title || 'S').slice(0,1)}</span><span style={{ fontSize:10, textTransform:'uppercase' }}>{service ? 'Услуга' : 'Товар'}</span></div>}
        <div style={{ position:'absolute', top:8, left:8, display:'flex', flexDirection:'column', gap:4 }}>
          {disc > 0 && <span style={{ background:C.red, color:'#fff', fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>−{disc}%</span>}
          {service && <span style={{ background:C.accent, color:'#fff', fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>Услуга</span>}
        </div>
        <button aria-label={fav ? 'Убрать из избранного' : 'В избранное'} onClick={e => { e.stopPropagation(); setFav(f=>!f); }} style={{ position:'absolute', top:8, right:8, width:30, height:30, borderRadius:'50%', background:'rgba(44,36,31,.7)', border:'none', color:'#FFF8EF', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>{fav ? '♥' : '♡'}</button>
        {images.length > 1 && <><div style={{ position:'absolute', inset:0, display:'flex' }}>{images.map((_,i)=><div key={i} style={{ flex:1 }} onMouseEnter={()=>setImgIdx(i)} />)}</div><div style={{ position:'absolute', bottom:8, left:0, right:0, display:'flex', justifyContent:'center', gap:4 }}>{images.map((_,i)=><div key={i} style={{ width:i===imgIdx?14:5, height:5, borderRadius:3, background:i===imgIdx?'#fff':'rgba(255,255,255,.4)', transition:'all .2s' }} />)}</div></>}
      </div>
      <div style={{ padding:'10px 11px', display:'flex', flexDirection:'column', gap:5, flex:1 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:7 }}><span style={{ fontSize:16, fontWeight:900, color:C.t1 }}>{service ? 'от ' : ''}{parseFloat(p.price).toLocaleString('ru')} ₽</span>{p.old_price && <span style={{ fontSize:11, color:C.t3, textDecoration:'line-through' }}>{parseFloat(p.old_price).toLocaleString('ru')} ₽</span>}</div>
        <div style={{ fontSize:12, color:C.t1, lineHeight:1.35, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', minHeight:33 }}>{p.title}</div>
        {p.rating > 0 && <div style={{ display:'flex', alignItems:'center', gap:5 }}><Stars n={p.rating} size={11} /><span style={{ fontSize:11, color:C.t3 }}>{parseFloat(p.rating).toFixed(1)} ({p.reviews_count})</span></div>}
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{p.tags?.slice(0,2).map(t=><span key={t} style={{ fontSize:10, background:C.soft, color:C.t2, padding:'2px 7px', borderRadius:5 }}>{t}</span>)}</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:'auto', paddingTop:8, borderTop:`1px solid ${C.border}` }}><SellerLogo seller={p} /><span style={{ fontSize:11, color:C.t2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.seller_name}</span>{Number(p.seller_rating) > 0 && <span style={{ fontSize:10, color:C.amber, whiteSpace:'nowrap' }}>★ {Number(p.seller_rating).toFixed(1)}</span>}{p.seller_verified && <span style={{ fontSize:9, color:C.accent, background:C.infoBg, padding:'1px 5px', borderRadius:4 }}>✓</span>}</div>
        <SellerMeta seller={p} compact />
        <button onClick={e=>{ e.stopPropagation(); navigate(`/product/${p.id}`); }} style={{ background:hov?C.accent:C.soft, border:`1px solid ${hov?'transparent':C.border}`, color:hov?'#fff':C.accent, borderRadius:8, padding:'8px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .2s', marginTop:2 }}>{service ? 'Обсудить' : hov ? 'Купить сейчас →' : 'Подробнее'}</button>
      </div>
    </div>
  );
}

const categoryImage = cat => cat?.display_image_url || cat?.image_url || cat?.parent_image_url || '';
const categoryInitial = cat => String(cat?.name || '?').trim().slice(0, 1).toUpperCase();
const SellerLogo = ({ seller }) => <div style={{ width:18, height:18, borderRadius:'50%', background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#fff', overflow:'hidden', flexShrink:0 }}>{seller.seller_avatar ? <img src={seller.seller_avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : seller.seller_name?.[0]?.toUpperCase()}</div>;

function CategoryCard({ cat, active, count, onClick }) {
  const img = categoryImage(cat);
  return <button type="button" onClick={onClick} style={{ background: active ? C.infoBg : C.card, border:`1px solid ${active ? C.accent+'88' : C.border}`, borderRadius:8, padding:'16px 12px', textAlign:'center', cursor:'pointer', transition:'border-color .15s', fontFamily:'inherit' }}>
    <div style={{ width:52, height:52, borderRadius:8, overflow:'hidden', margin:'0 auto 10px', background:C.media, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>{img ? <img src={img} alt={cat.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:22, fontWeight:900, color:C.t2 }}>{categoryInitial(cat)}</span>}</div>
    <div style={{ fontSize:13, fontWeight:700, color:active ? C.accent : C.t1, marginBottom:3 }}>{cat.name}</div>
    <div style={{ fontSize:11, color:C.t3 }}>{count ?? (cat.product_count||0).toLocaleString('ru')}</div>
  </button>;
}

export default function HomePage() {
  const [cats, setCats] = useState([]);
  const [popular, setPopular] = useState([]);
  const [newest, setNewest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCatId, setOpenCatId] = useState(null);
  const isMobile = useMediaQuery('(max-width: 760px)');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getCategories({ type: 'product' }), getProducts({ kind:'products', sort:'popular', limit:8 }), getProducts({ kind:'products', sort:'newest', limit:4 })])
      .then(([c,p,n]) => { setCats((c.data || []).filter(x=>x.is_active)); setPopular(p.data.products || []); setNewest(n.data.products || []); })
      .catch(console.error).finally(()=>setLoading(false));
  }, []);

  const rootCats = cats.filter(c => !c.parent_id);
  const selectedRoot = rootCats.find(c => c.id === openCatId) || null;
  const children = selectedRoot ? cats.filter(c => c.parent_id === selectedRoot.id) : [];
  function handleRootClick(cat) {
    const sub = cats.filter(c => c.parent_id === cat.id);
    if (sub.length > 0) setOpenCatId(openCatId === cat.id ? null : cat.id);
    else navigate(`/catalog?kind=products&category=${cat.slug}`);
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div>;

  return <div style={{ maxWidth:1200, margin:'0 auto', padding:'28px 20px', display:'flex', flexDirection:'column', gap:48, width:'100%', boxSizing:'border-box' }} className="fade-in">

    {rootCats.length > 0 && <section>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}><h2 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>Категории</h2><Link to="/catalog?kind=products" style={{ fontSize:13, color:C.accent, textDecoration:'none' }}>Все →</Link></div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10 }}>{rootCats.map(c => <CategoryCard key={c.id} cat={c} active={openCatId === c.id} count={cats.filter(x=>x.parent_id===c.id).length ? `${cats.filter(x=>x.parent_id===c.id).length} подкат.` : (c.product_count||0).toLocaleString('ru')} onClick={() => handleRootClick(c)} />)}</div>
      {selectedRoot && <div style={{ marginTop:14, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}><div style={{ fontSize:14, fontWeight:900, color:C.t1 }}>Подкатегории: {selectedRoot.name}</div><button type="button" onClick={() => navigate(`/catalog?kind=products&category=${selectedRoot.slug}`)} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.accent, borderRadius:8, padding:'7px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Открыть всю категорию</button></div>
        {children.length > 0 ? <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>{children.map(c => <CategoryCard key={c.id} cat={c} onClick={() => navigate(`/catalog?kind=products&category=${c.slug}`)} />)}</div> : <div style={{ color:C.t3, fontSize:13 }}>У этой категории пока нет подкатегорий.</div>}
      </div>}
    </section>}

    {popular.length > 0 && <section><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}><h2 style={{ fontSize:24, fontWeight:650, color:C.t1 }}>Популярное</h2><Link to="/catalog?kind=products&sort=popular" style={{ fontSize:13, color:C.accent, textDecoration:'none' }}>Смотреть все</Link></div><div style={{ display:'grid', gridTemplateColumns:isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fill,minmax(170px,1fr))', gap:isMobile ? 10 : 13 }}>{popular.map(p=><ProductCard key={p.id} p={p}/>)}</div></section>}
    {newest.length > 0 && <section><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}><h2 style={{ fontSize:24, fontWeight:650, color:C.t1 }}>Новые поступления</h2><Link to="/catalog?kind=products&sort=newest" style={{ fontSize:13, color:C.accent, textDecoration:'none' }}>Смотреть все</Link></div><div style={{ display:'grid', gridTemplateColumns:isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fill,minmax(170px,1fr))', gap:isMobile ? 10 : 13 }}>{newest.map(p=><ProductCard key={p.id} p={p}/>)}</div></section>}

    <section aria-label="О площадке SellWay" style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'clamp(20px,4vw,30px)', display:'grid', gap:16 }}>
      <h1 style={{ fontSize:'clamp(20px,3vw,25px)', fontWeight:900, color:C.t1, margin:0 }}>SellWay.pro - маркетплейс цифровых товаров и услуг</h1>
      <p style={{ fontSize:14, color:C.t2, lineHeight:1.75, maxWidth:980, margin:0 }}>На SellWay можно купить и продать цифровые товары: лицензионные ключи, коды активации, файлы, шаблоны, подписки, игровые товары и доступы, передача которых разрешена правилами сервиса. Отдельный каталог услуг объединяет предложения фрилансеров: разработку сайтов, дизайн, настройку сервисов и другие онлайн-работы.</p>
      <p style={{ fontSize:14, color:C.t2, lineHeight:1.75, maxWidth:980, margin:0 }}>Сделки проходят через платформу: оплата резервируется до получения товара или подтверждения выполненной услуги. Для ключей и файлов доступна автоматическая выдача после оплаты, а в ручных заказах покупатель и продавец общаются в чате заказа. При спорной ситуации пользователь может обратиться в поддержку и предоставить доказательства по сделке.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        {[['Цифровые товары','Ключи, файлы, подписки, шаблоны и игровые позиции в каталоге продавцов.'],['Услуги фрилансеров','Отдельные категории услуг с описанием результата, сроков и этапов выполнения.'],['Защита покупки','Безопасная сделка, отзывы, рейтинг продавца и поддержка при проблемах.']].map(([title, text]) => <div key={title} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:'13px 14px' }}><h2 style={{ fontSize:14, fontWeight:800, color:C.t1, margin:'0 0 6px' }}>{title}</h2><p style={{ fontSize:12, color:C.t2, lineHeight:1.6, margin:0 }}>{text}</p></div>)}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:16, fontSize:13 }}><Link to="/catalog?kind=products" style={{ color:C.accent, textDecoration:'none', fontWeight:700 }}>Перейти в каталог товаров</Link><Link to="/catalog?kind=services" style={{ color:C.accent, textDecoration:'none', fontWeight:700 }}>Найти услугу</Link><Link to="/terms" style={{ color:C.accent, textDecoration:'none', fontWeight:700 }}>Правила площадки</Link></div>
    </section>

    <section style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'clamp(22px,5vw,32px)' }}><h2 style={{ fontSize:25, fontWeight:650, color:C.t1, marginBottom:28 }}>Как работает безопасная сделка</h2><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 }}>{[['Выбираете позицию','Находите нужное в каталоге и оформляете заказ'],['Деньги резервируются','Средства хранятся на платформе до подтверждения'],['Получаете результат','Автор передаёт товар или выполняет услугу'],['Подтверждаете','После проверки деньги уходят исполнителю']].map(([t,d],i)=><div key={i} style={{ display:'flex', flexDirection:'column', gap:10 }}><div style={{ width:34, height:34, borderRadius:4, border:`1px solid ${C.accent}`, color:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--sw-serif)', fontSize:15, fontWeight:650 }}>{String(i+1).padStart(2,'0')}</div><div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>{t}</div><div style={{ fontSize:13, color:C.t2, lineHeight:1.5 }}>{d}</div></div>)}</div></section>
    <section style={{ background:C.infoBg, border:`1px solid ${C.accent}33`, borderRadius:8, padding:'clamp(24px,5vw,36px) clamp(20px,5vw,40px)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:20 }}><div><h2 style={{ fontSize:22, fontWeight:900, color:C.t1, marginBottom:8 }}>Начните зарабатывать на SellWay</h2><p style={{ fontSize:14, color:C.t2, maxWidth:460, lineHeight:1.6 }}>Продавайте цифровые товары или услуги с безопасными сделками и понятной комиссией.</p></div><Link to="/register"><button style={{ background:C.accent, border:'none', color:'#fff', borderRadius:8, padding:'14px 28px', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>Стать продавцом →</button></Link></section>
  </div>;
}
