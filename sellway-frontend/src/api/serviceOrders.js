import client from './client';

export const createServiceOrder = (product_id, message = '') => client.post('/service-orders', { product_id, message });
export const sendServiceProposal = (id, data) => client.post(`/service-orders/${id}/proposal`, data);
export const acceptServiceProposal = (id) => client.post(`/service-orders/${id}/accept-proposal`);
export const deliverServiceOrder = (id, result = '') => client.post(`/service-orders/${id}/deliver`, { result });
