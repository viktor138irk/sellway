import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from './AdminLayout';
import { C, Btn, Spinner, Textarea } from '../../components/UI';
import { closeAdminSupportThread, getAdminSupportThread, getAdminSupportThreads, replyAdminSupportThread } from '../../api/support';
import { useToast } from '../../contexts/ToastContext';

function dateTime(value) {
  return value ? new Date(value).toLocaleString('ru') : '';
}

export default function SupportPage() {
  const toast = useToast();
  const [filter, setFilter] = useState('open');
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadThreads = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await getAdminSupportThreads(filter);
      const next = data.threads || [];
      setThreads(next);
      setSelectedId(current => current || next[0]?.id || '');
    } catch {
      if (!quiet) toast.error('Не удалось загрузить обращения');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [filter]);

  const loadDialog = useCallback(async (quiet = false) => {
    if (!selectedId) {
      setDialog(null);
      return;
    }
    if (!quiet) setDialogLoading(true);
    try {
      const { data } = await getAdminSupportThread(selectedId);
      setDialog(data);
    } catch {
      if (!quiet) toast.error('Не удалось загрузить диалог');
    } finally {
      if (!quiet) setDialogLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    setSelectedId('');
    setDialog(null);
    loadThreads();
  }, [filter, loadThreads]);

  useEffect(() => {
    loadDialog();
    if (!selectedId) return undefined;
    const timer = setInterval(() => {
      loadThreads(true);
      loadDialog(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [selectedId, loadDialog, loadThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialog?.messages?.length]);

  async function sendReply(e) {
    e.preventDefault();
    if (!reply.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      await replyAdminSupportThread(selectedId, reply.trim());
      setReply('');
      await Promise.all([loadDialog(true), loadThreads(true)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отправить ответ');
    } finally {
      setSending(false);
    }
  }

  async function closeThread() {
    if (!selectedId || !window.confirm('Закрыть это обращение? Пользователь сможет создать новое.')) return;
    try {
      await closeAdminSupportThread(selectedId);
      toast.success('Обращение закрыто');
      await Promise.all([loadDialog(true), loadThreads(true)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось закрыть обращение');
    }
  }

  return <AdminLayout>
    <div style={{ padding: '24px 28px' }} className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:18 }}>
        <div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:900, color:C.t1 }}>Поддержка</h1>
          <div style={{ marginTop:4, fontSize:12, color:C.t3 }}>Диалоги с пользователями сайта и ответы из админки</div>
        </div>
        <div style={{ display:'flex', background:C.card, border:`1px solid ${C.border}`, borderRadius:9, overflow:'hidden' }}>
          {[['open', 'Открытые'], ['all', 'Все']].map(([value, label]) =>
            <button key={value} type="button" onClick={() => setFilter(value)} style={{ border:0, padding:'9px 14px', background:filter === value ? C.accent : 'transparent', color:filter === value ? '#fff' : C.t2, cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>{label}</button>
          )}
        </div>
      </div>

      <div className="admin-support-layout" style={{ display:'grid', gridTemplateColumns:'300px minmax(0,1fr)', height:'calc(100vh - 150px)', minHeight:520, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', background:C.card }}>
        <aside className="admin-support-threads" style={{ borderRight:`1px solid ${C.border}`, overflowY:'auto', background:'#0B0B13' }}>
          {loading ? <div style={{ padding:36, display:'flex', justifyContent:'center' }}><Spinner size={26}/></div> :
            threads.length === 0 ? <div style={{ padding:28, color:C.t3, fontSize:13, textAlign:'center' }}>Обращений нет</div> :
              threads.map(thread => <button key={thread.id} type="button" onClick={() => setSelectedId(thread.id)} style={{ width:'100%', textAlign:'left', border:0, borderBottom:`1px solid ${C.border}`, borderLeft:`3px solid ${selectedId === thread.id ? C.accent : 'transparent'}`, background:selectedId === thread.id ? C.accent+'15' : 'transparent', padding:'13px 12px', cursor:'pointer', fontFamily:'inherit' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}>
                  <span style={{ color:C.t1, fontWeight:800, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{thread.username}</span>
                  <span style={{ fontSize:10, color:thread.status === 'open' ? C.green : C.t3 }}>{thread.status === 'open' ? 'Открыт' : 'Закрыт'}</span>
                </div>
                <div style={{ fontSize:11, color:C.t3, marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{thread.email}</div>
                <div style={{ fontSize:12, color:thread.last_sender_type === 'user' ? C.t2 : C.t3, marginTop:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{thread.last_message || 'Нет сообщений'}</div>
                <div style={{ fontSize:10, color:C.t3, marginTop:6 }}>{dateTime(thread.updated_at)}</div>
              </button>)
          }
        </aside>

        <section className="admin-support-dialog" style={{ minWidth:0, display:'flex', flexDirection:'column' }}>
          {!selectedId ? <div style={{ margin:'auto', color:C.t3, fontSize:13 }}>Выберите обращение</div> :
            dialogLoading && !dialog ? <div style={{ margin:'auto' }}><Spinner size={30}/></div> :
              dialog && <>
                <div style={{ padding:'13px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                  <div>
                    <div style={{ color:C.t1, fontSize:14, fontWeight:900 }}>{dialog.thread.username}</div>
                    <div style={{ color:C.t3, fontSize:11 }}>{dialog.thread.email} · {dateTime(dialog.thread.created_at)}</div>
                  </div>
                  {dialog.thread.status === 'open' && <Btn size="sm" variant="ghost" onClick={closeThread}>Закрыть обращение</Btn>}
                </div>
                <div style={{ flex:1, padding:16, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, background:'#0D0D15' }}>
                  {(dialog.messages || []).map(message => <div key={message.id} style={{ display:'flex', justifyContent:message.sender_type === 'admin' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth:'76%' }}>
                      <div style={{ fontSize:10, color:C.t3, marginBottom:3, textAlign:message.sender_type === 'admin' ? 'right' : 'left' }}>{message.sender_type === 'admin' ? 'Поддержка' : dialog.thread.username}</div>
                      <div style={{ background:message.sender_type === 'admin' ? C.accent : '#1A1A28', color:'#fff', borderRadius:message.sender_type === 'admin' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding:'9px 12px', fontSize:13, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{message.message}</div>
                      <div style={{ marginTop:3, color:C.t3, fontSize:10, textAlign:message.sender_type === 'admin' ? 'right' : 'left' }}>{dateTime(message.created_at)}</div>
                    </div>
                  </div>)}
                  <div ref={bottomRef}/>
                </div>
                {dialog.thread.status === 'open' ? <form onSubmit={sendReply} style={{ padding:12, borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'end', gap:10 }}>
                  <div style={{ flex:1 }}><Textarea value={reply} rows={2} maxLength={2000} onChange={e => setReply(e.target.value)} placeholder="Ответ пользователю..."/></div>
                  <Btn type="submit" loading={sending} disabled={!reply.trim()}>Отправить</Btn>
                </form> : <div style={{ padding:14, borderTop:`1px solid ${C.border}`, color:C.t3, textAlign:'center', fontSize:12 }}>Обращение закрыто</div>}
              </>
          }
        </section>
      </div>
    </div>
  </AdminLayout>;
}
