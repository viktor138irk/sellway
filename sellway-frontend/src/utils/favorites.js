const STORAGE_KEY = 'sellway_favorite_products';
const EVENT_NAME = 'sellway:favorites';

export function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isFavorite(productId) {
  return readFavorites().includes(String(productId));
}

export function toggleFavorite(productId) {
  const id = String(productId);
  const items = new Set(readFavorites());
  if (items.has(id)) items.delete(id);
  else items.add(id);
  const next = [...items];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  return next.includes(id);
}

export function subscribeFavorites(callback) {
  const update = () => callback(readFavorites());
  window.addEventListener(EVENT_NAME, update);
  window.addEventListener('storage', update);
  return () => {
    window.removeEventListener(EVENT_NAME, update);
    window.removeEventListener('storage', update);
  };
}
