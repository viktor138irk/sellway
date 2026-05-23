import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: добавляем токен ──────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: авто-refresh при 401 ───────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
};

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        client.defaults.headers.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return client(original);
      } catch (e) {
        processQueue(e, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default client;
