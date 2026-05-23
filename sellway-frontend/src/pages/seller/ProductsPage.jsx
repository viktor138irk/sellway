import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner, Btn, Input, Select, Textarea, Modal } from '../../components/UI';
import { getProducts, getProduct, createProduct, updateProduct, deleteProduct, uploadImages, addKeys, getKeys, getCategories } from '../../api/products';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const readFile = f => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(f); });

function ImageUpload({ images, onChange, max=8 }) {
  const ref = useRef();
  async function handleFiles(files) {
    const loaded = await Promise.all(Array.from(files).slice(0, max-images.length).map(f => ({ file: f, preview: URL.createObjectURL(f) })));
    onChange([...images, ...loaded]);
  }
  function remove(i) { onChange(images.filter((_,idx)=>idx!==i)); }
  function setMain(i) { const n=[...images]; const [it]=n.splice(i,1); onChange([it,...n]); }
  function move(from, to) { if(to<0||to>=images.length) return; const n=[...images]; const [it]=n.splice(from,1); n.splice(to,0,it); onChange(n); }
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:700, color:C.t2, marginBottom:8 }}>Фотографии <span style={{ color:C.t3, fontWeight:400 }}>({images.length}/{max}, первое — главное)</span></div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {images.map((img,i)=>(
          <div key={i} style={{ position:'relative', aspectRatio:'1', borderRadius:10, overflow:'hidden', border:`2px solid ${i===0?C.accent:C.border}`, background:'#0A0A12' }}>
            <img src={img.preview||img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            {i===0 && <div style={{ position:'absolute', top:5, left:5, background:C.accent, color:'#fff', fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:4 }}>ГЛАВНОЕ</div>}
            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)', opacity:0, transition:'opacity .15s', display:'flex', alignItems:'center', justifyContent:'center', gap:4, flexWrap:'wrap', padding:4 }}
              onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              {i!==0 && <button onClick={()=>setMain(i)} style={{ background:C.accent, border:'none', color:'#fff', borderRadius:5, padding:'3px 7px', fontSize:10, cursor:'pointer' }}>★</button>}
              <button onClick={()=>move(i,i-1)} disabled={i===0} style={{ background:'#1A1A28', border:'none', color:'#fff', borderRadius:5, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>←</button>
              <button onClick={()=>move(i,i+1)} disabled={i===images.length-1} style={{ background:'#1A1A28', border:'none', color:'#fff', borderRadius:5, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>→</button>
              <button onClick={()=>remove(i)} style={{ background:'#3A1010', border:'none', color:C.red, borderRadius:5, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>✕</button>
            </div>
          </div>
        ))}
        {images.length < max && (
          <div onClick={()=>ref.current.click()} style={{ aspectRatio:'1', borderRadius:10, border:`2px dashed ${C.border}`, background:'#0A0A12', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', gap:6 }}>
            <div style={{ fontSize:24, opacity:.4 }}>+</div>
            <div style={{ fontSize:10, color:C.t3, textAlign:'center' }}>Добавить</div>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e=>handleFiles(e.target.files)} />
    </div>
  );
}

function CategoryIcon({ category, size = 28 }) {
  return (
    <span style={{ width:size, height:size, borderRadius:8, overflow:'hidden', background:'#0A0A14', border:`1px solid ${C.border}`, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      {category?.image_url
        ? <img src={category.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        : <span style={{ fontSize:Math.max(16, Math.round(size * 0.55)) }}>{category?.emoji || '📂'}</span>}
    </span>
  );
}

function CategoryPicker({ categories, value, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <label style={{ fontSize:12, fontWeight:700, color:C.t2 }}>Категория *</label>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:8 }}>
        {categories.map(cat => {
          const selected = value === cat.id;
          return (
            <button key={cat.id} type="button" onClick={() => onChange(cat.id)}
              style={{ display:'flex', alignItems:'center', gap:9, minHeight:44, background:selected ? C.accent+'18' : '#0A0A12',
                border:`1px solid ${selected ? C.accent : C.border}`, borderRadius:9, color:selected ? C.t1 : C.t2,
                padding:'8px 10px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'border-color .15s, background .15s' }}>
              <CategoryIcon category={cat} />
              <span style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductForm({ productId, onSave, onCancel }) {
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState([]);
  const [keysText, setKeysText] = useState('');
  const [existingKeys, setExistingKeys] = useState([]);
  const [form, setForm] = useState({ title:'', short_desc:'', description:'', price:'', old_price:'', category_id:'', delivery_type:'auto', guarantee_days:0, tags:'' });
  const set = k => v => setForm(f=>({...f,[k]:v}));
  const setFromInput = k => e => set(k)(e.target.value);

  useEffect(() => {
    getCategories().then(r=>setCats(r.data)).catch(()=>{});
    if (productId) {
      setLoading(true);
      Promise.all([getProduct(productId), getKeys(productId)])
        .then(([pr, kr]) => {
          const p = pr.data;
          setForm({ title:p.title||'', short_desc:p.short_desc||'', description:p.description||'', price:p.price||'', old_price:p.old_price||'', category_id:p.category_id||'', delivery_type:p.delivery_type||'auto', guarantee_days:p.guarantee_days||0, tags:(p.tags||[]).join(', ') });
          setImages((p.images||[]).map(url=>({ preview:url })));
          setExistingKeys(kr.data);
        }).catch(()=>toast.error('Ошибка загрузки товара'))
        .finally(()=>setLoading(false));
    }
  }, [productId]);

  async function handleSave() {
    if (!form.title || !form.price || !form.category_id) return toast.warn('Заполните обязательные поля');
    setSaving(true);
    try {
      const body = { ...form, price:parseFloat(form.price), old_price:form.old_price?parseFloat(form.old_price):null, tags:form.tags.split(',').map(s=>s.trim()).filter(Boolean) };
      let saved;
      if (productId) { const r = await updateProduct(productId, body); saved = r.data; }
      else { const r = await createProduct(body); saved = r.data; }

      // Upload new images
      const newImgs = images.filter(img=>img.file);
      if (newImgs.length > 0) {
        const fd = new FormData();
        newImgs.forEach(img => fd.append('images', img.file));
        await uploadImages(saved.id, fd).catch(()=>toast.warn('Некоторые фото не загрузились'));
      }

      // Add new keys
      const keys = keysText.split('\n').map(s=>s.trim()).filter(Boolean);
      if (keys.length > 0) {
        await addKeys(saved.id, keys).catch(()=>toast.warn('Некоторые ключи не добавились'));
      }

      toast.success(productId ? 'Товар обновлён и отправлен на проверку' : 'Товар создан и отправлен на модерацию');
      onSave();
    } catch(err) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения');
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60 }}><Spinner size={36}/></div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <ImageUpload images={images} onChange={setImages} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <Input label="Название товара *" value={form.title} onChange={setFromInput('title')} placeholder="CS2 Аккаунт | Prime Status | Gold Nova Master" />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <CategoryPicker categories={cats} value={form.category_id} onChange={set('category_id')} />
        </div>
        <Select label="Тип выдачи" value={form.delivery_type} onChange={e=>set('delivery_type')(e.target.value)}>
          <option value="auto">⚡ Автоматическая (ключи)</option>
          <option value="manual">⏱ Ручная (вручную)</option>
        </Select>
        <Input label="Цена (₽) *" type="number" value={form.price} onChange={setFromInput('price')} placeholder="1200" />
        <Input label="Старая цена (₽)" type="number" value={form.old_price} onChange={setFromInput('old_price')} placeholder="1500 (необязательно)" />
        <Input label="Краткое описание" value={form.short_desc} onChange={setFromInput('short_desc')} placeholder="В 1-2 предложения" />
        <Input label="Гарантия (дней)" type="number" value={form.guarantee_days} onChange={setFromInput('guarantee_days')} placeholder="30" />
        <div style={{ gridColumn:'1/-1' }}>
          <Input label="Теги (через запятую)" value={form.tags} onChange={setFromInput('tags')} placeholder="Prime Status, С почтой, EU сервер" />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <Textarea label="Подробное описание" value={form.description} onChange={e=>set('description')(e.target.value)} rows={5} placeholder="Опишите товар подробно: что входит, как передаётся, особенности..." style={{ width:'100%' }} />
        </div>
      </div>

      {/* Keys */}
      <div style={{ background:'#0A0A12', border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>🔑 Ключи / коды</div>
          {existingKeys.length > 0 && <span style={{ fontSize:11, color:C.t2 }}>Уже добавлено: {existingKeys.filter(k=>!k.is_sold).length} доступных</span>}
        </div>
        <Textarea label="Добавить новые ключи (по одному на строку)" value={keysText} onChange={e=>setKeysText(e.target.value)} rows={5}
          placeholder={"XXXXX-XXXXX-XXXXX\nYYYYY-YYYYY-YYYYY\nZZZZZ-ZZZZZ-ZZZZZ"} style={{ width:'100%', fontFamily:'monospace', fontSize:13 }} />
        {existingKeys.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:11, color:C.t3, marginBottom:8 }}>Существующие ключи:</div>
            <div style={{ maxHeight:120, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
              {existingKeys.map(k=>(
                <div key={k.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', borderRadius:6, padding:'5px 10px', fontSize:11, fontFamily:'monospace' }}>
                  <span style={{ color:k.is_sold?C.t3:C.t1 }}>{k.key_value.slice(0,20)}...</span>
                  <span style={{ color:k.is_sold?C.red:C.green, fontWeight:700 }}>{k.is_sold?'Продан':'Доступен'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ background:'#0A1A0A', border:`1px solid ${C.green}33`, borderRadius:10, padding:'12px 16px', fontSize:12, color:C.green }}>
        💡 После сохранения товар уйдёт на модерацию. Комиссия платформы: <strong>7%</strong>. Ваш доход с этого товара: <strong>{form.price ? Math.floor(+form.price*0.93).toLocaleString('ru') : '—'} ₽</strong>
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <Btn variant="ghost" onClick={onCancel}>Отмена</Btn>
        <Btn loading={saving} onClick={handleSave}>{productId ? 'Сохранить изменения' : 'Опубликовать товар'}</Btn>
      </div>
    </div>
  );
}

export default function ProductsPage({ mode }) {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const isForm = mode === 'create' || mode === 'edit';

  useEffect(() => { if (!isForm) loadProducts(); }, [isForm]);

  async function loadProducts() {
    setLoading(true);
    try { const r = await getProducts({ seller: user?.id, limit: 50 }); setProducts(r.data.products); }
    catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }

  async function handleDelete(id) {
    try { await deleteProduct(id); toast.success('Товар архивирован'); setDeleteId(null); loadProducts(); }
    catch { toast.error('Ошибка удаления'); }
  }

  const STATUS_COLOR = { active:C.green, pending:C.amber, rejected:C.red, archived:C.t3, draft:C.t2 };
  const STATUS_LABEL = { active:'Активен', pending:'На проверке', rejected:'Отклонён', archived:'Архив', draft:'Черновик' };

  if (isForm) return (
    <SellerLayout>
      <div style={{ padding:'28px', maxWidth:820 }} className="fade-in">
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <button onClick={()=>navigate('/seller/products')} style={{ background:'transparent', border:'none', color:C.t2, fontSize:20, cursor:'pointer' }}>←</button>
          <h1 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>{mode==='edit'?'Редактировать товар':'Новый товар'}</h1>
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
          <ProductForm productId={editId} onSave={()=>navigate('/seller/products')} onCancel={()=>navigate('/seller/products')} />
        </div>
      </div>
    </SellerLayout>
  );

  return (
    <SellerLayout>
      <div style={{ padding:'28px' }} className="fade-in">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h1 style={{ fontSize:20, fontWeight:900, color:C.t1 }}>Мои товары</h1>
          <Btn onClick={()=>navigate('/seller/products/new')} icon="+">Добавить товар</Btn>
        </div>

        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}><Spinner size={36}/></div>
        ) : products.length === 0 ? (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:60, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
            <div style={{ fontSize:18, fontWeight:700, color:C.t2, marginBottom:8 }}>Нет товаров</div>
            <div style={{ fontSize:13, color:C.t3, marginBottom:24 }}>Добавьте первый товар, чтобы начать продавать</div>
            <Btn onClick={()=>navigate('/seller/products/new')} icon="+">Добавить товар</Btn>
          </div>
        ) : (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'50px 1fr 120px 100px 100px 80px 100px', gap:12, padding:'10px 18px', background:'#0A0A12', borderBottom:`1px solid ${C.border}` }}>
              {['','Товар','Цена','Ключей','Продаж','Статус',''].map((h,i)=>(
                <div key={i} style={{ fontSize:10, fontWeight:800, color:C.t3, textTransform:'uppercase', letterSpacing:1 }}>{h}</div>
              ))}
            </div>
            {products.map(p=>(
              <div key={p.id} style={{ display:'grid', gridTemplateColumns:'50px 1fr 120px 100px 100px 80px 100px', gap:12, padding:'14px 18px', alignItems:'center', borderBottom:`1px solid ${C.border}`, transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background=C.cardHov} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:40, height:40, borderRadius:8, overflow:'hidden', background:'#0A0A12', border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                  {p.images?.[0] ? <img src={p.images[0]} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : '📦'}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.t1, marginBottom:2 }}>{p.title}</div>
                  <div style={{ fontSize:11, color:C.t3 }}>{p.category_name}</div>
                </div>
                <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{parseFloat(p.price).toLocaleString('ru')} ₽</div>
                <div style={{ fontSize:13, color:p.keys_count===0?C.red:C.green }}>{p.keys_count} шт</div>
                <div style={{ fontSize:13, color:C.t2 }}>{p.sales_count}</div>
                <div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background:(STATUS_COLOR[p.status]||C.t3)+'22', color:STATUS_COLOR[p.status]||C.t3 }}>
                    {STATUS_LABEL[p.status]||p.status}
                  </span>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>navigate(`/seller/products/${p.id}`)} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.t2, borderRadius:7, padding:'5px 9px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✏️</button>
                  <button onClick={()=>setDeleteId(p.id)} style={{ background:'transparent', border:`1px solid #3A1A1A`, color:C.red, borderRadius:7, padding:'5px 9px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteId && (
        <Modal title="Архивировать товар?" onClose={()=>setDeleteId(null)} width={400}>
          <div style={{ display:'flex', flexDirection:'column', gap:16, textAlign:'center' }}>
            <p style={{ fontSize:13, color:C.t2 }}>Товар будет скрыт из каталога. Активные заказы останутся.</p>
            <div style={{ display:'flex', gap:10 }}>
              <Btn full variant="ghost" onClick={()=>setDeleteId(null)}>Отмена</Btn>
              <Btn full variant="danger" onClick={()=>handleDelete(deleteId)}>Архивировать</Btn>
            </div>
          </div>
        </Modal>
      )}
    </SellerLayout>
  );
}
