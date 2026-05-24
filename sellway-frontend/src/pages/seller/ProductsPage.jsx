import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SellerLayout from '../../components/Layout/SellerLayout';
import { C, Spinner, Btn, Input, Select, Textarea, Modal } from '../../components/UI';
import { getProducts, getProduct, createProduct, updateProduct, deleteProduct, uploadImages, uploadProductFile, addKeys, getKeys, getCategories } from '../../api/products';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

function roleMode(role) {
  return role === 'freelancer' ? 'service' : 'product';
}

function isService(mode) {
  return mode === 'service';
}

function ImageUpload({ images, onChange, max = 8 }) {
  const ref = useRef();
  async function handleFiles(files) {
    const loaded = Array.from(files).slice(0, max - images.length).map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    onChange([...images, ...loaded]);
  }
  function remove(i) { onChange(images.filter((_, idx) => idx !== i)); }
  function setMain(i) { const n = [...images]; const [it] = n.splice(i, 1); onChange([it, ...n]); }
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>Фотографии <span style={{ color: C.t3, fontWeight: 400 }}>({images.length}/{max}, первое — главное)</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 10 }}>
        {images.map((img, i) => (
          <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: `2px solid ${i === 0 ? C.accent : C.border}`, background: '#0A0A12' }}>
            <img src={img.preview || img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {i === 0 && <div style={{ position: 'absolute', top: 5, left: 5, background: C.accent, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>ГЛАВНОЕ</div>}
            <div style={{ position: 'absolute', right: 5, bottom: 5, display: 'flex', gap: 4 }}>
              {i !== 0 && <button type="button" onClick={() => setMain(i)} style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 5, padding: '3px 7px', fontSize: 10, cursor: 'pointer' }}>★</button>}
              <button type="button" onClick={() => remove(i)} style={{ background: '#3A1010', border: 'none', color: C.red, borderRadius: 5, padding: '3px 7px', fontSize: 10, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        ))}
        {images.length < max && (
          <button type="button" onClick={() => ref.current.click()} style={{ aspectRatio: '1', borderRadius: 10, border: `2px dashed ${C.border}`, background: '#0A0A12', color: C.t3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 6, fontFamily: 'inherit' }}>
            <div style={{ fontSize: 24, opacity: .5 }}>+</div>
            <div style={{ fontSize: 10 }}>Добавить</div>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files || [])} />
    </div>
  );
}

function ServiceStepsEditor({ steps, onChange }) {
  function patch(i, key, value) {
    const next = [...steps];
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }
  function add() { onChange([...steps, { title: '', description: '', price: '' }]); }
  function remove(i) { onChange(steps.filter((_, idx) => idx !== i)); }

  return (
    <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>🧩 Типовые этапы услуги</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>Это шаблон. Финальная смета утверждается в сделке с заказчиком.</div>
        </div>
        <Btn size="sm" variant="ghost" onClick={add}>+ Этап</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 36px', gap: 8, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input value={step.title} onChange={e => patch(i, 'title', e.target.value)} placeholder="Название этапа" />
              <Textarea value={step.description} onChange={e => patch(i, 'description', e.target.value)} rows={2} placeholder="Что входит в этап" />
            </div>
            <Input type="number" value={step.price} onChange={e => patch(i, 'price', e.target.value)} placeholder="₽" />
            <button type="button" onClick={() => remove(i)} style={{ background: '#3A1010', border: `1px solid #4A2020`, color: C.red, borderRadius: 8, height: 38, cursor: 'pointer' }}>×</button>
          </div>
        ))}
        {steps.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>Этапы можно не добавлять сейчас — фрилансер сможет согласовать их в сделке.</div>}
      </div>
    </div>
  );
}

function CategoryIcon({ cat, size = 30 }) {
  return <span style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: '#0A0A14', border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {cat?.image_url ? <img src={cat.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: Math.max(14, size * .5) }}>{cat?.emoji || '📂'}</span>}
  </span>;
}

