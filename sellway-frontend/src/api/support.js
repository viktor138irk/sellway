import client from './client';

export const getSupportChat = () => client.get('/support');
export const sendSupportMessage = message => client.post('/support/message', { message });
export const getAdminSupportThreads = status => client.get('/support/admin/threads', { params: { status } });
export const getAdminSupportThread = id => client.get(`/support/admin/threads/${id}`);
export const replyAdminSupportThread = (id, message) => client.post(`/support/admin/threads/${id}/reply`, { message });
export const closeAdminSupportThread = id => client.post(`/support/admin/threads/${id}/close`);
