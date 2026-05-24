const router = require('express').Router();
const { query, transaction } = require('../config/db');
const { auth } = require('../middleware/auth');
const logger = require('../config/logger');

router.use(auth);

async function getOrCreateThread(userId) {
  return transaction(async client => {
    const { rows: [existing] } = await client.query(
      "SELECT * FROM support_threads WHERE user_id=$1 AND status='open' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
      [userId]
    );
    if (existing) return existing;
    const { rows: [created] } = await client.query(
      'INSERT INTO support_threads (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    return created;
  });
}

router.get('/', async (req, res) => {
  try {
    const { rows: [thread] } = await query(
      "SELECT * FROM support_threads WHERE user_id=$1 AND status='open' ORDER BY updated_at DESC LIMIT 1",
      [req.user.id]
    );
    if (!thread) return res.json({ thread: null, messages: [] });
    const { rows: messages } = await query(
      'SELECT id, sender_type, message, created_at FROM support_messages WHERE thread_id=$1 ORDER BY created_at ASC LIMIT 200',
      [thread.id]
    );
    res.json({ thread, messages });
  } catch (err) {
    logger.error('Support messages get error', { err: err.message, userId: req.user.id });
    res.status(500).json({ error: 'Ошибка загрузки поддержки' });
  }
});

router.post('/message', async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'Введите сообщение' });
  try {
    const thread = await getOrCreateThread(req.user.id);
    const { rows: [saved] } = await query(
      `INSERT INTO support_messages (thread_id, sender_type, sender_id, message)
       VALUES ($1,'user',$2,$3) RETURNING id, sender_type, message, created_at`,
      [thread.id, req.user.id, message]
    );
    await query('UPDATE support_threads SET updated_at=NOW() WHERE id=$1', [thread.id]);
    try {
      const adminBot = require('../telegram/adminBot');
      if (adminBot?.sendSupportMessage) {
        await adminBot.sendSupportMessage(thread.id, req.user, message);
      }
    } catch (err) {
      logger.warn('Support Telegram relay failed', { err: err.message, threadId: thread.id });
    }
    res.status(201).json({ thread, message: saved });
  } catch (err) {
    logger.error('Support message create error', { err: err.message, userId: req.user.id });
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

module.exports = router;
