import client from './client';
export const createPayment   = (data) => client.post('/payments/create', data);
export const getPaymentStatus = (id) => client.get(`/payments/${id}/status`);
export const syncPaymentReturn = (ref) => client.get(`/payments/return/${encodeURIComponent(ref)}`);
