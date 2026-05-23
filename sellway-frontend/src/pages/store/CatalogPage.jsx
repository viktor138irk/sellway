import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getProducts, getCategories } from '../../api/products';
import { C, Spinner, Stars } from '../../components/UI';

function ProductCard({ p }) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  const disc = p.old_price ? Math.round((1-p.price/p.old_price)*100) : 0;
  const img = p.images?.[0] || null;
  return (
    <div onClick={()=>navigate(`/product/${p.id}`)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov?C.cardHov:C.card, border:`1px solid ${hov?C.accent+'55':C.border}`, borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all .18s', display:'flex', flexDirection:'column' }}>
      <div style={{ position:'relative', aspectRatio:'1', background:'#0A0A14', overflow:'hidden' }}>
        {img ? <img src={img} alt={p.title} style={{ width:'100%', height:'100%', objectFit:'cover', transition:'transform .3s', transform:hov?'scale(1.04)':'scale(1)' }} />
             : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:48 }}>📦</div>}
        <div style={{ position:'absolute', top:8, left:8, display:'flex', flexDirection:'column', gap:4 }}>
          {disc>0 && <span style={{ background:C.red, color:'#fff', fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>−{disc}%</span>}
          {p.delivery_type==='auto' && <span style={{ background:C.green, color:'#fff', fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>🔑 Авто</span>}
          {p.delivery_type==='file' && <span style={{ background:C.green, color:'#fff', fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:6 }}>📎 Файл</span>}
        </div>
        {p.keys_count > 0 && <div style={{ position:'absolute', bottom:8, right:8, fontSize:10, background:'rgba(0,0,0,.7)', color:C.t2, padding:'2px 7px', borderRadius:6 }}>{p.keys_count} шт</div>}
      </div>
      <div style={{ padding:'12px 13px', display:'flex', flexDirection:'column', gap:6, flex:1 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:7 }}>
          <span style={{ fontSize:18, fontWeight:900, color:C.t1 }}>{parseFloat(p.price).toLocaleString('ru')} ₽</span>
          {p.old_price && <span style={{ fontSize:12, color:C.t3, textDecoration:'line-through' }}>{parseFloat(p.old_price).toLocaleString('ru')} ₽</span>}
        </div>
        <div style={{ fontSize:13, color:C.t1, lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{p.title}</div>
        {p.rating>0 && <div style={{ display:'flex', alignItems:'center', gap:5 }}><Stars n={p.rating} size={11}/><span style={{ fontSize:11, color:C.t3 }}>{parseFloat(p.rating).toFixed(1)} ({p.reviews_count})</span></div>}
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{p.tags?.slice(0,2).map(t=><span key={t} style={{ fontSize:10, background:'#1A1A28', color:C.t2, padding:'2px 7px', borderRadius:5 }}>{t}</span>)}</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:'auto', paddingTop:8, borderTop:`1px solid ${C.border}` }}>
          <div style={{ width:18, height:18, borderRadius:'50%', background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#fff' }}>{p.seller_name?.[0]?.toUpperCase()}</div>
          <span style={{ fontSize:11, color:C.t2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.seller_name}</span>
          {p.seller_verified && <span style={{ fontSize:9, color:'#60A5FA', background:'#1A2E4A', padding:'1px 5px', borderRadius:4 }}>✓</span>}
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [cats, setCats]         = useState([]);
  const [pagination, setPag]    = useState(null);
  const [loading, setLoading]   = useState(true);
  const [maxPrice, setMaxPrice] = useState(params.get('max_price') || 10000);

  const category = params.get('category') || '';
  const search   = params.get('search')   || '';
  const sort     = params.get('sort')     || 'popular';
  const delivery = params.get('delivery') || '';
  const page     = parseInt(params.get('page') || '1');

  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k,v); else p.delete(k); p.set('page','1'); setParams(p); };

  useEffect(() => { getCategories().then(r=>setCats(r.data.filter(c=>c.is_active))).catch(()=>{}); }, []);

  useEffect(() => {
    setLoading(true);
    getProducts({ category, search, sort, delivery, max_price: maxPrice, page, limit: 24 })
      .then(r => { setProducts(r.data.products); setPag(r.data.pagination); })
      .catch(console.error).finally(()=>setLoading(false));
  }, [category, search, sort, delivery, page, maxPrice]);

  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px 20px', display:'flex', gap:22 }} className="fade-in">
      {/* Sidebar */}
      <aside style={{ width:210, flexShrink:0, display:'flex', flexDirection:'column', gap:14 }}>
        {/* Categories */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:13, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:1.2, color:C.t3, marginBottom:12 }}>Категории</div>
          <div onClick={()=>setParam('category','')}
            style={{ padding:'8px 10px', borderRadius:7, cursor:'pointer', fontSize:13, marginBottom:2, background:!category?'#1A1A30':'transparent', borderLeft:`3px solid ${!category?C.accent:'transparent'}`, color:!category?C.accentL:C.t2 }}>
            🛒 Все товары
          </div>
          {cats.map(c=>(
            <div key={c.id} onClick={()=>setParam('category',c.slug)}
              style={{ padding:'8px 10px', borderRadius:7, cursor:'pointer', fontSize:13, marginBottom:2, background:category===c.slug?'#1A1A30':'transparent', borderLeft:`3px solid ${category===c.slug?C.accent:'transparent'}`, color:category===c.slug?C.accentL:C.t2, display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {c.image_url ? <img src={c.image_url} style={{ width:16, height:16, borderRadius:4, objectFit:'cover' }} /> : <span style={{ fontSize:14 }}>{c.emoji||'🎮'}</span>}
                <span>{c.name}</span>
              </div>
              <span style={{ fontSize:10, color:C.t3 }}>{(c.product_count||0).toLocaleString('ru')}</span>
            </div>
          ))}
        </div>

        {/* Price */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:13, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:1.2, color:C.t3, marginBottom:12 }}>Цена до</div>
          <input type="range" min={100} max={50000} step={100} value={maxPrice}
            onChange={e=>setMaxPrice(e.target.value)} onMouseUp={()=>setParam('max_price',maxPrice)}
            style={{ width:'100%', accentColor:C.accent }} />
          <div style={{ fontSize:14, fontWeight:700, color:C.t1, marginTop:6 }}>{parseInt(maxPrice).toLocaleString('ru')} ₽</div>
        </div>

        {/* Delivery */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:13, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:1.2, color:C.t3, marginBottom:12 }}>Выдача</div>
          {[['','Любая'],['auto','⚡ Авто'],['manual','⏱ Ручная']].map(([v,l])=>(
            <div key={v} onClick={()=>setParam('delivery',v)} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 0', cursor:'pointer', fontSize:13, color:delivery===v?C.t1:C.t2 }}>
              <div style={{ width:15, height:15, borderRadius:'50%', border:`2px solid ${delivery===v?C.accent:'#3A3A50'}`, background:delivery===v?C.accent:'transparent', flexShrink:0, transition:'all .15s' }} />
              {l}
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex:1, minWidth:0 }}>
        {/* Toolbar */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:10 }}>
          <div style={{ fontSize:14, color:C.t2 }}>
            {search && <span>Поиск: <strong style={{ color:C.t1 }}>«{search}»</strong> · </span>}
            Найдено: <span style={{ color:C.t1, fontWeight:700 }}>{pagination?.total?.toLocaleString('ru') || '...'}</span> товаров
          </div>
          <select value={sort} onChange={e=>setParam('sort',e.target.value)}
            style={{ background:C.card, border:`1px solid ${C.border}`, color:C.t1, borderRadius:8, padding:'7px 12px', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}>
            <option value="popular">По популярности</option>
            <option value="newest">Новинки</option>
            <option value="price_asc">Цена ↑</option>
            <option value="price_desc">Цена ↓</option>
            <option value="rating">По рейтингу</option>
          </select>
        </div>

        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        ) : products.length === 0 ? (
          <div style={{ textAlign:'center', padding:80, color:C.t3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
            <div style={{ fontSize:16, color:C.t2, marginBottom:8 }}>Ничего не найдено</div>
            <button onClick={()=>setParams({})} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.accent, borderRadius:8, padding:'8px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Сбросить фильтры</button>
          </div>
        ) : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:16, marginBottom:24 }}>
              {products.map(p=><ProductCard key={p.id} p={p}/>)}
            </div>
            {pagination && pagination.pages > 1 && (
              <div style={{ display:'flex', justifyContent:'center', gap:6 }}>
                {Array.from({ length: pagination.pages }, (_,i)=>i+1).filter(n=>Math.abs(n-page)<=2||n===1||n===pagination.pages).map((n,i,arr)=>(
                  <span key={n}>
                    {i>0 && arr[i-1]!==n-1 && <span style={{ color:C.t3, padding:'0 4px' }}>…</span>}
                    <button onClick={()=>setParam('page',String(n))}
                      style={{ width:36, height:36, borderRadius:8, background:n===page?C.accent:'transparent', border:`1px solid ${n===page?'transparent':C.border}`, color:n===page?'#fff':C.t2, fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:n===page?700:400 }}>
                      {n}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