function ProductForm({ productId, onSave, onCancel, user }) {
  const toast = useToast();
  const mode = roleMode(user?.role);
  const service = isService(mode);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState([]);
  const [productFile, setProductFile] = useState(null);
  const [existingFile, setExistingFile] = useState(null);
  const [keysText, setKeysText] = useState('');
  const [existingKeys, setExistingKeys] = useState([]);
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [serviceSteps, setServiceSteps] = useState([]);
  const [form, setForm] = useState({ title: '', short_desc: '', description: '', price: '', old_price: '', category_id: '', delivery_type: service ? 'service' : 'auto', guarantee_days: 0, tags: '' });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const setFromInput = k => e => set(k)(e.target.value);
  const rootCats = cats.filter(c => !c.parent_id);
  const subCats = cats.filter(c => c.parent_id === parentCategoryId);
  const selectedCategory = cats.find(c => c.id === form.category_id) || cats.find(c => c.id === parentCategoryId);

  useEffect(() => {
    getCategories({ type: service ? 'service' : 'product' }).then(r => setCats(r.data)).catch(() => {});
    if (productId) {
      setLoading(true);
      const promises = [getProduct(productId)];
      if (!service) promises.push(getKeys(productId));
      Promise.all(promises)
        .then(([pr, kr]) => {
          const p = pr.data;
          setForm({ title: p.title || '', short_desc: p.short_desc || '', description: p.description || '', price: p.price || '', old_price: p.old_price || '', category_id: p.category_id || '', delivery_type: p.delivery_type || (service ? 'service' : 'auto'), guarantee_days: p.guarantee_days || 0, tags: (p.tags || []).join(', ') });
          setParentCategoryId(p.parent_category_id || p.category_id || '');
          setImages((p.images || []).map(url => ({ preview: url })));
          setExistingFile((p.files || [])[0] || null);
          setServiceSteps(p.meta?.service_steps || []);
          if (kr) setExistingKeys(kr.data || []);
        }).catch(() => toast.error(service ? 'Ошибка загрузки услуги' : 'Ошибка загрузки товара'))
        .finally(() => setLoading(false));
    }
  }, [productId, service]);

  async function handleSave() {
    if (!form.title || !form.price || !form.category_id) return toast.warn('Заполните обязательные поля');
    if (!service && form.delivery_type === 'auto' && !keysText.trim() && existingKeys.filter(k => !k.is_sold).length === 0) return toast.warn('Добавьте ключи для автовыдачи');
    if (!service && form.delivery_type === 'file' && !productFile && !existingFile) return toast.warn('Прикрепите файл для выдачи');
    setSaving(true);
    try {
      const delivery_type = service ? 'service' : form.delivery_type;
      const body = { ...form, delivery_type, price: parseFloat(form.price), old_price: form.old_price ? parseFloat(form.old_price) : null, tags: form.tags.split(',').map(s => s.trim()).filter(Boolean), service_steps: serviceSteps };
      const r = productId ? await updateProduct(productId, body) : await createProduct(body);
      const saved = r.data;

      const newImgs = images.filter(img => img.file);
      if (newImgs.length > 0) {
        const fd = new FormData();
        newImgs.forEach(img => fd.append('images', img.file));
        await uploadImages(saved.id, fd).catch(() => toast.warn('Некоторые фото не загрузились'));
      }
      if (!service && form.delivery_type === 'file' && productFile) {
        const fd = new FormData(); fd.append('file', productFile);
        await uploadProductFile(saved.id, fd).catch(() => toast.warn('Файл не загрузился'));
      }
      const keys = !service && form.delivery_type === 'auto' ? keysText.split('\n').map(s => s.trim()).filter(Boolean) : [];
      if (keys.length > 0) await addKeys(saved.id, keys).catch(() => toast.warn('Некоторые ключи не добавились'));

      toast.success(productId ? (service ? 'Услуга обновлена и отправлена на проверку' : 'Товар обновлён и отправлен на проверку') : (service ? 'Услуга создана и отправлена на модерацию' : 'Товар создан и отправлен на модерацию'));
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Ошибка сохранения');
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ImageUpload images={images} onChange={setImages} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div style={{ gridColumn: '1/-1' }}><Input label={service ? 'Название услуги *' : 'Название товара *'} value={form.title} onChange={setFromInput('title')} placeholder={service ? 'Разработка лендинга под ключ' : 'CS2 Аккаунт | Prime Status'} /></div>
        <Select label="Категория *" value={parentCategoryId} onChange={e => { const id = e.target.value; setParentCategoryId(id); set('category_id')(cats.some(c => c.parent_id === id) ? '' : id); }}>
          <option value="">Выберите категорию</option>
          {rootCats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </Select>
        <Select label="Подкатегория" value={form.category_id} onChange={e => set('category_id')(e.target.value)} disabled={!parentCategoryId || subCats.length === 0}>
          <option value={subCats.length ? '' : parentCategoryId}>{subCats.length ? 'Выберите подкатегорию' : 'Без подкатегории'}</option>
          {subCats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </Select>
        {selectedCategory && <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 11px', alignSelf: 'end' }}>
          <CategoryIcon cat={selectedCategory} />
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: C.t3 }}>Выбрана категория</div><div style={{ fontSize: 13, color: C.t1, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCategory.name}</div></div>
        </div>}
        {!service && <Select label="Тип выдачи" value={form.delivery_type} onChange={e => set('delivery_type')(e.target.value)}>
          <option value="auto">🔑 Автовыдача ключей</option>
          <option value="file">📎 Автовыдача файла</option>
          <option value="manual">⏱ Ручная выдача</option>
        </Select>}
        {service && <Input label="Тип сделки" value="Услуга / поэтапная сделка" disabled />}
        <Input label={service ? 'Стоимость от (₽) *' : 'Цена (₽) *'} type="number" value={form.price} onChange={setFromInput('price')} placeholder={service ? '5000' : '1200'} />
        <Input label="Старая цена (₽)" type="number" value={form.old_price} onChange={setFromInput('old_price')} placeholder="необязательно" />
        <Input label="Краткое описание" value={form.short_desc} onChange={setFromInput('short_desc')} placeholder="В 1-2 предложения" />
        {!service && <Input label="Гарантия (дней)" type="number" value={form.guarantee_days} onChange={setFromInput('guarantee_days')} placeholder="30" />}
        <div style={{ gridColumn: '1/-1' }}><Input label="Теги (через запятую)" value={form.tags} onChange={setFromInput('tags')} placeholder={service ? 'лендинг, дизайн, верстка' : 'Prime Status, С почтой'} /></div>
        <div style={{ gridColumn: '1/-1' }}><Textarea label="Подробное описание" value={form.description} onChange={e => set('description')(e.target.value)} rows={5} placeholder={service ? 'Опишите услугу, условия, сроки, что входит в базовую стоимость...' : 'Опишите товар подробно...'} style={{ width: '100%' }} /></div>
      </div>

      {service && <ServiceStepsEditor steps={serviceSteps} onChange={setServiceSteps} />}

      {!service && form.delivery_type === 'auto' && <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 12 }}>🔑 Ключи / коды</div>
        <Textarea label="Добавить новые ключи (по одному на строку)" value={keysText} onChange={e => setKeysText(e.target.value)} rows={5} placeholder={'XXXXX-XXXXX-XXXXX\nYYYYY-YYYYY-YYYYY'} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} />
      </div>}

      {!service && form.delivery_type === 'file' && <div style={{ background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 10 }}>📎 Файл для выдачи</div>
        {existingFile && !productFile && <div style={{ fontSize: 12, color: C.t2, marginBottom: 10 }}>Текущий файл: {existingFile.filename}</div>}
        <input type="file" onChange={e => setProductFile(e.target.files?.[0] || null)} style={{ width: '100%', background: '#0A0A12', border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px', color: C.t1, fontSize: 13, fontFamily: 'inherit' }} />
      </div>}

      <div style={{ background: service ? '#10101F' : '#0A1A0A', border: `1px solid ${service ? C.accent + '44' : C.green + '33'}`, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: service ? C.t2 : C.green, lineHeight: 1.5 }}>
        {service ? '💼 Для услуги указанная цена показывается как “от”. Финальная стоимость и этапы утверждаются с заказчиком внутри сделки, после чего средства резервируются.' : <>💡 После сохранения товар уйдёт на модерацию. Ваш доход: <strong>{form.price ? Math.floor(+form.price * 0.93).toLocaleString('ru') : '—'} ₽</strong></>}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Btn variant="ghost" onClick={onCancel}>Отмена</Btn>
        <Btn loading={saving} onClick={handleSave}>{productId ? 'Сохранить изменения' : (service ? 'Опубликовать услугу' : 'Опубликовать товар')}</Btn>
      </div>
    </div>
  );
}

export default function ProductsPage({ mode }) {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const modeName = roleMode(user?.role);
  const service = isService(modeName);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const isForm = mode === 'create' || mode === 'edit';

  useEffect(() => { if (!isForm && user?.id) loadProducts(); }, [isForm, user?.id]);

  async function loadProducts() {
    setLoading(true);
    try {
      const r = await getProducts({ seller: user?.id, limit: 50 });
      const list = r.data.products || [];
      setProducts(list.filter(p => service ? p.delivery_type === 'service' : p.delivery_type !== 'service'));
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }

  async function handleDelete(id) {
    try { await deleteProduct(id); toast.success(service ? 'Услуга архивирована' : 'Товар архивирован'); setDeleteId(null); loadProducts(); }
    catch { toast.error('Ошибка удаления'); }
  }

  const STATUS_COLOR = { active: C.green, pending: C.amber, rejected: C.red, archived: C.t3, draft: C.t2 };
  const STATUS_LABEL = { active: 'Активен', pending: 'На проверке', rejected: 'Отклонён', archived: 'Архив', draft: 'Черновик' };

  if (isForm) return (
    <SellerLayout>
      <div style={{ padding: 'clamp(16px, 4vw, 28px)', maxWidth: 900 }} className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <button onClick={() => navigate('/seller/products')} style={{ background: 'transparent', border: 'none', color: C.t2, fontSize: 20, cursor: 'pointer' }}>←</button>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>{mode === 'edit' ? (service ? 'Редактировать услугу' : 'Редактировать товар') : (service ? 'Новая услуга' : 'Новый товар')}</h1>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(16px, 4vw, 24px)' }}>
          <ProductForm productId={editId} user={user} onSave={() => navigate('/seller/products')} onCancel={() => navigate('/seller/products')} />
        </div>
      </div>
    </SellerLayout>
  );

  return (
    <SellerLayout>
      <div style={{ padding: 'clamp(16px, 4vw, 28px)' }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.t1 }}>{service ? 'Мои услуги' : 'Мои товары'}</h1>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{service ? 'Фриланс-услуги со сметой и поэтапной сделкой' : 'Готовые цифровые товары, ключи и файлы'}</div>
          </div>
          <Btn onClick={() => navigate('/seller/products/new')} icon="+">{service ? 'Добавить услугу' : 'Добавить товар'}</Btn>
        </div>

        {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={36} /></div>
        : products.length === 0 ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 50, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{service ? '🧑‍💻' : '📦'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.t2, marginBottom: 8 }}>{service ? 'Нет услуг' : 'Нет товаров'}</div>
            <div style={{ fontSize: 13, color: C.t3, marginBottom: 24 }}>{service ? 'Добавьте первую услугу, чтобы получать заказы' : 'Добавьте первый товар, чтобы начать продавать'}</div>
            <Btn onClick={() => navigate('/seller/products/new')} icon="+">{service ? 'Добавить услугу' : 'Добавить товар'}</Btn>
          </div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {products.map(p => (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ height: 150, background: '#0A0A12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.images?.[0] ? <img src={p.images[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 42 }}>{service ? '🧑‍💻' : '📦'}</span>}
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start', marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, lineHeight: 1.35 }}>{p.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t3, marginTop: 5 }}>
                        <CategoryIcon cat={{ image_url: p.category_image_url, emoji: p.category_emoji }} size={20} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.category_name || 'Без категории'}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap', background: (STATUS_COLOR[p.status] || C.t3) + '22', color: STATUS_COLOR[p.status] || C.t3 }}>{STATUS_LABEL[p.status] || p.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.t1 }}>{service ? 'от ' : ''}{parseFloat(p.price).toLocaleString('ru')} ₽</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>{service ? 'поэтапная сделка' : `${p.sales_count || 0} продаж`}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn size="sm" full variant="ghost" onClick={() => navigate(`/seller/products/${p.id}`)}>Редактировать</Btn>
                    <Btn size="sm" variant="danger" onClick={() => setDeleteId(p.id)}>×</Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>}
      </div>

      {deleteId && <Modal title={service ? 'Архивировать услугу?' : 'Архивировать товар?'} onClose={() => setDeleteId(null)} width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.t2 }}>{service ? 'Услуга будет скрыта из каталога. Активные сделки останутся.' : 'Товар будет скрыт из каталога. Активные заказы останутся.'}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn full variant="ghost" onClick={() => setDeleteId(null)}>Отмена</Btn>
            <Btn full variant="danger" onClick={() => handleDelete(deleteId)}>Архивировать</Btn>
          </div>
        </div>
      </Modal>}
    </SellerLayout>
  );
}
