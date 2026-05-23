const router = require('express').Router();
const { query, transaction } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');
const notify = require('../services/notify');
const logger = require('../config/logger');
const ws     = require('../ws/server');

// ── POST /orders ── Создать заказ ────────────────────

router.post('/', auth, async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id обязателен' });

  try {
    await transaction(async (client) => {
      // Получаем товар
      const { rows: [product] } = await client.query(
        `SELECT p.*, u.id AS seller_user_id,
                s.custom_commission_rate,
                s.referred_by_seller_id,
                s.referral_commission_rate
         FROM products p
         JOIN users u ON u.id = p.seller_id
         LEFT JOIN sellers s ON s.user_id = p.seller_id
         WHERE p.id=$1 AND p.status='active'`,
        [product_id]
      );
      if (!product) throw { status: 404, message: 'Товар не найден или недоступен' };
      if (product.seller_user_id === req.user.id) throw { status: 400, message: 'Нельзя купить свой товар' };
      if (product.keys_count < 1) throw { status: 400, message: 'Нет в наличии' };

      // Проверяем баланс покупателя
      const { rows: [wallet] } = await client.query(
        'SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',
        [req.user.id]
      );
      if (!wallet || wallet.balance < product.price) {
        throw { status: 402, message: 'Недостаточно средств на балансе' };
      }

      // Рассчитываем комиссию: персональная ставка продавца важнее общей.
      const { rows: [commissionSetting] } = await client.query(
        "SELECT value FROM settings WHERE key IN ('default_seller_commission_rate','platform_commission') ORDER BY CASE WHEN key='default_seller_commission_rate' THEN 0 ELSE 1 END LIMIT 1"
      );
      const defaultCommissionRate = parseFloat(commissionSetting?.value || process.env.PLATFORM_COMMISSION || 0.07);
      const sellerCommissionRate = product.custom_commission_rate != null
        ? parseFloat(product.custom_commission_rate)
        : defaultCommissionRate;
      const commission = parseFloat((product.price * sellerCommissionRate).toFixed(2));
      const sellerAmount = parseFloat((product.price - commission).toFixed(2));

      // Создаём заказ
      const { rows: [order] } = await client.query(
        `INSERT INTO orders (buyer_id, seller_id, product_id, amount, commission, seller_amount, delivery_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [req.user.id, product.seller_user_id, product_id, product.price, commission, sellerAmount, product.delivery_type]
      );

      // Списываем с покупателя (hold)
      await client.query(
        'UPDATE wallets SET balance=balance-$1, held=held+$1 WHERE user_id=$2',
        [product.price, req.user.id]
      );

      // Транзакция покупателя
      await client.query(
        `INSERT INTO transactions (user_id, order_id, type, amount, description)
         VALUES ($1,$2,'hold',$3,$4)`,
        [req.user.id, order.id, product.price, `Оплата заказа ${order.order_number}`]
      );

      // Если авто-выдача — сразу выдаём ключ
      let key = null;
      if (product.delivery_type === 'auto') {
        const { rows: [k] } = await client.query(
          `UPDATE product_keys SET is_sold=TRUE, sold_at=NOW(), order_id=$1
           WHERE id=(SELECT id FROM product_keys WHERE product_id=$2 AND NOT is_sold LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id, key_value`,
          [order.id, product_id]
        );
        key = k;

        if (k) {
          await client.query(
            "UPDATE orders SET status='delivered', key_id=$1, delivered_at=NOW(), auto_confirm_at=NOW()+INTERVAL '48 hours' WHERE id=$2",
            [k.id, order.id]
          );

          // Системное сообщение в чат
          await client.query(
            `INSERT INTO order_messages (order_id, sender_id, message, is_system)
             VALUES ($1,$2,$3,TRUE)`,
            [order.id, product.seller_user_id, `🔑 Ключ передан автоматически: <hidden — откройте страницу заказа>`]
          );
        }
      } else {
        // Уведомляем продавца о ручной выдаче
        await client.query(
          "UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1",
          [order.id]
        );
      }

      // Уведомления
      await notify.buyerOrderCreated(req.user.id, order).catch(() => {});
      await notify.sellerNewOrder(product.seller_user_id, order, product).catch(() => {});

      // Системное сообщение
      await client.query(
        `INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`,
        [order.id, req.user.id, `🔒 Сделка создана. Средства заморожены на платформе.`]
      );

      logger.info('Order created', { orderId: order.id, buyerId: req.user.id, amount: product.price });

      return res.status(201).json({
        order: { ...order, status: product.delivery_type === 'auto' ? 'delivered' : 'paid' },
        key: key ? { value: key.key_value } : null,
      });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Create order error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /orders ── Список заказов ────────────────────

router.get('/', auth, async (req, res) => {
  const { page = 1, limit = 20, role = 'buyer', status } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit), 100);

  try {
    const field  = role === 'seller' ? 'seller_id' : 'buyer_id';
    const params = [req.user.id];
    let whereStr = `WHERE o.${field} = $1`;
    if (status) {
      params.push(status);
      whereStr += ` AND o.status = $${params.length}`;
    }
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
  } catch (err) {
    logger.error('Get orders error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /orders/:id ───────────────────────────────────

router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: [order] } = await query(
      `SELECT o.*,
              p.title AS product_title, p.description AS product_desc, p.delivery_type,
              pk.key_value,
              buyer.username AS buyer_name, buyer.avatar_url AS buyer_avatar,
              seller.username AS seller_name, seller.avatar_url AS seller_avatar
       FROM orders o
       JOIN products p ON p.id = o.product_id
       LEFT JOIN product_keys pk ON pk.id = o.key_id
       JOIN users buyer ON buyer.id = o.buyer_id
       JOIN users seller ON seller.id = o.seller_id
       WHERE o.id=$1 AND (o.buyer_id=$2 OR o.seller_id=$2)`,
      [req.params.id, req.user.id]
    );
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const { rows: messages } = await query(
      `SELECT m.*, u.username AS sender_name, u.avatar_url AS sender_avatar
       FROM order_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.order_id=$1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    // Скрываем ключ от продавца (только покупатель видит)
    if (req.user.id === order.seller_id) delete order.key_value;

    res.json({ order, messages });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /orders/:id/message ── Сообщение в чат ───────

router.post('/:id/message', auth, async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Сообщение не может быть пустым' });

  try {
    const { rows: [order] } = await query(
      'SELECT * FROM orders WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)',
      [req.params.id, req.user.id]
    );
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (['confirmed','cancelled','refunded'].includes(order.status)) {
      return res.status(400).json({ error: 'Сделка закрыта' });
    }

    const { rows: [msg] } = await query(
      'INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, message.trim()]
    );

    const enriched = { ...msg, sender_name: req.user.username };

    // Broadcast через WebSocket другим участникам сделки
    try { ws.broadcast(req.params.id, { type: 'message', payload: enriched }, req.user.id); }
    catch (e) { logger.warn('WS broadcast failed', { err: e.message }); }

    // Уведомление в Telegram/in-app другой стороне
    const recipientId = req.user.id === order.buyer_id ? order.seller_id : order.buyer_id;
    notify.orderMessage(recipientId, order, message.trim()).catch(() => {});

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /orders/:id/confirm ── Подтвердить получение ─

router.post('/:id/confirm', auth, async (req, res) => {
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query(
        "SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 AND status='delivered' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!order) throw { status: 404, message: 'Заказ не найден или не может быть подтверждён' };

      // Подтверждаем заказ
      await client.query(
        "UPDATE orders SET status='confirmed', confirmed_at=NOW() WHERE id=$1",
        [order.id]
      );

      // Разморозка и зачисление продавцу
      await client.query(
        'UPDATE wallets SET held=held-$1 WHERE user_id=$2',
        [order.amount, order.buyer_id]
      );
      await client.query(
        'UPDATE wallets SET balance=balance+$1, total_in=total_in+$1 WHERE user_id=$2',
        [order.seller_amount, order.seller_id]
      );

      // Транзакции
      await client.query(
        `INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'release',$3,$4)`,
        [order.buyer_id, order.id, order.amount, `Подтверждение заказа ${order.order_number}`]
      );
      await client.query(
        `INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'credit',$3,$4)`,
        [order.seller_id, order.id, order.seller_amount, `Выплата за заказ ${order.order_number}`]
      );

      // Обновляем статистику продавца
      await client.query(
        'UPDATE sellers SET total_sales=total_sales+1 WHERE user_id=$1',
        [order.seller_id]
      );

      const { rows: [seller] } = await client.query(
        'SELECT referred_by_seller_id, referral_commission_rate FROM sellers WHERE user_id=$1',
        [order.seller_id]
      );
      if (seller?.referred_by_seller_id && seller.referred_by_seller_id !== order.seller_id) {
        const referralRate = parseFloat(seller.referral_commission_rate || 0);
        const referralAmount = Math.min(
          parseFloat(order.commission),
          parseFloat((parseFloat(order.amount) * referralRate).toFixed(2))
        );

        if (referralAmount > 0) {
          await client.query(
            `UPDATE wallets
             SET balance=balance+$1, total_in=total_in+$1
             WHERE user_id=$2`,
            [referralAmount, seller.referred_by_seller_id]
          );
          await client.query(
            `UPDATE sellers
             SET referral_earnings=referral_earnings+$1
             WHERE user_id=$2`,
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
              JSON.stringify({ source: 'seller_referral', seller_id: order.seller_id }),
            ]
          );
        }
      }
      await client.query(
        'UPDATE products SET sales_count=sales_count+1 WHERE id=$1',
        [order.product_id]
      );

      // Системное сообщение
      await client.query(
        `INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`,
        [order.id, order.buyer_id, '✅ Покупатель подтвердил получение. Средства переведены продавцу.']
      );

      // Уведомления
      await notify.sellerOrderConfirmed(order.seller_id, order).catch(() => {});
      await notify.buyerOrderConfirmed(order.buyer_id, order).catch(() => {});

      // Авто-отзыв через 24ч если не оставлен вручную
      // (реализуется через cron/scheduler)

      logger.info('Order confirmed', { orderId: order.id });
      return res.json({ message: 'Получение подтверждено. Средства переведены продавцу.' });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Confirm order error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /orders/:id/dispute ── Открыть спор ──────────

router.post('/:id/dispute', auth, async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Укажите причину спора' });

  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query(
        `SELECT * FROM orders WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)
         AND status IN ('paid','delivering','delivered') FOR UPDATE`,
        [req.params.id, req.user.id]
      );
      if (!order) throw { status: 404, message: 'Заказ не найден или спор невозможен' };

      const { rows: [existingDispute] } = await client.query(
        "SELECT id FROM disputes WHERE order_id=$1 AND status NOT IN ('resolved_buyer','resolved_seller','closed')",
        [order.id]
      );
      if (existingDispute) throw { status: 400, message: 'Спор уже открыт' };

      await client.query("UPDATE orders SET status='disputed' WHERE id=$1", [order.id]);
      const { rows: [dispute] } = await client.query(
        'INSERT INTO disputes (order_id, opener_id, reason) VALUES ($1,$2,$3) RETURNING *',
        [order.id, req.user.id, reason.trim()]
      );

      // Системное сообщение
      await client.query(
        `INSERT INTO order_messages (order_id, sender_id, message, is_system) VALUES ($1,$2,$3,TRUE)`,
        [order.id, req.user.id, `⚠️ Открыт спор: ${reason.trim()}`]
      );

      // Уведомить обе стороны и админа
      await notify.disputeOpened(order, dispute, req.user).catch(() => {});

      logger.info('Dispute opened', { orderId: order.id, disputeId: dispute.id });
      return res.json({ dispute });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /orders/:id/cancel ───────────────────────────

router.post('/:id/cancel', auth, async (req, res) => {
  const { reason } = req.body;
  try {
    await transaction(async (client) => {
      const { rows: [order] } = await client.query(
        "SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 AND status='pending' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!order) throw { status: 404, message: 'Заказ не найден или не может быть отменён' };

      await client.query(
        "UPDATE orders SET status='cancelled', cancelled_at=NOW(), cancel_reason=$1 WHERE id=$2",
        [reason || 'Отменён покупателем', order.id]
      );
      // Возврат замороженных средств
      await client.query(
        'UPDATE wallets SET balance=balance+$1, held=held-$1 WHERE user_id=$2',
        [order.amount, order.buyer_id]
      );
      await client.query(
        `INSERT INTO transactions (user_id, order_id, type, amount, description) VALUES ($1,$2,'refund',$3,$4)`,
        [order.buyer_id, order.id, order.amount, `Возврат за заказ ${order.order_number}`]
      );

      return res.json({ message: 'Заказ отменён. Средства возвращены.' });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
