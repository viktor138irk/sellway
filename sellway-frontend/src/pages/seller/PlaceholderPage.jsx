import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Card } from '../../components/UI';

const CONTENT = {
  reviews: {
    icon: '⭐',
    title: 'Отзывы',
    text: 'Здесь будут отзывы покупателей по вашим товарам.',
  },
  promo: {
    icon: '🏷️',
    title: 'Акции',
    text: 'Здесь будут промокоды и акции для ваших товаров.',
  },
};

export default function SellerPlaceholderPage({ type }) {
  const item = CONTENT[type] || CONTENT.reviews;
  return (
    <SellerLayout>
      <div style={{ padding:'28px', maxWidth:760 }} className="fade-in">
        <Card style={{ padding:40, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>{item.icon}</div>
          <h1 style={{ fontSize:22, fontWeight:900, color:C.t1, marginBottom:8 }}>{item.title}</h1>
          <p style={{ fontSize:14, color:C.t2, marginBottom:0 }}>{item.text}</p>
        </Card>
      </div>
    </SellerLayout>
  );
}
