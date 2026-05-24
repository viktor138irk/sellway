import client from './client';

export const getSupportChat = () => client.get('/support');
export const sendSupportMessage = message => client.post('/support/message', { message });
