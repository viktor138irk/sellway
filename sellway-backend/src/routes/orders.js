const router = require('express').Router();
const { query, transaction } = require('../config/db');
const { auth } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');
const ws = require('../ws/server');
const { paySellerReferral } = require('../services/referrals');

function parseRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return rating;
}

function parseQuantity(value) {
  const quantity = Number(value || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  return quantity;
}

router.post('/', auth, async (req, res) => {
  const { product_id } = req.body;
  const quantity = parseQuantity(req.body.quantity);
  if (!quantity) return res.status(400).json({ error: 'Укажите корректное количество' });
  if (!product_id) return res.status(400).json({ error: 'product_id обязателен' });

  try {
    await transaction(async (client) => {
      const { rows: [product] } = await client.query(
        `SELECT p.*, u.id AS seller_user_id, s.custom_commission_rate
         FROM products p
         JOIN users u ON u.id = p.seller_id
         LEFT JOIN sellers s ON s.user_id = p.seller_id
         WHERE p.id=$1 AND p.status='active'`,
        [product_id]
      );
      if (!product) throw { status: 404, message: 'Товар не найден или недоступен' };
      if (product.delivery_type === 'service') throw { status: 400, message: 'Услуги оформляются через заявку' };
      if (product.seller_user_id === req.user.id) throw { status: 400, message: 'Нельзя купить свой товар' };
      if (product.delivery_type === 'auto' && product.keys_count < quantity) throw { status: 400, message: `В наличии только ${product.keys_count} шт.` };

      let productFile = null;
      if (product.delivery_type === 'file') {
        const { rows: [file] } = await client.query('SELECT id, url, filename, mime_type, size_bytes FROM product_files WHERE product_id=$1 ORDER BY created_at DESC LIMIT 1', [product_id]);
        if (!file) throw { status: 400, message: 'Файл для выдачи не загружен' };
        productFile = file;
      }

      const { rows: [wallet] } = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id]);
      const amount = Number((Number(product.price) * quantity).toFixed(2));
      if (!wallet || Number(wallet.balance) < amount) throw { status: 402, message: 'Недостаточно средств на балансе' };

      const { rows: [commissionSetting] } = await client.query("SELECT value FROM settings WHERE key IN ('default_seller_commission_rate','platform_commission') ORDER BY CASE WHEN key='default_seller_commission_rate' THEN 0 ELSE 1 END LIMIT 1");
      const defaultCommissionRate = Number(commissionSetting?.value || process.env.PLATFORM_COMMISSION || 0.07);
      const sellerCommissionRate = product.custom_commission_rate != null ? Number(product.custom_commission_rate) : defaultCommissionRate;
      const commission = Number((amount * sellerCommissionRate).toFixed(2));
      const sellerAmount = Number((amount - commission).toFixed(2));

      const { rows: [order] } = await client.query(
        `INSERT INTO orders (buyer_id, seller_id, product_id, quantity, amount, commission, seller_amount, delivery_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.id, product.seller_user_id, product_id, quantity, amount, commission, sellerAmount, product.delivery_type]
      );

      await client.query('UPDATE wallets SET balance=balance-$1, held=held+$1 WHERE user_id=$2', [amount, req.user.id]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'hold',$3,$4)`, [req.user.id, order.id, amount, `Оплата заказа ${order.order_number}`]);

      let keys = [];
      if (product.delivery_type === 'auto') {
        const { rows: soldKeys } = await client.query(
          `UPDATE product_keys SET is_sold=TRUE, sold_at=NOW(), order_id=$1
           WHERE id IN (SELECT id FROM product_keys WHERE product_id=$2 AND NOT is_sold ORDER BY created_at ASC LIMIT $3 FOR UPDATE SKIP LOCKED)
           RETURNING id, key_value`,
          [order.id, product_id, quantity]
        );
        if (soldKeys.length !== quantity) throw { status: 400, message: 'Не удалось зарезервировать нужное количество ключей' };
        keys = soldKeys;
        if (keys.length) {
          await client.query("UPDATE orders SET status='delivered', key_id=$1, delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours', meta=COALESCE(meta,'{}'::jsonb) || $2::jsonb WHERE id=$3", [keys[0].id, JSON.stringify({ keys: keys.map(k => k.key_value) }), order.id]);
          await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, product.seller_user_id, `Ключи переданы автоматически: ${keys.length} шт.`]);
        }
      } else if (product.delivery_type === 'file') {
        await client.query(`UPDATE orders SET status='delivered', delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours', meta=$1::jsonb WHERE id=$2`, [JSON.stringify({ file: productFile }), order.id]);
        await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, product.seller_user_id, `Файл передан автоматически: ${productFile.filename}`]);
      } else {
        await client.query("UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1", [order.id]);
      }

      await notify.buyerOrderCreated(req.user.id, order).catch(() => {});
      await notify.sellerNewOrder(product.seller_user_id, order, product).catch(() => {});
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, req.user.id, 'Сделка создана. Средства заморожены на платформе.']);

      logger.info('Order created', { orderId: order.id, buyerId: req.user.id, amount, quantity });
      return res.status(201).json({ order: { ...order, quantity, amount, status: ['auto', 'file'].includes(product.delivery_type) ? 'delivered' : 'paid' }, keys: keys.map(k => ({ value: k.key_value })) });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Create order error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/', auth, async (req, res) => {
  const { page = 1, limit = 20, role = 'buyer', status } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit), 100);
  try {
    const field = role === 'seller' ? 'seller_id' : 'buyer_id';
    const params = [req.user.id];
    let whereStr = `WHERE o.${field} = $1`;
    if (status) { params.push(status); whereStr += ` AND o.status = $${params.length}`; }
    params.push(Math.min(parseInt(limit), 100), offset);
    const { rows } = await query(
      `SELECT o.*, p.title AS product_title, p.delivery_type,
              (SELECT url FROM product_images WHERE product_id=p.id AND is_main=TRUE LIMIT 1) AS product_image,
              buyer.username AS buyer_name, seller.username AS seller_name
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN users buyer ON buyer.id = o.buyer_id
       JOIN users seller ON seller.id = o.seller_id
       ${whereStr}
       ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ orders: rows });
  } catch (err) { logger.error('Get orders error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: [order] } = await query(
      `SELECT o.*, p.title AS product_title, p.description AS product_desc, p.delivery_type,
              o.meta->'file' AS file, o.meta->'keys' AS key_values, pk.key_value,
              buyer.username AS buyer_name, buyer.avatar_url AS buyer_avatar,
              buyer.buyer_rating, buyer.buyer_reviews_count,
              seller.username AS seller_name, seller.avatar_url AS seller_avatar,
              (SELECT json_build_object('rating', r.rating, 'comment', r.comment, 'created_at', r.created_at)
               FROM reviews r WHERE r.order_id=o.id LIMIT 1) AS seller_review,
              (SELECT json_build_object('rating', br.rating, 'comment', br.comment, 'created_at', br.created_at)
               FROM buyer_reviews br WHERE br.order_id=o.id LIMIT 1) AS buyer_review
       FROM orders o
       JOIN products p ON p.id = o.product_id
       LEFT JOIN product_keys pk ON pk.id = o.key_id
       JOIN users buyer ON buyer.id = o.buyer_id
       JOIN users seller ON seller.id = o.seller_id
       WHERE o.id=$1 AND (o.buyer_id=$2 OR o.seller_id=$2)`,
      [req.params.id, req.user.id]
    );
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const { rows: messages } = await query(`SELECT m.*, u.username AS sender_name, u.avatar_url AS sender_avatar FROM order_messages m JOIN users u ON u.id = m.sender_id WHERE m.order_id=$1 ORDER BY m.created_at ASC`, [req.params.id]);
    if (req.user.id === order.seller_id) delete order.key_value;
    res.json({ order, messages });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/message', auth, async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  try {
    const { rows: [order] } = await query('SELECT * FROM orders WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)', [req.params.id, req.user.id]);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (['confirmed','cancelled','refunded'].includes(order.status)) return res.status(400).json({ error: 'Сделка закрыта' });
    const { rows: [msg] } = await query('INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3) RETURNING *', [req.params.id, req.user.id, message.trim()]);
    const enriched = { ...msg, sender_name: req.user.username };
    try { ws.broadcast(req.params.id, { type: 'message', payload: enriched }, req.user.id); } catch (e) { logger.warn('WS broadcast failed', { err: e.message }); }
    const recipientId = req.user.id === order.buyer_id ? order.seller_id : order.buyer_id;
    notify.orderMessage(recipientId, order, message.trim()).catch(() => {});
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/deliver', auth, async (req, res) => {
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query("SELECT * FROM orders WHERE id=$1 AND seller_id=$2 AND status='paid' FOR UPDATE", [req.params.id, req.user.id]);
      if (!order) throw { status: 404, message: 'Сделка не найдена или не готова к передаче' };
      await client.query("UPDATE orders SET status='delivered', delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours' WHERE id=$1", [order.id]);
      const service = order.delivery_type === 'service';
      const systemMessage = service
        ? 'Фрилансер отметил услугу как выполненную. Заказчик должен подтвердить результат.'
        : 'Продавец отметил товар как переданный. Покупатель должен подтвердить получение.';
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, req.user.id, systemMessage]);
      await notify.create(
        order.buyer_id,
        service ? 'service_delivered' : 'order_delivered',
        service ? 'Услуга выполнена' : 'Заказ передан',
        service ? `Проверьте результат по сделке ${order.order_number} и подтвердите выполнение.` : `Проверьте заказ ${order.order_number} и подтвердите получение.`,
        `/orders/${order.id}`
      ).catch(() => {});
      return res.json({ message: service ? 'Услуга отмечена как выполненная' : 'Заказ отмечен как переданный' });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/confirm', auth, async (req, res) => {
  const rating = parseRating(req.body?.rating);
  const comment = String(req.body?.comment || '').trim().slice(0, 1000);
  if (!rating) return res.status(400).json({ error: 'Укажите оценку продавца от 1 до 5' });

  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query("SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 AND status='delivered' FOR UPDATE", [req.params.id, req.user.id]);
      if (!order) throw { status: 404, message: 'Заказ не найден или не может быть подтверждён' };
      await client.query(
        `INSERT INTO reviews (order_id, buyer_id, seller_id, product_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (order_id) DO UPDATE SET rating=EXCLUDED.rating, comment=EXCLUDED.comment`,
        [order.id, order.buyer_id, order.seller_id, order.product_id, rating, comment || null]
      );
      await client.query("UPDATE orders SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [order.id]);
      await client.query('UPDATE wallets SET held=held-$1 WHERE user_id=$2', [order.amount, order.buyer_id]);
      await client.query('UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2', [order.seller_amount, order.seller_id]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'release',$3,$4)`, [order.buyer_id, order.id, order.amount, `Подтверждение заказа ${order.order_number}`]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'credit',$3,$4)`, [order.seller_id, order.id, order.seller_amount, `Выплата за заказ ${order.order_number}`]);
      await client.query('UPDATE sellers SET total_sales=total_sales+1 WHERE user_id=$1', [order.seller_id]);
      const referral = await paySellerReferral(client, order);
      await client.query('UPDATE products SET sales_count=sales_count+1 WHERE id=$1', [order.product_id]);
      const referralText = referral?.paid ? ` Реферальная выплата: ${referral.amount.toLocaleString('ru')} ₽.` : '';
      const confirmationMessage = order.delivery_type === 'service'
        ? `Заказчик подтвердил выполнение услуги. Средства переведены исполнителю.${referralText}`
        : `Покупатель подтвердил получение. Средства переведены продавцу.${referralText}`;
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, order.buyer_id, confirmationMessage]);
      await notify.sellerOrderConfirmed(order.seller_id, order).catch(() => {});
      await notify.buyerOrderConfirmed(order.buyer_id, order).catch(() => {});
      logger.info('Order confirmed', { orderId: order.id, referralPaid: referral?.amount || 0 });
      return res.json({ message: order.delivery_type === 'service' ? 'Выполнение подтверждено. Средства переведены исполнителю.' : 'Получение подтверждено. Средства переведены продавцу.', referral });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); logger.error('Confirm order error', { err: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/rate-buyer', auth, async (req, res) => {
  const rating = parseRating(req.body?.rating);
  const comment = String(req.body?.comment || '').trim().slice(0, 1000);
  if (!rating) return res.status(400).json({ error: 'Укажите оценку покупателя от 1 до 5' });

  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query(
        "SELECT * FROM orders WHERE id=$1 AND seller_id=$2 AND status='confirmed' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!order) throw { status: 404, message: 'Заказ не найден или ещё не завершён' };
      const { rows: [review] } = await client.query(
        `INSERT INTO buyer_reviews (order_id, seller_id, buyer_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (order_id) DO UPDATE SET rating=EXCLUDED.rating, comment=EXCLUDED.comment
         RETURNING *`,
        [order.id, order.seller_id, order.buyer_id, rating, comment || null]
      );
      await client.query(
        `INSERT INTO order_messages (order_id, sender_id, message, is_system)
         VALUES ($1,$2,$3,TRUE)`,
        [order.id, order.seller_id, `Продавец оценил покупателя на ${rating}/5.`]
      );
      await notify.create(order.buyer_id, 'review_new', '⭐ Вам поставили оценку', `Продавец оценил сделку ${order.order_number} на ${rating}/5.`, `/orders/${order.id}`).catch(() => {});
      return res.json({ review });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Rate buyer error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/:id/dispute', auth, async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Укажите причину спора' });
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query(`SELECT * FROM orders WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2) AND status IN ('paid','delivering','delivered') FOR UPDATE`, [req.params.id, req.user.id]);
      if (!order) throw { status: 404, message: 'Заказ не найден или спор невозможен' };
      const { rows: [existingDispute] } = await client.query("SELECT id FROM disputes WHERE order_id=$1 AND status NOT IN ('resolved_buyer','resolved_seller','closed')", [order.id]);
      if (existingDispute) throw { status: 400, message: 'Спор уже открыт' };
      await client.query("UPDATE orders SET status='disputed' WHERE id=$1", [order.id]);
      const { rows: [dispute] } = await client.query('INSERT INTO disputes (order_id, opener_id, reason) VALUES ($1,$2,$3) RETURNING *', [order.id, req.user.id, reason.trim()]);
      await client.query(`INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`, [order.id, req.user.id, `Открыт спор: ${reason.trim()}`]);
      await notify.disputeOpened(order, dispute, req.user).catch(() => {});
      logger.info('Dispute opened', { orderId: order.id, disputeId: dispute.id });
      return res.json({ dispute });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/:id/cancel', auth, async (req, res) => {
  const { reason } = req.body;
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query("SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 AND status='pending' FOR UPDATE", [req.params.id, req.user.id]);
      if (!order) throw { status: 404, message: 'Заказ не найден или не может быть отменён' };
      await client.query("UPDATE orders SET status='cancelled', cancelled_at=NOW(), cancel_reason=$1 WHERE id=$2", [reason || 'Отменён покупателем', order.id]);
      await client.query('UPDATE wallets SET balance=balance+$1, held=held-$1 WHERE user_id=$2', [order.amount, order.buyer_id]);
      await client.query(`INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'refund',$3,$4)`, [order.buyer_id, order.id, order.amount, `Возврат за заказ ${order.order_number}`]);
      return res.json({ message: 'Заказ отменён. Средства возвращены.' });
    });
  } catch (err) { if (err.status) return res.status(err.status).json({ error: err.message }); res.status(500).json({ error: 'Ошибка сервера' }); }
});

module.exports = router;
