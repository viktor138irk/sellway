import { useState, useEffect } from 'react';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner } from '../../components/UI';
import client from '../../api/client';

export default function FinancesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/seller/dashboard').then(r=>setData(r.data)).catch(console.error).finally(()=>setLoading(false));
  }, []);

  const wallet = data?.wallet;
  return (
    <SellerLayout>
      <div style={{ padding:'28px', maxWidth:800 }} className="fade-in">
        <h1 style={{ fontSize:20, fontWeight:900, color:C.t1, marginBottom:24 }}>💰 Финансы</h1>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        : <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {[['Доступный баланс',`${parseFloat(wallet?.balance||0).toLocaleString('ru')} ₽`,C.green],['Заморожено',`${parseFloat(wallet?.held||0).toLocaleString('ru')} ₽`,C.amber],['Всего получено',`${parseFloat(wallet?.total_in||0).toLocaleString('ru')} ₽`,C.t1]].map(([l,v,c])=>(
                <div key={l} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:12, color:C.t2, marginBottom:6 }}>{l}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:c }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:24, textAlign:'center', color:C.t3 }}>
              <div style={{ fontSize:28, marginBottom:10 }}>📊</div>
              <div style={{ fontSize:14, color:C.t2 }}>История транзакций в разработке</div>
            </div>
          </div>}
      </div>
    </SellerLayout>
  );
}
