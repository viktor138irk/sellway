import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { C, Btn } from './UI';
import { useAuth } from '../contexts/AuthContext';
import { getSupportChat, sendSupportMessage } from '../api/support';

export default function SupportWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  async function load() {
    if (!user) return;
    try {
      const { data } = await getSupportChat();
      setThread(data.thread || null);
      setMessages(data.messages || []);
    } catch {}
  }

  useEffect(() => {
    if (!open || !user) return undefined;
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [open, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || sending || !user) return;
    const body = text.trim();
    setSending(true);
    setText('');
    try {
      const { data } = await sendSupportMessage(body);
      setThread(data.thread || null);
      setMessages(prev => thread?.id && data.thread?.id !== thread.id ? [data.message] : [...prev, data.message]);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  }

  if (location.pathname.startsWith('/admin')) return null;

  return <>
    {open && <section className="support-chat-panel" style={{ position:'fixed', right:20, bottom:82, width:340, height:450, maxWidth:'calc(100vw - 24px)', maxHeight:'calc(100vh - 108px)', zIndex:5100, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, boxShadow:C.shadow, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'13px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div><div style={{ fontSize:14, fontWeight:900, color:C.t1 }}>Поддержка SellWay</div><div style={{ fontSize:11, color:C.t3 }}>Ответим прямо здесь</div></div>
        <button type="button" onClick={() => setOpen(false)} style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.t2, cursor:'pointer' }}>x</button>
      </div>
      {!user ? <div style={{ flex:1, padding:22, display:'flex', flexDirection:'column', justifyContent:'center', textAlign:'center', gap:14 }}>
        <div style={{ color:C.t2, fontSize:13, lineHeight:1.5 }}>Войдите, чтобы написать в поддержку и получать ответы в своем кабинете.</div>
        <Link to="/login" onClick={() => setOpen(false)} style={{ color:C.accent, fontWeight:800, textDecoration:'none' }}>Войти</Link>
      </div> : <>
        <div style={{ flex:1, padding:12, overflowY:'auto', display:'flex', flexDirection:'column', gap:9 }}>
          {messages.length === 0 && <div style={{ margin:'auto', textAlign:'center', color:C.t3, fontSize:12 }}>Опишите вопрос, мы поможем.</div>}
          {messages.map(m => <div key={m.id} style={{ display:'flex', justifyContent:m.sender_type === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth:'85%', background:m.sender_type === 'user' ? C.accent : C.soft, borderRadius:m.sender_type === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding:'9px 11px', color:m.sender_type === 'user' ? '#fff' : C.t1, fontSize:13, lineHeight:1.45, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{m.message}</div>
          </div>)}
          <div ref={bottomRef} />
        </div>
        {thread?.status === 'closed' && <div style={{ padding:'8px 12px', color:C.t3, fontSize:11, borderTop:`1px solid ${C.border}` }}>Обращение закрыто. Новое сообщение начнет новый диалог.</div>}
        <form onSubmit={send} style={{ padding:10, borderTop:`1px solid ${C.border}`, display:'flex', gap:7 }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Ваш вопрос..." maxLength={2000} style={{ flex:1, minWidth:0, background:C.field, border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 10px', color:C.t1, outline:'none', fontFamily:'inherit' }} />
          <Btn type="submit" size="sm" loading={sending} disabled={!text.trim()}>Отпр.</Btn>
        </form>
      </>}
    </section>}
    <button className="support-chat-button" type="button" onClick={() => setOpen(v => !v)} aria-label="Написать в поддержку" style={{ position:'fixed', right:20, bottom:20, width:54, height:54, borderRadius:'50%', border:'none', background:C.accent, color:'#fff', zIndex:5050, boxShadow:'0 10px 28px rgba(109,88,255,.42)', cursor:'pointer', fontSize:22 }}>?</button>
  </>;
}
