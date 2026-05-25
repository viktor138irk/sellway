import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProducts, getCategories } from '../../api/products';
import { C, Spinner, Stars } from '../../components/UI';
import SellerMeta from '../../components/SellerMeta';
import useMediaQuery from '../../hooks/useMediaQuery';

const money = v => `${parseFloat(v || 0).toLocaleString('ru')} ₽`;

function ProductCard({ p, compact }) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  const service = p.delivery_type === 'service';
  const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const img = p.images?.[0] || p.main_image || null;
  const imageSize = compact ? 132 : 154;

  return (
    <button type="button" onClick={() => navigate(`/product/${p.id}`)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? C.cardHov : C.card, border: `1px solid ${hov ? C.accent + '55' : C.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'all .18s', display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0, fontFamily: 'inherit', minWidth: 0 }}>
      <div style={{ position: 'relative', height: imageSize, background: '#0A0A14', overflow: 'hidden' }}>
        {img ? <img src={img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .3s', transform: hov ? 'scale(1.04)' : 'scale(1)' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 30 : 38 }}>{service ? '🧑‍💻' : '📦'}</div>}
        <div style={{ position: 'absolute', top: 7, left: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {disc > 0 && <span style={{ background: C.red, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6 }}>-{disc}%</span>}
          {service && <span style={{ background: C.accent, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6 }}>Услуга</span>}
        </div>
      </div>
      <div style={{ padding: compact ? '9px 10px' : '10px 11px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: compact ? 15 : 16, fontWeight: 900, color: C.t1, whiteSpace: 'nowrap' }}>{service ? 'от ' : ''}{money(p.price)}</span>
          {p.old_price && <span style={{ fontSize: 11, color: C.t3, textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis' }}>{money(p.old_price)}</span>}
        </div>
        <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.35, minHeight: 33, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</div>
        {p.rating > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Stars n={p.rating} size={10} /><span style={{ fontSize: 10, color: C.t3 }}>{parseFloat(p.rating).toFixed(1)}</span></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 6, borderTop: `1px solid ${C.border}`, minWidth: 0 }}>
          <SellerLogo seller={p} service={service} />
          <span style={{ fontSize: 10, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.seller_name}</span>
          {Number(p.seller_rating) > 0 && <span style={{ fontSize: 10, color: C.amber, whiteSpace: 'nowrap' }}>★ {Number(p.seller_rating).toFixed(1)}</span>}
        </div>
        <SellerMeta seller={p} compact />
      </div>
    </button>
  );
}

const categoryImage = cat => cat?.display_image_url || cat?.image_url || cat?.parent_image_url || '';
const categoryInitial = cat => String(cat?.name || '?').trim().slice(0, 1).toUpperCase();
const SellerLogo = ({ seller, service }) => <div style={{ width: 17, height: 17, borderRadius: '50%', background: service ? C.accent : C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', overflow:'hidden', flexShrink: 0 }}>{seller.seller_avatar ? <img src={seller.seller_avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : seller.seller_name?.[0]?.toUpperCase()}</div>;

function CategoryRow({ cat, active, onClick, indent = 0 }) {
  const img = categoryImage(cat);
  return <button type="button" onClick={onClick} style={{ width: '100%', padding: `8px 10px 8px ${10 + indent}px`, borderRadius: 7, cursor: 'pointer', fontSize: 13, marginBottom: 2, background: active ? '#1A1A30' : 'transparent', border: 'none', borderLeft: `3px solid ${active ? C.accent : 'transparent'}`, color: active ? C.accentL : C.t2, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', textAlign: 'left', fontFamily: 'inherit' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {img ? <img src={img} style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} alt="" /> : <span style={{ width: 16, height: 16, borderRadius: 4, background: '#1A1A28', color: C.t2, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{categoryInitial(cat)}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
    </span>
    <span style={{ fontSize: 10, color: C.t3 }}>{(cat.product_count || 0).toLocaleString('ru')}</span>
  </button>;
}

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [pagination, setPag] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useMediaQuery('(max-width: 760px)');

  const kind = params.get('kind') === 'services' ? 'services' : 'products';
  const category = params.get('category') || '';
  const search = params.get('search') || '';
  const sort = params.get('sort') || 'popular';
  const maxPrice = params.get('max_price') || '';
  const page = parseInt(params.get('page') || '1');

  const rootCats = useMemo(() => cats.filter(c => !c.parent_id), [cats]);
  const selectedCat = cats.find(c => c.slug === category) || null;
  const selectedRoot = selectedCat?.parent_id ? cats.find(c => c.id === selectedCat.parent_id) : selectedCat;
  const visibleChildren = selectedRoot ? cats.filter(c => c.parent_id === selectedRoot.id) : [];

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k === 'kind') {
      p.delete('category');
      p.delete('delivery');
    }
    if (k === 'category' && v && cats.find(c => c.slug === v && !c.parent_id)) p.delete('subcategory');
    p.set('page', '1');
    setParams(p);
  };

  useEffect(() => {
    setCats([]);
    getCategories({ type: kind === 'services' ? 'service' : 'product' })
      .then(r => setCats(r.data.filter(c => c.is_active)))
      .catch(() => {});
  }, [kind]);
  useEffect(() => {
    setLoading(true);
    getProducts({ kind, category, search, sort, max_price: maxPrice || undefined, page, limit: 30 })
      .then(r => { setProducts(r.data.products || []); setPag(r.data.pagination); })
      .catch(console.error).finally(() => setLoading(false));
  }, [kind, category, search, sort, page, maxPrice]);

  const title = kind === 'services' ? 'Услуги фрилансеров' : 'Каталог товаров';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 14 : 22, width: '100%', boxSizing: 'border-box' }} className="fade-in">
      <aside style={{ width: isMobile ? '100%' : 230, flexShrink: 0, display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 12, overflowX: isMobile ? 'auto' : 'visible', alignItems: isMobile ? 'stretch' : 'normal' }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: 14, minWidth: isMobile ? 280 : 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: C.t3, marginBottom: 12 }}>Категории</div>
          <CategoryRow cat={{ name: kind === 'services' ? 'Все услуги' : 'Все товары', emoji: '•' }} active={!category} onClick={() => setParam('category', '')} />
          {rootCats.map(c => <CategoryRow key={c.id} cat={c} active={selectedRoot?.id === c.id && selectedCat?.id === c.id} onClick={() => setParam('category', c.slug)} />)}
          {selectedRoot && visibleChildren.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.t3, margin: '0 0 7px 10px' }}>Подкатегории</div>
            {visibleChildren.map(c => <CategoryRow key={c.id} cat={c} indent={12} active={selectedCat?.id === c.id} onClick={() => setParam('category', c.slug)} />)}
          </div>}
        </div>

      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div><h1 style={{ fontSize: 21, color: C.t1, fontWeight: 900, marginBottom: 3 }}>{title}</h1><div style={{ fontSize: 13, color: C.t2 }}>{search && <span>Поиск: <strong style={{ color: C.t1 }}>{search}</strong> · </span>}Найдено: <span style={{ color: C.t1, fontWeight: 700 }}>{pagination?.total?.toLocaleString('ru') || '...'}</span></div></div>
          <select value={sort} onChange={e => setParam('sort', e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}><option value="popular">По популярности</option><option value="newest">Новинки</option><option value="price_asc">Цена вверх</option><option value="price_desc">Цена вниз</option><option value="rating">По рейтингу</option></select>
        </div>
        {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div> : products.length === 0 ? <div style={{ textAlign: 'center', padding: 70, color: C.t3 }}><div style={{ fontSize: 16, color: C.t2, marginBottom: 8 }}>Ничего не найдено</div><button onClick={() => setParams({ kind })} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.accent, borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Сбросить фильтры</button></div> : <><div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fill,minmax(168px,1fr))', gap: isMobile ? 10 : 13, marginBottom: 24 }}>{products.map(p => <ProductCard key={p.id} p={p} compact={isMobile} />)}</div>{pagination && pagination.pages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: pagination.pages }, (_, i) => i + 1).filter(n => Math.abs(n - page) <= 2 || n === 1 || n === pagination.pages).map(n => <button key={n} onClick={() => setParam('page', String(n))} style={{ width: 36, height: 36, borderRadius: 8, background: n === page ? C.accent : 'transparent', border: `1px solid ${n === page ? 'transparent' : C.border}`, color: n === page ? '#fff' : C.t2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: n === page ? 700 : 400 }}>{n}</button>)}</div>}</>}
      </main>
    </div>
  );
}
