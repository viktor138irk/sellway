const router = require('express').Router();
const { query, transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
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
      `SELECT * FROM support_threads
       WHERE user_id=$1
       ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
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

router.get('/admin/threads', requireRole('admin', 'moderator'), async (req, res) => {
  const status = req.query.status === 'all' ? null : 'open';
  try {
    const { rows } = await query(
      `SELECT st.id, st.status, st.created_at, st.updated_at, st.user_id,
              u.username, u.email,
              (SELECT sm.message FROM support_messages sm WHERE sm.thread_id=st.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
              (SELECT sm.sender_type FROM support_messages sm WHERE sm.thread_id=st.id ORDER BY sm.created_at DESC LIMIT 1) AS last_sender_type,
              (SELECT COUNT(*)::int FROM support_messages sm WHERE sm.thread_id=st.id) AS messages_count
       FROM support_threads st
       JOIN users u ON u.id=st.user_id
       WHERE ($1::varchar IS NULL OR st.status=$1)
       ORDER BY CASE WHEN st.status='open' THEN 0 ELSE 1 END, st.updated_at DESC
       LIMIT 100`,
      [status]
    );
    res.json({ threads: rows });
  } catch (err) {
    logger.error('Admin support threads error', { err: err.message, adminId: req.user.id });
    res.status(500).json({ error: 'Ошибка загрузки обращений' });
  }
});

router.get('/admin/threads/:id', requireRole('admin', 'moderator'), async (req, res) => {
  try {
    const { rows: [thread] } = await query(
      `SELECT st.*, u.username, u.email
       FROM support_threads st
       JOIN users u ON u.id=st.user_id
       WHERE st.id=$1`,
      [req.params.id]
    );
    if (!thread) return res.status(404).json({ error: 'Обращение не найдено' });
    const { rows: messages } = await query(
      `SELECT sm.id, sm.sender_type, sm.message, sm.created_at, sender.username AS sender_name
       FROM support_messages sm
       LEFT JOIN users sender ON sender.id=sm.sender_id
       WHERE sm.thread_id=$1
       ORDER BY sm.created_at ASC`,
      [thread.id]
    );
    res.json({ thread, messages });
  } catch (err) {
    logger.error('Admin support thread error', { err: err.message, threadId: req.params.id });
    res.status(500).json({ error: 'Ошибка загрузки диалога' });
  }
});

router.post('/admin/threads/:id/reply', requireRole('admin', 'moderator'), async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'Введите сообщение' });
  try {
    const result = await transaction(async client => {
      const { rows: [thread] } = await client.query(
        "SELECT * FROM support_threads WHERE id=$1 AND status='open' FOR UPDATE",
        [req.params.id]
      );
      if (!thread) throw { status: 400, message: 'Обращение закрыто или не найдено' };
      const { rows: [saved] } = await client.query(
        `INSERT INTO support_messages (thread_id, sender_type, sender_id, message)
         VALUES ($1,'admin',$2,$3)
         RETURNING id, sender_type, message, created_at`,
        [thread.id, req.user.id, message]
      );
      await client.query('UPDATE support_threads SET updated_at=NOW() WHERE id=$1', [thread.id]);
      return { thread, message: saved };
    });
    await notify.create(result.thread.user_id, 'system', 'Ответ поддержки', message, null).catch(() => {});
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Admin support reply error', { err: err.message, threadId: req.params.id });
    res.status(500).json({ error: 'Ошибка отправки ответа' });
  }
});

router.post('/admin/threads/:id/close', requireRole('admin', 'moderator'), async (req, res) => {
  try {
    const { rows: [thread] } = await query(
      `UPDATE support_threads
       SET status='closed', updated_at=NOW()
       WHERE id=$1 AND status='open'
       RETURNING *`,
      [req.params.id]
    );
    if (!thread) return res.status(404).json({ error: 'Открытое обращение не найдено' });
    await notify.create(thread.user_id, 'system', 'Обращение закрыто', 'Поддержка завершила обращение. Если вопрос остался, напишите новое сообщение.', null).catch(() => {});
    res.json({ thread });
  } catch (err) {
    logger.error('Admin support close error', { err: err.message, threadId: req.params.id });
    res.status(500).json({ error: 'Ошибка закрытия обращения' });
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
