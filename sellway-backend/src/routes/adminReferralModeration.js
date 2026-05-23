const router = require('express').Router();
const { transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');

router.use(auth, requireRole('admin'));

async function loadUserForReferral(client, userId) {
  const { rows: [user] } = await client.query(
    `SELECT u.id, u.username, u.email, u.email_verified, u.phone_verified, u.telegram_verified,
            s.referral_application_status, s.referral_enabled
     FROM users u
     JOIN sellers s ON s.user_id=u.id
     WHERE u.id=$1`,
    [userId]
  );
  return user;
}

router.post('/referrals/:userId/approve', async (req, res) => {
  const { note } = req.body || {};
  try {
    const result = await transaction(async (client) => {
      const user = await loadUserForReferral(client, req.params.userId);
      if (!user) throw { status: 404, message: 'Пользователь не найден' };
      if (!user.email_verified || !user.phone_verified || !user.telegram_verified) {
        throw { status: 400, message: 'Нельзя одобрить: email, телефон и Telegram должны быть подтверждены' };
      }
      const { rows: [updated] } = await client.query(
        `UPDATE sellers
         SET referral_enabled=TRUE,
             referral_application_status='approved',
             referral_reviewed_at=NOW(),
             referral_reviewed_by=$1,
             referral_reject_reason=NULL,
             referral_moderation_note=$2
         WHERE user_id=$3
         RETURNING *`,
        [req.user.id, String(note || '').trim(), user.id]
      );
      await client.query(
        `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details)
         VALUES ($1,'referral_approved','seller',$2,$3)`,
        [req.user.id, user.id, JSON.stringify({ note: note || '' })]
      ).catch(() => {});
      return { user, seller: updated };
    });
    await notify.create(result.user.id, 'system', 'Реферальная программа одобрена', 'Администратор одобрил ваше участие в реферальной программе.', '/seller/referrals').catch(() => {});
    logger.info('Referral application approved', { userId: result.user.id, adminId: req.user.id });
    res.json({ message: 'Участие в реферальной программе одобрено', seller: result.seller });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Referral approve error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/referrals/:userId/reject', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Укажите причину отказа' });
  try {
    const result = await transaction(async (client) => {
      const user = await loadUserForReferral(client, req.params.userId);
      if (!user) throw { status: 404, message: 'Пользователь не найден' };
      const { rows: [updated] } = await client.query(
        `UPDATE sellers
         SET referral_enabled=FALSE,
             referral_application_status='rejected',
             referral_reviewed_at=NOW(),
             referral_reviewed_by=$1,
             referral_reject_reason=$2
         WHERE user_id=$3
         RETURNING *`,
        [req.user.id, reason, user.id]
      );
      await client.query(
        `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details)
         VALUES ($1,'referral_rejected','seller',$2,$3)`,
        [req.user.id, user.id, JSON.stringify({ reason })]
      ).catch(() => {});
      return { user, seller: updated };
    });
    await notify.create(result.user.id, 'system', 'Заявка на реферальную программу отклонена', reason, '/seller/referrals').catch(() => {});
    logger.info('Referral application rejected', { userId: result.user.id, adminId: req.user.id });
    res.json({ message: 'Заявка отклонена', seller: result.seller });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Referral reject error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
