import client from './client';
export const createOrder  = (product_id) => client.post('/orders', { product_id });
export const getOrders    = (params) => client.get('/orders', { params });
export const getOrder     = (id) => client.get(`/orders/${id}`);
export const sendMessage  = (id, message) => client.post(`/orders/${id}/message`, { message });
export const confirmOrder = (id) => client.post(`/orders/${id}/confirm`);
export const openDispute  = (id, reason) => client.post(`/orders/${id}/dispute`, { reason });
export const cancelOrder  = (id, reason) => client.post(`/orders/${id}/cancel`, { reason });
