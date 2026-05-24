const notify = require('./notify');
const logger = require('../config/logger');
const { canUseReferralProgram } = require('./referralEligibility');

async function paySellerReferral(client, order) {
  const { rows: [seller] } = await client.query(
    `SELECT s.referred_by_seller_id, s.referral_commission_rate,
            ref_s.referral_enabled, ref_s.referral_application_status,
            ref_u.username AS referrer_name,
            ref_u.email_verified, ref_u.phone_verified, ref_u.telegram_verified
     FROM sellers s
     LEFT JOIN sellers ref_s ON ref_s.user_id=s.referred_by_seller_id
     LEFT JOIN users ref_u ON ref_u.id=s.referred_by_seller_id
     WHERE s.user_id=$1`,
    [order.seller_id]
  );

  if (!seller?.referred_by_seller_id || seller.referred_by_seller_id === order.seller_id) {
    return { paid: false, amount: 0, skipped: 'no_referrer' };
  }

  if (!seller.referral_enabled || seller.referral_application_status !== 'approved') {
    return { paid: false, amount: 0, skipped: 'referrer_not_approved' };
  }

  if (!canUseReferralProgram(seller)) {
    return { paid: false, amount: 0, skipped: 'referrer_not_verified' };
  }

  const existing = await client.query(
    `SELECT id FROM transactions
     WHERE order_id=$1 AND user_id=$2 AND meta->>'source'='seller_referral'
     LIMIT 1`,
    [order.id, seller.referred_by_seller_id]
  );
  if (existing.rows[0]) return { paid: false, amount: 0, skipped: 'already_paid' };

  const { rows: [settings] } = await client.query(
    `SELECT
       MAX(CASE WHEN key='referral_enabled' THEN value END) AS referral_enabled,
       MAX(CASE WHEN key='max_referral_commission_rate' THEN value END) AS max_rate,
       MAX(CASE WHEN key='referral_payout_basis' THEN value END) AS payout_basis
     FROM settings
     WHERE key IN ('referral_enabled','max_referral_commission_rate','referral_payout_basis')`
  );
  if (settings?.referral_enabled === 'false') return { paid: false, amount: 0, skipped: 'program_disabled' };

  const maxRate = Number(settings?.max_rate || 0.05);
  const referralRate = Math.min(Number(seller.referral_commission_rate || 0), maxRate);
  const commission = Number(order.commission || 0);
  const orderAmount = Number(order.amount || 0);
  const basis = settings?.payout_basis === 'platform_commission' ? commission : orderAmount;
  const referralAmount = Math.min(commission, Number((basis * referralRate).toFixed(2)));

  if (!referralAmount || referralAmount <= 0) return { paid: false, amount: 0, skipped: 'zero_amount' };

  await client.query(`UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2`, [referralAmount, seller.referred_by_seller_id]);
  await client.query(`UPDATE sellers SET referral_earnings=referral_earnings+$1 WHERE user_id=$2`, [referralAmount, seller.referred_by_seller_id]);
  await client.query(
    `INSERT INTO transactions (user_id, order_id, type, amount, description, meta)
     VALUES ($1,$2,'credit',$3,$4,$5)`,
    [seller.referred_by_seller_id, order.id, referralAmount, `Реферальное вознаграждение за заказ ${order.order_number}`, JSON.stringify({ source: 'seller_referral', seller_id: order.seller_id, rate: referralRate, basis: settings?.payout_basis || 'turnover', platform_commission: commission })]
  );

  await notify.create(seller.referred_by_seller_id, 'system', 'Реферальное вознаграждение', `На баланс начислено ${referralAmount.toLocaleString('ru')} ₽ за заказ ${order.order_number}`, '/seller/referrals').catch(() => {});

  logger.info('Referral paid', { orderId: order.id, referrerId: seller.referred_by_seller_id, amount: referralAmount });
  return { paid: true, amount: referralAmount, referrerId: seller.referred_by_seller_id };
}

module.exports = { paySellerReferral };
