const router = require('express').Router();
const { transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');
const { paySellerReferral } = require('../services/referrals');

function normalizeSteps(input) {
  if (!Array.isArray(input)) return [];
  return input.map((step, index) => ({
    title: String(step?.title || '').trim(),
    description: String(step?.description || '').trim(),
    amount: Number(step?.amount || step?.price || 0),
    sort_order: Number(step?.sort_order ?? index),
    status: 'pending',
  })).filter(step => step.title && step.amount >= 0);
}

async function getCommissionRate(client, sellerId) {
  const { rows: [seller] } = await client.query('SELECT custom_commission_rate FROM sellers WHERE user_id=$1', [sellerId]);
  if (seller?.custom_commission_rate != null) return Number(seller.custom_commission_rate);
  const { rows: [setting] } = await client.query("SELECT value FROM settings WHERE key IN ('default_seller_commission_rate','platform_commission') ORDER BY CASE WHEN key='default_seller_commission_rate' THEN 0 ELSE 1 END LIMIT 1");
  return Number(setting?.value || process.env.PLATFORM_COMMISSION || 0.07);
}

router.post('/', auth, async (req, res) => {
  const { product_id, message } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id обязателен' });
  try {
    await transaction(async (client) => {
      const { rows: [product] } = await client.query(`SELECT p.*, u.id AS seller_user_id FROM products p JOIN users u ON u.id=p.seller_id WHERE p.id=$1 AND p.status='active' AND p.delivery_type='service'`, [product_id]);
      if (!product) throw { status: 404, message: 'Услуга не найдена или недоступна' };
      if (product.seller_user_id === req.user.id) throw { status: 400, message: 'Нельзя заказать свою услугу' };
      const meta = { service: true, price_mode: 'from', start_price: Number(product.price), negotiation_status: 'requested' };
      const { rows: [order] } = await client.query(`INSERT INTO orders (buyer_id, seller_id, product_id, status, amount, commission, seller_amount, delivery_type, meta) VALUES ($1,$2,$3,'pending',$4,0,0,'service',$5::jsonb) RETURNING *`, [req.user.id, product.seller_user_id, product_id, product.price, JSON.stringify(meta)]);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, req.user.id, 'Заявка на услугу создана. Цена пока предварительная — от ' + Number(product.price).toLocaleString('ru') + ' ₽.']);
      if (message?.trim()) await client.query(`INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3)`, [order.id, req.user.id, message.trim()]);
      await notify.create(product.seller_user_id, 'service_order', 'Новая заявка на услугу', `${req.user.username} отправил заявку по услуге ${product.title}`, `/orders/${order.id}`).catch(() => {});
      logger.info('Service order requested', { orderId: order.id, buyerId: req.user.id, productId: product.id });
      return res.status(201).json({ order });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Create service order error', { err: err.message }); return res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/proposal', auth, requireRole('freelancer', 'admin'), async (req, res) => {
  const amount = Number(req.body.amount);
  const steps = normalizeSteps(req.body.steps);
  const note = String(req.body.note || '').trim();
  if (!amount || amount < 1) return res.status(400).json({ error: 'Укажите итоговую стоимость' });
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query("SELECT * FROM orders WHERE id=$1 AND delivery_type='service' FOR UPDATE", [req.params.id]);
      if (!order) throw { status: 404, message: 'Сделка услуги не найдена' };
      if (order.seller_id !== req.user.id && req.user.role !== 'admin') throw { status: 403, message: 'Нет доступа' };
      if (order.status !== 'pending') throw { status: 400, message: 'Смету можно отправить только до утверждения заказчиком' };
      const rate = await getCommissionRate(client, order.seller_id);
      const commission = Number((amount * rate).toFixed(2));
      const sellerAmount = Number((amount - commission).toFixed(2));
      const meta = order.meta && typeof order.meta === 'object' ? order.meta : {};
      meta.service = true;
      meta.negotiation_status = 'awaiting_customer';
      meta.proposal = { amount, commission, seller_amount: sellerAmount, steps, note, sent_at: new Date().toISOString() };
      const { rows: [updated] } = await client.query(`UPDATE orders SET amount=$1, commission=$2, seller_amount=$3, meta=$4::jsonb WHERE id=$5 RETURNING *`, [amount, commission, sellerAmount, JSON.stringify(meta), order.id]);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, req.user.id, 'Фрилансер отправил смету на ' + amount.toLocaleString('ru') + ' ₽. Заказчик должен подтвердить стоимость.']);
      if (note) await client.query(`INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3)`, [order.id, req.user.id, note]);
      await notify.create(order.buyer_id, 'service_proposal', 'Смета по услуге', `Фрилансер отправил смету на ${amount.toLocaleString('ru')} ₽`, `/orders/${order.id}`).catch(() => {});
      logger.info('Service proposal sent', { orderId: order.id, sellerId: req.user.id, amount });
      return res.json({ order: updated });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Service proposal error', { err: err.message }); return res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/accept-proposal', auth, async (req, res) => {
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query("SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 AND delivery_type='service' AND status='pending' FOR UPDATE", [req.params.id, req.user.id]);
      if (!order) throw { status: 404, message: 'Сделка не найдена или смета уже обработана' };
      const meta = order.meta && typeof order.meta === 'object' ? order.meta : {};
      const proposal = meta.proposal;
      if (!proposal || meta.negotiation_status !== 'awaiting_customer') throw { status: 400, message: 'Нет сметы для подтверждения' };
      const amount = Number(proposal.amount || order.amount);
      const { rows: [wallet] } = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [order.buyer_id]);
      if (!wallet || Number(wallet.balance) < amount) throw { status: 402, message: 'Недостаточно средств на балансе' };
      meta.negotiation_status = 'accepted';
      meta.accepted_at = new Date().toISOString();
      await client.query('UPDATE wallets SET balance=balance-$1, held=held+$1 WHERE user_id=$2', [amount, order.buyer_id]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description, meta) VALUES ($1,$2,'hold',$3,$4,$5)`, [order.buyer_id, order.id, amount, 'Резерв по услуге ' + order.order_number, JSON.stringify({ source: 'service_proposal' })]);
      const { rows: [updated] } = await client.query("UPDATE orders SET status='paid', paid_at=NOW(), amount=$1, commission=$2, seller_amount=$3, meta=$4::jsonb WHERE id=$5 RETURNING *", [amount, Number(proposal.commission || 0), Number(proposal.seller_amount || 0), JSON.stringify(meta), order.id]);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, order.buyer_id, 'Заказчик подтвердил смету. Средства зарезервированы на платформе.']);
      await notify.create(order.seller_id, 'service_proposal_accepted', 'Смета подтверждена', `Заказчик подтвердил смету по сделке ${order.order_number}`, `/orders/${order.id}`).catch(() => {});
      logger.info('Service proposal accepted', { orderId: order.id, buyerId: order.buyer_id, amount });
      return res.json({ order: updated });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Accept service proposal error', { err: err.message }); return res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/deliver', auth, requireRole('freelancer', 'admin'), async (req, res) => {
  const result = String(req.body?.result || '').trim().slice(0, 4000);
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query("SELECT * FROM orders WHERE id=$1 AND delivery_type='service' AND seller_id=$2 AND status='paid' FOR UPDATE", [req.params.id, req.user.id]);
      if (!order) throw { status: 404, message: 'Сделка не найдена или не готова к завершению' };
      const meta = order.meta && typeof order.meta === 'object' ? order.meta : {};
      meta.service_delivery = { result, delivered_at: new Date().toISOString() };
      await client.query("UPDATE orders SET status='delivered', delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours', meta=$1::jsonb WHERE id=$2", [JSON.stringify(meta), order.id]);
      if (result) {
        await client.query('INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3)', [order.id, req.user.id, result]);
      }
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, req.user.id, 'Фрилансер отметил услугу как выполненную. Заказчик должен подтвердить результат.']);
      await notify.create(order.buyer_id, 'service_delivered', 'Услуга выполнена', `Проверьте результат по сделке ${order.order_number}`, `/orders/${order.id}`).catch(() => {});
      logger.info('Service marked delivered', { orderId: order.id, sellerId: req.user.id });
      return res.json({ message: 'Результат отправлен заказчику. Услуга отмечена как выполненная.' });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); return res.status(500).json({ error: 'Ошибка сервера' }); }
});

module.exports = router;
