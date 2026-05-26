const { query, transaction } = require('../config/db');
const logger = require('../config/logger');
const notify = require('./notify');

const METHODS = new Set(['card', 'sbp', 'paypal', 'crypto']);
const USDT_NETWORKS = new Set(['TRC20', 'BEP20', 'ERC20', 'TON', 'POLYGON']);

async function getSettings() {
  const { rows } = await query(
    `SELECT key, value FROM settings
     WHERE key IN (
       'auto_payouts_enabled', 'min_withdrawal', 'max_withdrawal_daily', 'withdrawal_commission',
       'withdraw_method_card_enabled', 'withdraw_method_card_commission',
       'withdraw_method_sbp_enabled', 'withdraw_method_sbp_commission',
       'withdraw_method_paypal_enabled', 'withdraw_method_paypal_commission',
       'withdraw_method_crypto_enabled', 'withdraw_method_crypto_commission'
     )`
  );
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

function methodRate(method, settings, personalRate) {
  if (method === 'crypto') return 0;
  if (personalRate != null) return Number(personalRate);
  return Number(settings[`withdraw_method_${method}_commission`] ?? settings.withdrawal_commission ?? 0.02);
}

async function createAutomaticPayout(candidate, settings) {
  return transaction(async client => {
    const { rows: [seller] } = await client.query(
      `SELECT s.auto_payout_enabled, s.auto_payout_method, s.auto_payout_threshold,
              s.auto_payout_requisites, s.custom_withdrawal_commission_rate,
              w.balance
       FROM sellers s JOIN wallets w ON w.user_id=s.user_id
       WHERE s.user_id=$1 FOR UPDATE OF w`,
      [candidate.user_id]
    );
    if (!seller?.auto_payout_enabled) return null;
    const method = String(seller.auto_payout_method || 'card');
    const requisites = seller.auto_payout_requisites || {};
    const balance = Number(seller.balance || 0);
    const threshold = Number(seller.auto_payout_threshold || settings.min_withdrawal || 500);
    const minAmount = Number(settings.min_withdrawal || 500);
    if (!METHODS.has(method) || settings[`withdraw_method_${method}_enabled`] === 'false' || !String(requisites.account || '').trim()) return null;
    if (method === 'crypto' && !USDT_NETWORKS.has(String(requisites.network || ''))) return null;
    if (balance < threshold || balance < minAmount) return null;

    const { rows: [pending] } = await client.query(
      `SELECT id FROM withdrawal_requests WHERE user_id=$1 AND status='pending' LIMIT 1`,
      [candidate.user_id]
    );
    if (pending) return null;
    const { rows: [today] } = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM withdrawal_requests
       WHERE user_id=$1 AND created_at::date=CURRENT_DATE AND status <> 'rejected'`,
      [candidate.user_id]
    );
    const availableToday = Math.max(0, Number(settings.max_withdrawal_daily || 100000) - Number(today.total || 0));
    const amount = Math.min(balance, availableToday);
    if (amount < threshold || amount < minAmount) return null;
    const commission = Number((amount * methodRate(method, settings, seller.custom_withdrawal_commission_rate)).toFixed(2));
    const netAmount = Number((amount - commission).toFixed(2));
    const storedRequisites = { ...requisites, automatic: true };
    const { rows: [withdrawal] } = await client.query(
      `INSERT INTO withdrawal_requests (user_id, amount, commission, net_amount, method, requisites)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [candidate.user_id, amount, commission, netAmount, method, JSON.stringify(storedRequisites)]
    );
    await client.query('UPDATE wallets SET balance=balance-$1 WHERE user_id=$2', [amount, candidate.user_id]);
    return withdrawal;
  });
}

async function runAutoPayouts() {
  try {
    const settings = await getSettings();
    if (settings.auto_payouts_enabled === 'false') return;
    const { rows: candidates } = await query(
      `SELECT s.user_id, u.username
       FROM sellers s
       JOIN users u ON u.id=s.user_id
       JOIN wallets w ON w.user_id=s.user_id
       WHERE s.auto_payout_enabled=TRUE
         AND s.verified=TRUE
         AND s.commercial_application_status='approved'
         AND w.balance >= GREATEST(s.auto_payout_threshold, $1)
         AND NOT EXISTS (
           SELECT 1 FROM withdrawal_requests wr
           WHERE wr.user_id=s.user_id AND wr.status='pending'
         )
       LIMIT 100`,
      [Number(settings.min_withdrawal || 500)]
    );
    for (const candidate of candidates) {
      const withdrawal = await createAutomaticPayout(candidate, settings);
      if (!withdrawal) continue;
      notify.notifyAdmins(
        'system',
        'Автовыплата: новая заявка',
        `${candidate.username}: ${Number(withdrawal.amount).toLocaleString('ru')} ₽ через ${withdrawal.method === 'crypto' ? `USDT (${withdrawal.requisites?.network})` : withdrawal.method}`,
        '/admin/withdrawals'
      ).catch(() => {});
      logger.info('Automatic withdrawal requested', { userId: candidate.user_id, amount: withdrawal.amount, method: withdrawal.method });
    }
  } catch (err) {
    logger.error('Automatic payouts error', { err: err.message });
  }
}

module.exports = { runAutoPayouts };
