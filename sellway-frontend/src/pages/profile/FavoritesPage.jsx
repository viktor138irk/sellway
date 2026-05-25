import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProduct } from '../../api/products';
import { C, Btn, Spinner } from '../../components/UI';
import FavoriteButton from '../../components/FavoriteButton';
import { readFavorites, subscribeFavorites } from '../../utils/favorites';

const money = value => `${Number(value || 0).toLocaleString('ru')} ₽`;

export default function FavoritesPage() {
  const navigate = useNavigate();
  const [ids, setIds] = useState(readFavorites);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeFavorites(setIds), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(ids.map(id => getProduct(id).then(response => response.data).catch(() => null)))
      .then(items => {
        if (alive) setProducts(items.filter(Boolean));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [ids.join('|')]);

  return <div style={{ maxWidth:1050, margin:'0 auto', padding:'clamp(16px,4vw,28px) 20px', width:'100%' }} className="fade-in">
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:22 }}>
      <div>
        <h1 style={{ fontSize:25, fontWeight:650, color:C.t1, margin:0 }}>Избранное</h1>
        <div style={{ fontSize:13, color:C.t2, marginTop:5 }}>Сохранённые товары и услуги</div>
      </div>
      <Link to="/profile/purchases"><Btn size="sm" variant="ghost">Покупки</Btn></Link>
    </div>
    {loading ? <div style={{ display:'flex', justifyContent:'center', padding:70 }}><Spinner size={32}/></div>
    : products.length === 0 ? <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'54px 20px', textAlign:'center' }}>
        <div style={{ color:C.t1, fontSize:17, fontWeight:700, marginBottom:8 }}>Избранных позиций пока нет</div>
        <div style={{ color:C.t2, fontSize:13, marginBottom:20 }}>Нажимайте на сердце в каталоге, чтобы вернуться к позиции позже.</div>
        <Link to="/catalog?kind=products"><Btn>Открыть каталог</Btn></Link>
      </div>
    : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(225px,1fr))', gap:12 }}>
        {products.map(product => <div key={product.id} role="button" tabIndex={0} onClick={() => navigate(`/product/${product.id}`)} onKeyDown={event => event.key === 'Enter' && navigate(`/product/${product.id}`)} style={{ cursor:'pointer', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden', minWidth:0 }}>
          <div style={{ position:'relative', height:132, background:C.media }}>
            {product.images?.[0] ? <img src={product.images[0]} alt={product.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--sw-serif)', fontSize:36, color:C.accent }}>{String(product.title || 'S').slice(0, 1)}</div>}
            <FavoriteButton productId={product.id} floating />
          </div>
          <div style={{ padding:12 }}>
            <div style={{ color:C.t1, fontSize:14, fontWeight:700, lineHeight:1.35, marginBottom:8 }}>{product.title}</div>
            <div style={{ color:C.t1, fontSize:16, fontWeight:900 }}>{product.delivery_type === 'service' ? 'от ' : ''}{money(product.price)}</div>
            <div style={{ color:C.t2, fontSize:11, marginTop:8 }}>{product.seller_name || 'SellWay'}</div>
          </div>
        </div>)}
      </div>}
  </div>;
}
