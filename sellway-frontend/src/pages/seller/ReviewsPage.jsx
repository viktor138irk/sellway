import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Card, Spinner, Stars } from '../../components/UI';
import { getReviews } from '../../api/seller';
import { useToast } from '../../contexts/ToastContext';

export default function ReviewsPage() {
  const toast = useToast();
  const [state, setState] = useState({ reviews: [], count: 0, average: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReviews()
      .then(({ data }) => setState(data))
      .catch(() => toast.error('Не удалось загрузить отзывы'))
      .finally(() => setLoading(false));
  }, []);

  return <SellerLayout><div style={{ padding:'clamp(16px,4vw,28px)', maxWidth:940, display:'grid', gap:20 }} className="fade-in">
    <header>
      <h1 style={{ fontSize:30, color:C.t1, margin:'0 0 5px' }}>Отзывы</h1>
      <p style={{ margin:0, fontSize:13, color:C.t2 }}>Оценки от покупателей и заказчиков после завершенных сделок.</p>
    </header>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
      <Card style={{ padding:18 }}><div style={{ fontSize:11, color:C.t3, marginBottom:6 }}>Средняя оценка</div><div style={{ display:'flex', alignItems:'center', gap:10 }}><b style={{ fontFamily:'var(--sw-serif)', fontSize:32, color:C.t1 }}>{state.average ? state.average.toFixed(1) : '-'}</b><Stars n={state.average} size={18}/></div></Card>
      <Card style={{ padding:18 }}><div style={{ fontSize:11, color:C.t3, marginBottom:6 }}>Всего отзывов</div><b style={{ fontFamily:'var(--sw-serif)', fontSize:32, color:C.t1 }}>{state.count}</b></Card>
    </div>
    <Card style={{ overflow:'hidden' }}>
      {loading ? <div style={{ padding:50, display:'flex', justifyContent:'center' }}><Spinner/></div>
        : state.reviews.length === 0 ? <div style={{ padding:48, textAlign:'center', color:C.t2 }}>После первых завершенных сделок отзывы появятся здесь.</div>
        : state.reviews.map(review => <div key={review.id} style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'grid', gap:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div><b style={{ color:C.t1, fontSize:14 }}>{review.buyer_name}</b><div style={{ color:C.t3, fontSize:11, marginTop:3 }}>{review.product_title} · {review.order_number}</div></div>
            <div style={{ textAlign:'right' }}><Stars n={review.rating} size={15}/><div style={{ color:C.t3, fontSize:11, marginTop:3 }}>{new Date(review.created_at).toLocaleDateString('ru')}</div></div>
          </div>
          {review.comment && <div style={{ background:C.field, borderRadius:8, padding:'10px 12px', fontSize:13, color:C.t2, lineHeight:1.55 }}>{review.comment}</div>}
          <Link to={`/product/${review.product_id}`} style={{ color:C.accent, textDecoration:'none', fontSize:12, fontWeight:700 }}>Открыть позицию</Link>
        </div>)}
    </Card>
  </div></SellerLayout>;
}
