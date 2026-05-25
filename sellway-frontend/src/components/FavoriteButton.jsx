import { useEffect, useState } from 'react';
import { C } from './UI';
import { isFavorite, subscribeFavorites, toggleFavorite } from '../utils/favorites';

export default function FavoriteButton({ productId, floating = false, size = 36 }) {
  const [active, setActive] = useState(() => isFavorite(productId));

  useEffect(() => subscribeFavorites(() => setActive(isFavorite(productId))), [productId]);

  function handleToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    setActive(toggleFavorite(productId));
  }

  return <button type="button" aria-label={active ? 'Убрать из избранного' : 'Добавить в избранное'} onClick={handleToggle}
    style={{ position:floating ? 'absolute' : 'relative', top:floating ? 8 : undefined, right:floating ? 8 : undefined, zIndex:2, width:size, height:size, flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:floating ? 'rgba(44,36,31,.72)' : C.card, border:floating ? 'none' : `1px solid ${C.border}`, color:active ? C.red : (floating ? '#fff8ef' : C.t2), cursor:'pointer', transition:'color .15s, background .15s' }}>
    <svg width={size * .52} height={size * .52} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  </button>;
}
