import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner } from '../../components/UI';
import { getLogs } from '../../api/admin';

const ACTION_COLOR = {
  login: C.green, logout: C.t2, register: C.accent,
  product_approved: C.green, product_rejected: C.red,
  dispute_resolved: C.accent, user_banned: C.red, user_updated: C.amber,
  withdraw_approved: C.green, withdraw_rejected: C.red, settings_updated: C.amber,
};

export default function LogsPage() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    getLogs({ limit: 200 })
      .then(r => setLogs(r.data.logs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(l =>
    !search || l.action?.includes(search) || l.username?.includes(search) || l.entity?.includes(search)
  );

  return (
    <AdminLayout>
      <div style={{ padding:'24px 28px' }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:650, color:C.t1, marginBottom:2 }}>Аудит-логи</h1>
            <p style={{ fontSize:13, color:C.t2 }}>История действий пользователей и системы</p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ fontSize:12, color:C.t3 }}>Показано: <span style={{ color:C.t1, fontWeight:700 }}>{filtered.length}</span></div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position:'relative', marginBottom:18, maxWidth:360 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:C.t3, fontSize:14, pointerEvents:'none' }}>?</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по действию, пользователю..."
            style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 12px 9px 36px', color:C.t1, fontSize:13, outline:'none', fontFamily:'inherit' }} />
        </div>

        {loading
          ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
          : <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'140px 200px 1fr 100px', gap:12, padding:'10px 18px', background:C.field, borderBottom:`1px solid ${C.border}` }}>
                {['Время','Действие','Детали','Пользователь'].map((h,i) => (
                  <div key={i} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase', letterSpacing:1 }}>{h}</div>
                ))}
              </div>

              <div style={{ maxHeight:'calc(100vh - 280px)', overflowY:'auto' }}>
                {filtered.length === 0
                  ? <div style={{ padding:40, textAlign:'center', color:C.t3 }}>Нет записей</div>
                  : filtered.map((l, i) => {
                    const color = ACTION_COLOR[l.action] || C.t2;
                    return (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'140px 200px 1fr 100px', gap:12, padding:'10px 18px', borderBottom:`1px solid ${C.border}`, alignItems:'flex-start', transition:'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.cardHov}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontFamily:'monospace', fontSize:11, color:C.t3 }}>
                          {new Date(l.created_at).toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0, marginTop:2 }} />
                          <span style={{ fontSize:12, fontWeight:700, color }}>{l.action}</span>
                        </div>
                        <div style={{ fontSize:12, color:C.t2 }}>
                          {l.entity && <span style={{ color:C.t3 }}>{l.entity} </span>}
                          {l.entity_id && <span style={{ fontFamily:'monospace', fontSize:10, color:C.t3 }}>{l.entity_id?.slice(0,8)}...</span>}
                          {l.new_data && <div style={{ fontSize:11, color:C.t3, marginTop:3, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{JSON.stringify(l.new_data).slice(0,80)}</div>}
                        </div>
                        <div style={{ fontSize:11, color:C.t2, fontWeight:600 }}>{l.username || 'система'}</div>
                      </div>
                    );
                  })}
              </div>
            </div>}
      </div>
    </AdminLayout>
  );
}
