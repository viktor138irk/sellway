import client from './client';
export const getDashboard   = () => client.get('/seller/dashboard');
export const requestWithdraw = (data) => client.post('/seller/withdrawal', data);
export const getWithdrawConfig = () => client.get('/seller/withdrawal/config');
export const getTelegramLink = () => client.post('/seller/telegram-link');
export const getNotifications = () => client.get('/notifications');
export const readAllNotifs    = () => client.post('/notifications/read-all');
export const readNotif        = (id) => client.post(`/notifications/${id}/read`);
