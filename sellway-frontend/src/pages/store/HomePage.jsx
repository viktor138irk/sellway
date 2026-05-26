import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProducts, getFeaturedOverview } from '../../api/products';
import { C, Spinner, Stars } from '../../components/UI';
import SellerMeta from '../../components/SellerMeta';
import FavoriteButton from '../../components/FavoriteButton';
import useMediaQuery from '../../hooks/useMediaQuery';

function ProductCard({ p, compact = false }) {
  const [imgIdx, setImgIdx] = useState(0);
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  const images = p.images || [];
  const service = p.delivery_type === 'service';
  const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return (
    <div onClick={() => navigate(`/product/${p.id}`)} onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); setImgIdx(0); }} style={{ background: C.card, border: `1px solid ${hov ? C.accent+'55' : C.border}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s', display: 'flex', flexDirection: 'column', boxShadow: hov ? C.shadow : 'none' }}>
      <div style={{ position: 'relative', height: compact ? 128 : 148, background: C.media, overflow: 'hidden' }}>
        {images.length > 0 ? <img src={images[imgIdx]} alt={p.title} style={{ width:'100%', height:'100%', objectFit:'cover', transition:'transform .3s', transform: hov?'scale(1.04)':'scale(1)' }} /> : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', gap:5, alignItems:'center', justifyContent:'center', color:C.t3 }}><span style={{ fontFamily:'var(--sw-serif)', fontSize:compact ? 27 : 32 }}>{String(p.title || 'S').slice(0,1)}</span><span style={{ fontSize:10, textTransform:'uppercase' }}>{service ? 'Услуга' : 'Товар'}</span></div>}
        <div style={{ position:'absolute', top:8, left:8, display:'flex', flexDirection:'column', gap:4 }}>
          {disc > 0 && <span style={{ background:C.red, color:'#fff', fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>−{disc}%</span>}
          {service && <span style={{ background:C.accent, color:'#fff', fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>Услуга</span>}
        </div>
        <FavoriteButton productId={p.id} floating size={30} />
        {images.length > 1 && <><div style={{ position:'absolute', inset:0, display:'flex' }}>{images.map((_,i)=><div key={i} style={{ flex:1 }} onMouseEnter={()=>setImgIdx(i)} />)}</div><div style={{ position:'absolute', bottom:8, left:0, right:0, display:'flex', justifyContent:'center', gap:4 }}>{images.map((_,i)=><div key={i} style={{ width:i===imgIdx?14:5, height:5, borderRadius:3, background:i===imgIdx?'#fff':'rgba(255,255,255,.4)', transition:'all .2s' }} />)}</div></>}
      </div>
      <div style={{ padding:compact ? '8px 9px' : '10px 11px', display:'flex', flexDirection:'column', gap:5, flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:7, minWidth:0 }}><span style={{ fontSize:compact ? 15 : 16, fontWeight:900, color:C.t1, whiteSpace:'nowrap' }}>{service ? 'от ' : ''}{parseFloat(p.price).toLocaleString('ru')} ₽</span>{p.old_price && <span style={{ fontSize:11, color:C.t3, textDecoration:'line-through', overflow:'hidden', textOverflow:'ellipsis' }}>{parseFloat(p.old_price).toLocaleString('ru')} ₽</span>}</div>
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

const SellerLogo = ({ seller }) => <div style={{ width:18, height:18, borderRadius:'50%', background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#fff', overflow:'hidden', flexShrink:0 }}>{seller.seller_avatar ? <img src={seller.seller_avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : seller.seller_name?.[0]?.toUpperCase()}</div>;

export default function HomePage() {
  const [overview, setOverview] = useState(null);
  const [overviewReady, setOverviewReady] = useState(false);
  const [popular, setPopular] = useState([]);
  const [newest, setNewest] = useState([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useMediaQuery('(max-width: 760px)');

  useEffect(() => {
    Promise.all([getFeaturedOverview().catch(() => ({ data:null })), getProducts({ kind:'products', sort:'popular', limit:8 }), getProducts({ kind:'products', sort:'newest', limit:4 })])
      .then(([o,p,n]) => { setOverview(o.data); setOverviewReady(Boolean(o.data)); setPopular(p.data.products || []); setNewest(n.data.products || []); })
      .catch(console.error).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div>;

  return <div style={{ maxWidth:1200, margin:'0 auto', padding:'28px 20px', display:'flex', flexDirection:'column', gap:48, width:'100%', boxSizing:'border-box' }} className="fade-in">

    <section style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'minmax(245px,.84fr) minmax(270px,1fr) minmax(270px,1fr)', gap:12 }}>
      <div style={{ background:C.infoBg, border:`1px solid ${C.border}`, borderRadius:8, padding:20, display:'flex', flexDirection:'column', gap:18 }}>
        <div>
          <div style={{ color:C.t3, fontSize:11, fontWeight:800, textTransform:'uppercase', marginBottom:8 }}>SellWay сейчас</div>
          <div style={{ fontFamily:'var(--sw-serif)', color:C.t1, fontSize:25, lineHeight:1.25 }}>Живая витрина цифровых товаров и услуг</div>
        </div>
        <div style={{ display:'grid', gap:10 }}>
          {[['Опубликовано', overview?.stats?.active_positions], ['Сделок завершено', overview?.stats?.completed_orders], ['Активных авторов', overview?.stats?.active_authors]].map(([label, value]) => <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, paddingBottom:9, borderBottom:`1px solid ${C.border}` }}><span style={{ color:C.t2, fontSize:12 }}>{label}</span><b style={{ color:C.t1, fontSize:20 }}>{overviewReady ? Number(value || 0).toLocaleString('ru') : '—'}</b></div>)}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}><Link to="/catalog?kind=products" style={{ color:C.accent, fontSize:13, fontWeight:700, textDecoration:'none' }}>Каталог</Link><Link to="/catalog?kind=services" style={{ color:C.accent, fontSize:13, fontWeight:700, textDecoration:'none' }}>Услуги</Link></div>
      </div>
      <FeaturedCreators title="Топ магазинов" empty="Магазины появятся после публикации товаров." people={overview?.stores || []} />
      <FeaturedCreators title="Топ фрилансеров" empty="Фрилансеры появятся после публикации услуг." people={overview?.freelancers || []} />
    </section>

    {popular.length > 0 && <section><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}><h2 style={{ fontSize:24, fontWeight:650, color:C.t1 }}>Популярное</h2><Link to="/catalog?kind=products&sort=popular" style={{ fontSize:13, color:C.accent, textDecoration:'none' }}>Смотреть все</Link></div><div className="market-product-grid" style={{ display:'grid', gridTemplateColumns:isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fill,minmax(170px,1fr))', gap:isMobile ? 10 : 13 }}>{popular.map(p=><ProductCard key={p.id} p={p} compact={isMobile}/>)}</div></section>}
    {newest.length > 0 && <section><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}><h2 style={{ fontSize:24, fontWeight:650, color:C.t1 }}>Новые поступления</h2><Link to="/catalog?kind=products&sort=newest" style={{ fontSize:13, color:C.accent, textDecoration:'none' }}>Смотреть все</Link></div><div className="market-product-grid" style={{ display:'grid', gridTemplateColumns:isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fill,minmax(170px,1fr))', gap:isMobile ? 10 : 13 }}>{newest.map(p=><ProductCard key={p.id} p={p} compact={isMobile}/>)}</div></section>}

    <section aria-label="О площадке SellWay" style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'clamp(20px,4vw,30px)', display:'grid', gap:16 }}>
      <h1 style={{ fontSize:'clamp(20px,3vw,25px)', fontWeight:900, color:C.t1, margin:0 }}>SellWay.pro - маркетплейс цифровых товаров и услуг</h1>
      <p style={{ fontSize:14, color:C.t2, lineHeight:1.75, maxWidth:980, margin:0 }}>На SellWay можно купить и продать цифровые товары: лицензионные ключи, коды активации, файлы, шаблоны, подписки, игровые товары и доступы, передача которых разрешена правилами сервиса. Отдельный каталог услуг объединяет предложения фрилансеров: разработку сайтов, дизайн, настройку сервисов и другие онлайн-работы.</p>
      <p style={{ fontSize:14, color:C.t2, lineHeight:1.75, maxWidth:980, margin:0 }}>Сделки проходят через платформу: оплата резервируется до получения товара или подтверждения выполненной услуги. Для ключей и файлов доступна автоматическая выдача после оплаты, а в ручных заказах покупатель и продавец общаются в чате заказа. При спорной ситуации пользователь может обратиться в поддержку и предоставить доказательства по сделке.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        {[['Цифровые товары','Ключи, файлы, подписки, шаблоны и игровые позиции в каталоге продавцов.'],['Услуги фрилансеров','Отдельные категории услуг с описанием результата, сроков и этапов выполнения.'],['Защита покупки','Безопасная сделка, отзывы, рейтинг продавца и поддержка при проблемах.']].map(([title, text]) => <div key={title} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:'13px 14px' }}><h2 style={{ fontSize:14, fontWeight:800, color:C.t1, margin:'0 0 6px' }}>{title}</h2><p style={{ fontSize:12, color:C.t2, lineHeight:1.6, margin:0 }}>{text}</p></div>)}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:16, fontSize:13 }}><Link to="/catalog?kind=products" style={{ color:C.accent, textDecoration:'none', fontWeight:700 }}>Перейти в каталог товаров</Link><Link to="/catalog?kind=services" style={{ color:C.accent, textDecoration:'none', fontWeight:700 }}>Найти услугу</Link><Link to="/terms" style={{ color:C.accent, textDecoration:'none', fontWeight:700 }}>Правила площадки</Link></div>
    </section>

    <section style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'clamp(22px,5vw,32px)' }}><h2 style={{ fontSize:25, fontWeight:650, color:C.t1, marginBottom:28 }}>Как работает безопасная сделка</h2><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 }}>{[['Выбираете позицию','Находите нужное в каталоге и оформляете заказ'],['Деньги резервируются','Средства хранятся на платформе до подтверждения'],['Получаете результат','Автор передаёт товар или выполняет услугу'],['Подтверждаете','После проверки деньги уходят исполнителю']].map(([t,d],i)=><div key={i} style={{ display:'flex', flexDirection:'column', gap:10 }}><div style={{ width:7, height:7, borderRadius:'50%', background:C.accent, marginTop:8 }} /><div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>{t}</div><div style={{ fontSize:13, color:C.t2, lineHeight:1.5 }}>{d}</div></div>)}</div></section>
    <section style={{ background:C.infoBg, border:`1px solid ${C.accent}33`, borderRadius:8, padding:'clamp(24px,5vw,36px) clamp(20px,5vw,40px)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:20 }}><div><h2 style={{ fontSize:22, fontWeight:900, color:C.t1, marginBottom:8 }}>Начните зарабатывать на SellWay</h2><p style={{ fontSize:14, color:C.t2, maxWidth:460, lineHeight:1.6 }}>Продавайте цифровые товары или услуги с безопасными сделками и понятной комиссией.</p></div><Link to="/register"><button style={{ background:C.accent, border:'none', color:'#fff', borderRadius:8, padding:'14px 28px', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>Стать продавцом →</button></Link></section>
  </div>;
}

function FeaturedCreators({ title, people, empty }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:16 }}>
    <h2 style={{ fontSize:18, fontWeight:650, color:C.t1, margin:'0 0 13px' }}>{title}</h2>
    {people.length === 0 ? <div style={{ color:C.t2, fontSize:13, lineHeight:1.6, padding:'16px 0' }}>{empty}</div> : <div style={{ display:'grid', gap:8 }}>
      {people.map(person => <Link key={person.id} to={`/product/${person.featured_product_id}`} style={{ display:'flex', alignItems:'center', gap:10, padding:10, borderRadius:8, border:`1px solid ${C.border}`, color:'inherit', textDecoration:'none', minWidth:0 }}>
        <div style={{ width:40, height:40, borderRadius:8, background:C.media, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', color:C.accent, fontWeight:800 }}>
          {person.avatar_url ? <img src={person.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : String(person.username || 'S').slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ color:C.t1, fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:5 }}>{person.username}{person.seller_online && <span style={{ width:6, height:6, borderRadius:'50%', background:C.green }} />}</div>
          <div style={{ color:C.t3, fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{person.featured_product_title}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ color:C.amber, fontSize:11, fontWeight:700 }}>{Number(person.seller_rating || 0) > 0 ? `★ ${Number(person.seller_rating).toFixed(1)}` : 'Новый'}</div>
          <div style={{ color:C.t3, fontSize:10 }}>{Number(person.seller_delivery_time_min) > 0 ? `~${person.seller_delivery_time_min} мин` : `${person.active_positions} поз.`}</div>
        </div>
      </Link>)}
    </div>}
  </div>;
}
