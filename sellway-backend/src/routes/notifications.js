const router = require('express').Router();
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/read-all', auth, async (req, res) => {
  await query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [req.user.id]);
  res.json({ message: 'Все прочитаны' });
});

router.post('/:id/read', auth, async (req, res) => {
  await query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ message: 'OK' });
});

module.exports = router;
