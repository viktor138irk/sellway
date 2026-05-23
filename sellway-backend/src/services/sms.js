const axios = require('axios');

const SMSPILOT_URL = 'https://smspilot.ru/api.php';

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

async function sendVerificationCode(phone, code) {
  const to = normalizePhone(phone);
  const apikey = process.env.SMSPILOT_API_KEY;
  const enabled = process.env.SMSPILOT_ENABLED === 'true';

  if (!enabled) {
    throw new Error('SMSPilot отключен в настройках');
  }
  if (!apikey || apikey.startsWith('your_')) {
    throw new Error('SMSPILOT_API_KEY is not configured');
  }
  if (!/^7\d{10,14}$/.test(to)) {
    throw new Error('Invalid phone number');
  }

  const template = process.env.SMS_CODE_TEMPLATE || 'Ваш код подтверждения {{code}}';
  const text = template.includes('{{code}}')
    ? template.replace('{{code}}', code)
    : `Ваш код подтверждения ${code}`;

  const { data } = await axios.get(SMSPILOT_URL, {
    params: {
      send: text,
      to,
      from: process.env.SMSPILOT_SENDER || '',
      apikey,
      format: 'json',
    },
    timeout: 10000,
  });

  if (data?.error) {
    throw new Error(data.error.description_ru || data.error.description || 'SMSPilot error');
  }

  return data;
}

module.exports = { sendVerificationCode, normalizePhone };
