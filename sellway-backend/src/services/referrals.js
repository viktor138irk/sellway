const notify = require('./notify');
const logger = require('../config/logger');

async function paySellerReferral(client, order) {
  const { rows: [seller] } = await client.query(
    `SELECT s.referred_by_seller_id, s.referral_commission_rate, ref_u.username AS referrer_name
     FROM sellers s
     LEFT JOIN users ref_u ON ref_u.id=s.referred_by_seller_id
     WHERE s.user_id=$1`,
    [order.seller_id]
  );

  if (!seller?.referred_by_seller_id || seller.referred_by_seller_id === order.seller_id) {
    return { paid: false, amount: 0 };
  }

  const existing = await client.query(
    `SELECT id FROM transactions
     WHERE order_id=$1 AND user_id=$2 AND meta->>'source'='seller_referral'
     LIMIT 1`,
    [order.id, seller.referred_by_seller_id]
  );
  if (existing.rows[0]) return { paid: false, amount: 0, skipped: 'already_paid' };

  const referralRate = Number(seller.referral_commission_rate || 0);
  const commission = Number(order.commission || 0);
  const orderAmount = Number(order.amount || 0);
  const referralAmount = Math.min(commission, Number((orderAmount * referralRate).toFixed(2)));

  if (!referralAmount || referralAmount <= 0) return { paid: false, amount: 0 };

  await client.query(
    `UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2`,
    [referralAmount, seller.referred_by_seller_id]
  );
  await client.query(
    `UPDATE sellers SET referral_earnings=referral_earnings+$1 WHERE user_id=$2`,
    [referralAmount, seller.referred_by_seller_id]
  );
  await client.query(
    `INSERT INTO transactions (user_id, order_id, type, amount, description, meta)
     VALUES ($1,$2,'credit',$3,$4,$5)`,
    [
      seller.referred_by_seller_id,
      order.id,
      referralAmount,
      `Реферальное вознаграждение за заказ ${order.order_number}`,
      JSON.stringify({ source: 'seller_referral', seller_id: order.seller_id, rate: referralRate, platform_commission: commission }),
    ]
  );

  await notify.create(
    seller.referred_by_seller_id,
    'system',
    'Реферальное вознаграждение',
    `На баланс начислено ${referralAmount.toLocaleString('ru')} ₽ за заказ ${order.order_number}`,
    '/seller/referrals'
  ).catch(() => {});

  logger.info('Referral paid', { orderId: order.id, referrerId: seller.referred_by_seller_id, amount: referralAmount });
  return { paid: true, amount: referralAmount, referrerId: seller.referred_by_seller_id };
}

module.exports = { paySellerReferral };
