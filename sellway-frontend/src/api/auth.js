import client from './client';
export const register   = (data) => client.post('/auth/register', data);
export const login      = (data) => client.post('/auth/login', data);
export const logout     = (refreshToken) => client.post('/auth/logout', { refreshToken });
export const refresh    = (refreshToken) => client.post('/auth/refresh', { refreshToken });
export const getMe      = () => client.get('/auth/me');
export const verifyEmail = (token) => client.get(`/auth/verify-email/${token}`);
export const forgotPwd  = (email) => client.post('/auth/forgot-password', { email });
export const resetPwd   = (data) => client.post('/auth/reset-password', data);
