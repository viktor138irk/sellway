import { useState, useEffect, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { C, Spinner, Btn, Input, Modal, Toggle } from '../../components/UI';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/products';
import { uploadImages } from '../../api/products';
import { useToast } from '../../contexts/ToastContext';
import client from '../../api/client';

const EMOJIS = ['🎮','🧱','⛏️','🔫','⚔️','💣','🎯','💳','🏆','🌟','🔑','💎','👑','🛡️','⚡','🎲','🎪','🤖','👾','🕹️','💻','📦','🛒','💰','🎁','📱','🎵','🎬'];

function toSlug(s) { return s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''); }

function CategoryForm({ initial, onSave, onCancel }) {
  const ref = useRef();
  const toast = useToast();
  const [name, setName]     = useState(initial?.name || '');
  const [slug, setSlug]     = useState(initial?.slug || '');
  const [emoji, setEmoji]   = useState(initial?.emoji || '🎮');
  const [image, setImage]   = useState(initial?.image_url || null);
  const [active, setActive] = useState(initial?.is_active !== false);
  const [auto, setAuto]     = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [imgFile, setImgFile] = useState(null);

  function handleName(v) { setName(v); if (auto) setSlug(toSlug(v)); }

  async function handleImg(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImgFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImage(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) return toast.warn('Заполните название и slug');
    setSaving(true);
    try {
      let imageUrl = image && !image.startsWith('data:') ? image : undefined;
      if (imgFile) {
        const fd = new FormData(); fd.append('image', imgFile);
        const r = await client.post('/admin/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => null);
        if (r?.data?.url) imageUrl = r.data.url;
      }
      const data = { name: name.trim(), slug: slug.trim(), emoji, is_active: active, ...(imageUrl && { image_url: imageUrl }) };
      if (initial) await updateCategory(initial.id, data); else await createCategory(data);
      toast.success(initial ? 'Категория обновлена' : 'Категория создана');
      onSave();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:C.t2, marginBottom:8 }}>Фото иконки</div>
          <div onClick={()=>ref.current.click()} style={{ width:80, height:80, borderRadius:14, overflow:'hidden', cursor:'pointer', border:`2px dashed ${image?C.accent:C.border}`, background:'#0A0A12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {image ? <img src={image} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : <span style={{ fontSize:30 }}>{emoji}</span>}
          </div>
          {image && <button onClick={()=>{setImage(null);setImgFile(null);}} style={{ background:'transparent', border:'none', color:C.red, fontSize:11, cursor:'pointer', marginTop:4, fontFamily:'inherit' }}>× Удалить</button>}
          <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImg} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.t2, marginBottom:8 }}>Эмодзи (если нет фото)</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, maxHeight:120, overflowY:'auto' }}>
            {EMOJIS.map(e=>(
              <div key={e} onClick={()=>setEmoji(e)} style={{ width:32, height:32, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, cursor:'pointer', background:emoji===e?C.accent+'33':'#0A0A12', border:`1px solid ${emoji===e?C.accent:C.border}` }}>{e}</div>
            ))}
          </div>
        </div>
      </div>
      <Input label="Название *" value={name} onChange={handleName} placeholder="Minecraft" />
      <div>
        <Input label="Slug (URL) *" value={slug} onChange={v=>{setAuto(false);setSlug(v);}} placeholder="minecraft" helper={`/catalog?category=${slug||'...'}`} style={{ fontFamily:'monospace' }} />
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 14px' }}>
        <div><div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>Активна</div><div style={{ fontSize:12, color:C.t2 }}>Показывать в каталоге</div></div>
        <Toggle value={active} onChange={setActive} />
      </div>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <Btn variant="ghost" onClick={onCancel}>Отмена</Btn>
        <Btn loading={saving} onClick={handleSave}>{initial?'Сохранить':'Создать'}</Btn>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const toast = useToast();
  const [cats, setCats]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [editCat, setEditCat]   = useState(null);
  const [deleteCat, setDeleteCat] = useState(null);

  const load = () => { setLoading(true); getCategories().then(r=>setCats(r.data)).catch(()=>toast.error('Ошибка')).finally(()=>setLoading(false)); };
  useEffect(load, []);

  async function handleDelete(id) {
    try { await deleteCategory(id); toast.success('Категория скрыта'); setDeleteCat(null); load(); }
    catch { toast.error('Ошибка'); }
  }

  async function moveOrder(id, dir) {
    const idx = cats.findIndex(c=>c.id===id);
    const other = cats[idx+dir];
    if (!other) return;
    await Promise.all([updateCategory(id, { sort_order: other.sort_order }), updateCategory(other.id, { sort_order: cats[idx].sort_order })]).catch(()=>{});
    load();
  }

  return (
    <AdminLayout>
      <div style={{ padding:'24px 28px' }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>📂 Категории</h1>
          <Btn onClick={()=>{setEditCat(null);setModal('create');}}>+ Создать</Btn>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
          {[cats.length,'Всего',cats.filter(c=>c.is_active).length,'Активных',cats.filter(c=>!c.is_active).length,'Скрытых',cats.reduce((s,c)=>s+(c.product_count||0),0).toLocaleString('ru'),'Товаров'].reduce((acc,v,i)=>i%2===0?[...acc,{v}]:[...acc.slice(0,-1),{...acc[acc.length-1],l:v}],[]).map(({v,l},i)=>(
            <div key={i} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:22, fontWeight:900, color:C.accent, marginBottom:4 }}>{v}</div>
              <div style={{ fontSize:12, color:C.t2 }}>{l}</div>
            </div>
          ))}
        </div>

        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        : <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'30px 56px 1fr 120px 80px 100px 90px', gap:12, padding:'10px 18px', background:'#0A0A12', borderBottom:`1px solid ${C.border}` }}>
              {['','','Название / Slug','Товаров','Порядок','Статус',''].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase', letterSpacing:1 }}>{h}</div>)}
            </div>
            {[...cats].sort((a,b)=>a.sort_order-b.sort_order).map((cat,i,arr)=>(
              <div key={cat.id} style={{ display:'grid', gridTemplateColumns:'30px 56px 1fr 120px 80px 100px 90px', gap:12, padding:'13px 18px', alignItems:'center', borderBottom:`1px solid ${C.border}`, transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background=C.cardHov} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <button onClick={()=>moveOrder(cat.id,-1)} disabled={i===0} style={{ background:'transparent', border:'none', color:C.t3, cursor:'pointer', fontSize:11 }}>▲</button>
                  <button onClick={()=>moveOrder(cat.id,1)} disabled={i===arr.length-1} style={{ background:'transparent', border:'none', color:C.t3, cursor:'pointer', fontSize:11 }}>▼</button>
                </div>
                <div style={{ width:44, height:44, borderRadius:10, overflow:'hidden', background:'#0A0A14', border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {cat.image_url ? <img src={cat.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:22 }}>{cat.emoji||'📂'}</span>}
                </div>
                <div><div style={{ fontSize:14, fontWeight:700, color:C.t1 }}>{cat.name}</div><div style={{ fontSize:11, color:C.t3, fontFamily:'monospace', marginTop:2 }}>/{cat.slug}</div></div>
                <div style={{ fontSize:13, color:C.t2 }}>{(cat.product_count||0).toLocaleString('ru')}</div>
                <div style={{ fontSize:12, color:C.t3 }}>#{cat.sort_order}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Toggle value={cat.is_active} onChange={async v=>{await updateCategory(cat.id,{is_active:v}).catch(()=>{});load();}} />
                  <span style={{ fontSize:10, color:cat.is_active?C.green:C.t3, fontWeight:700 }}>{cat.is_active?'Активна':'Скрыта'}</span>
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  <button onClick={()=>{setEditCat(cat);setModal('edit');}} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.t2, borderRadius:7, padding:'5px 8px', fontSize:11, cursor:'pointer' }}>✏️</button>
                  <button onClick={()=>setDeleteCat(cat)} style={{ background:'transparent', border:`1px solid #3A1A1A`, color:C.red, borderRadius:7, padding:'5px 8px', fontSize:11, cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>}
      </div>

      {(modal==='create'||modal==='edit') && (
        <Modal title={modal==='edit'?`Редактировать: ${editCat?.name}`:'Новая категория'} onClose={()=>setModal(null)}>
          <CategoryForm initial={editCat} onSave={()=>{setModal(null);load();}} onCancel={()=>setModal(null)} />
        </Modal>
      )}
      {deleteCat && (
        <Modal title="Скрыть категорию?" onClose={()=>setDeleteCat(null)} width={400}>
          <div style={{ display:'flex', flexDirection:'column', gap:14, textAlign:'center' }}>
            <div style={{ fontSize:40 }}>{deleteCat.emoji||'📂'}</div>
            <p style={{ fontSize:13, color:C.t2 }}>«{deleteCat.name}» будет скрыта из каталога. Товары останутся.</p>
            <div style={{ display:'flex', gap:10 }}><Btn full variant="ghost" onClick={()=>setDeleteCat(null)}>Отмена</Btn><Btn full variant="danger" onClick={()=>handleDelete(deleteCat.id)}>Скрыть</Btn></div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
