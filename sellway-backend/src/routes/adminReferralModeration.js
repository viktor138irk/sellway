const router = require('express').Router();
const { transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');
const { canUseReferralProgram, referralRequirements } = require('../services/referralEligibility');
const { sendReferralApprovedEmail } = require('../services/mailer');

router.use(auth, requireRole('admin'));

async function loadUserForReferral(client, userId) {
  const { rows: [user] } = await client.query(
    `SELECT u.id, u.username, u.email, u.email_verified, u.phone_verified, u.telegram_verified,
            s.referral_application_status, s.referral_enabled
     FROM users u
     JOIN sellers s ON s.user_id=u.id
     WHERE u.id=$1
     FOR UPDATE OF s`,
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
      if (user.referral_application_status === 'approved' && user.referral_enabled) {
        return { user, alreadyApproved: true };
      }
      if (user.referral_application_status !== 'pending') {
        throw { status: 409, message: 'Эта заявка уже обработана. Обновите страницу.' };
      }
      if (!canUseReferralProgram(user)) {
        const req = referralRequirements(user);
        throw { status: 400, message: req.full ? 'Нельзя одобрить: email, телефон и Telegram должны быть подтверждены' : 'Нельзя одобрить: email должен быть подтверждён' };
      }
      const { rows: [updated] } = await client.query(
        `UPDATE sellers
         SET referral_enabled=TRUE,
             referral_application_status='approved',
             referral_reviewed_at=NOW(),
             referral_reviewed_by=$1,
             referral_reject_reason=NULL,
             referral_moderation_note=$2,
             updated_at=NOW()
         WHERE user_id=$3 AND referral_application_status='pending'
         RETURNING *`,
        [req.user.id, String(note || '').trim(), user.id]
      );
      if (!updated) throw { status: 409, message: 'Заявка уже обработана. Обновите страницу.' };
      await client.query(
        `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details)
         VALUES ($1,'referral_approved','seller',$2,$3)`,
        [req.user.id, user.id, JSON.stringify({ note: note || '' })]
      ).catch(() => {});
      return { user, seller: updated };
    });
    if (!result.alreadyApproved) {
      await notify.create(result.user.id, 'system', 'Реферальная программа одобрена', 'Администратор одобрил ваше участие в реферальной программе.', '/seller/referrals').catch(() => {});
      await sendReferralApprovedEmail(result.user.email, result.user.username).catch(err => {
        logger.error('Referral approval email error', { err: err.message, userId: result.user.id });
      });
      logger.info('Referral application approved', { userId: result.user.id, adminId: req.user.id });
    }
    res.set('Cache-Control', 'no-store').json({ message: 'Участие в реферальной программе одобрено', seller: result.seller, alreadyApproved: Boolean(result.alreadyApproved) });
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
      if (user.referral_application_status !== 'pending') {
        throw { status: 409, message: 'Эта заявка уже обработана. Обновите страницу.' };
      }
      const { rows: [updated] } = await client.query(
        `UPDATE sellers
         SET referral_enabled=FALSE,
             referral_application_status='rejected',
             referral_reviewed_at=NOW(),
             referral_reviewed_by=$1,
             referral_reject_reason=$2,
             updated_at=NOW()
         WHERE user_id=$3 AND referral_application_status='pending'
         RETURNING *`,
        [req.user.id, reason, user.id]
      );
      if (!updated) throw { status: 409, message: 'Заявка уже обработана. Обновите страницу.' };
      await client.query(
        `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details)
         VALUES ($1,'referral_rejected','seller',$2,$3)`,
        [req.user.id, user.id, JSON.stringify({ reason })]
      ).catch(() => {});
      return { user, seller: updated };
    });
    await notify.create(result.user.id, 'system', 'Заявка на реферальную программу отклонена', reason, '/seller/referrals').catch(() => {});
    logger.info('Referral application rejected', { userId: result.user.id, adminId: req.user.id });
    res.set('Cache-Control', 'no-store').json({ message: 'Заявка отклонена', seller: result.seller });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Referral reject error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
