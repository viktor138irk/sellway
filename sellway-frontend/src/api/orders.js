import client from './client';
export const createOrder  = (product_id, quantity = 1) => client.post('/orders', { product_id, quantity });
export const getOrders    = (params) => client.get('/orders', { params });
export const getOrder     = (id) => client.get(`/orders/${id}`);
export const sendMessage  = (id, message) => client.post(`/orders/${id}/message`, { message });
export const confirmOrder = (id, data = {}) => client.post(`/orders/${id}/confirm`, data);
export const rateBuyer    = (id, data = {}) => client.post(`/orders/${id}/rate-buyer`, data);
export const openDispute  = (id, reason) => client.post(`/orders/${id}/dispute`, { reason });
export const cancelOrder  = (id, reason) => client.post(`/orders/${id}/cancel`, { reason });
