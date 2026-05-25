import client from './client';

export const getPublicTheme = () => client.get('/settings/theme');
export const getPublicSeoSettings = () => client.get('/settings/seo');
