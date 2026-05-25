import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { C } from '../../components/UI';
import client from '../../api/client';
import {
  PLATFORM_RULES_TITLE,
  PLATFORM_RULES_VERSION,
  PLATFORM_RULE_SECTIONS,
  REGISTRATION_RULES_SHORT,
  SELLER_PUBLICATION_RULES_SHORT,
  BUYER_CHECKOUT_RULES_SHORT,
  RECOMMENDED_LEGAL_DOCUMENTS,
} from '../../content/platformRules';

function BulletList({ items }) {
  if (!items?.length) return null;
  return <ul style={{ margin:'10px 0 0', paddingLeft:22, display:'grid', gap:6, color:C.t2, fontSize:14, lineHeight:1.55 }}>
    {items.map(item => <li key={item}>{item}</li>)}
  </ul>;
}

function RulesSection({ section }) {
  return <section id={`rule-${section.title.split('.')[0]}`} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'18px clamp(14px, 3vw, 22px)' }}>
    <h2 style={{ color:C.t1, fontSize:18, fontWeight:900, margin:'0 0 12px' }}>{section.title}</h2>
    {section.paragraphs?.map(paragraph => <p key={paragraph} style={{ color:C.t2, fontSize:14, lineHeight:1.65, margin:'0 0 10px' }}>{paragraph}</p>)}
    <BulletList items={section.bullets} />
    {section.groups?.map(group => <div key={group.heading} style={{ marginTop:14 }}>
      <h3 style={{ color:C.t1, fontSize:14, fontWeight:800, margin:'0 0 6px' }}>{group.heading}</h3>
      <BulletList items={group.bullets} />
    </div>)}
    {section.after?.map(paragraph => <p key={paragraph} style={{ color:C.t2, fontSize:14, lineHeight:1.65, margin:'12px 0 0' }}>{paragraph}</p>)}
  </section>;
}

export default function TermsPage() {
  const [custom, setCustom] = useState(null);
  useEffect(() => {
    document.title = `${PLATFORM_RULES_TITLE} - SellWay`;
    client.get('/settings/terms').then(r => setCustom(r.data)).catch(() => {});
  }, []);
  const customContent = String(custom?.content || '').trim();
  const title = customContent && custom?.title ? custom.title : PLATFORM_RULES_TITLE;
  const version = customContent && custom?.version ? custom.version : PLATFORM_RULES_VERSION;

  return <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px clamp(12px, 4vw, 22px)' }} className="fade-in">
    <Link to="/" style={{ color:C.accent, textDecoration:'none', fontSize:13 }}>← На главную</Link>
    <header style={{ margin:'22px 0 22px' }}>
      <h1 style={{ color:C.t1, fontSize:'clamp(24px, 4vw, 30px)', fontWeight:900, margin:'0 0 9px' }}>{title}</h1>
      <div style={{ color:C.t3, fontSize:12, marginBottom:12 }}>{version}</div>
      <p style={{ color:C.t2, fontSize:14, lineHeight:1.65, maxWidth:820, margin:0 }}>Используя SellWay.pro, пользователь подтверждает, что ознакомился с правилами площадки и обязуется их соблюдать.</p>
    </header>

    {customContent ? <section style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'18px 22px', whiteSpace:'pre-wrap', color:C.t2, fontSize:14, lineHeight:1.7 }}>{customContent}</section> : <>
      <nav style={{ background:C.infoBg, border:`1px solid ${C.border}`, borderRadius:8, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.t1, marginBottom:10 }}>Содержание</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 14px' }}>
          {PLATFORM_RULE_SECTIONS.map(section => <a key={section.title} href={`#rule-${section.title.split('.')[0]}`} style={{ color:C.accent, fontSize:12, textDecoration:'none' }}>{section.title}</a>)}
        </div>
      </nav>
      <div style={{ display:'grid', gap:12 }}>
        {PLATFORM_RULE_SECTIONS.map(section => <RulesSection key={section.title} section={section} />)}
      </div>
      <section style={{ background:C.infoBg, border:`1px solid ${C.border}`, borderRadius:8, padding:'18px 22px', marginTop:14 }}>
        <h2 style={{ color:C.t1, fontSize:18, fontWeight:900, margin:'0 0 16px' }}>Короткие подтверждения</h2>
        {[['При регистрации', REGISTRATION_RULES_SHORT], ['Для продавца перед публикацией товара', SELLER_PUBLICATION_RULES_SHORT], ['Для покупателя перед оплатой', BUYER_CHECKOUT_RULES_SHORT]].map(([heading, text]) => <div key={heading} style={{ marginBottom:14 }}>
          <h3 style={{ color:C.t1, fontSize:14, margin:'0 0 5px' }}>{heading}</h3>
          <p style={{ color:C.t2, fontSize:13, lineHeight:1.65, margin:0 }}>{text}</p>
        </div>)}
      </section>
      <section style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'18px 22px', marginTop:14 }}>
        <h2 style={{ color:C.t1, fontSize:18, fontWeight:900, margin:'0 0 10px' }}>Отдельные документы сайта</h2>
        <p style={{ color:C.t2, fontSize:14, lineHeight:1.6, margin:'0 0 10px' }}>Для полного набора юридических страниц предусмотрены следующие документы:</p>
        <BulletList items={RECOMMENDED_LEGAL_DOCUMENTS} />
        <p style={{ color:C.t2, fontSize:13, lineHeight:1.6, margin:'14px 0 0' }}>Минимально для старта: Правила площадки, Пользовательское соглашение, Политика конфиденциальности, Правила возвратов и Запрещенные товары.</p>
      </section>
    </>}
  </div>;
}
