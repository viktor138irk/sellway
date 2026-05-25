const { query } = require('../config/db');
const logger = require('../config/logger');

// Ленивый импорт бота чтобы избежать circular deps
let bot = null;
let adminBot = null;
function getBot() {
  if (!bot) {
    try { bot = require('../telegram/bot'); } catch {}
  }
  return bot;
}

function getAdminBot() {
  if (!adminBot) {
    try { adminBot = require('../telegram/adminBot'); } catch {}
  }
  return adminBot;
}

// ── Создать in-app уведомление ───────────────────────

async function create(userId, type, title, body, link = null, meta = {}) {
  try {
    const { rows: [notif] } = await query(
      `INSERT INTO notifications (user_id, type, title, body, link, meta)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, type, title, body, link, meta]
    );

    // Отправка в Telegram
    const tg = getBot();
    if (tg) {
      tg.sendToUser(userId, `${title}\n\n${body}`).catch(() => {});
    }

    return notif;
  } catch (err) {
    logger.error('Notify create error', { err: err.message, userId, type });
  }
}

// ── Покупатель ────────────────────────────────────────

async function buyerOrderCreated(userId, order) {
  return create(userId, 'order_new',
    '🛒 Заказ создан',
    `Заказ ${order.order_number} на сумму ${order.amount} ₽ оформлен. Средства заморожены.`,
    `/orders/${order.id}`
  );
}

async function buyerOrderConfirmed(userId, order) {
  const service = order.delivery_type === 'service';
  return create(userId, 'order_confirmed',
    service ? '✅ Выполнение подтверждено' : '✅ Получение подтверждено',
    service ? `Сделка ${order.order_number} по услуге завершена.` : `Заказ ${order.order_number} закрыт. Спасибо за покупку!`,
    `/orders/${order.id}`
  );
}

async function buyerKeyDelivered(userId, order) {
  return create(userId, 'key_delivered',
    '🔑 Товар передан',
    `По заказу ${order.order_number} передан ключ/товар. Проверьте и подтвердите получение.`,
    `/orders/${order.id}`
  );
}

// ── Продавец ──────────────────────────────────────────

async function sellerNewOrder(userId, order, product) {
  return create(userId, 'order_new',
    '🛒 Новый заказ!',
    `Заказан "${product.title}". Сумма к получению: ${order.seller_amount} ₽. Заказ: ${order.order_number}`,
    `/orders/${order.id}`
  );
}

async function sellerOrderConfirmed(userId, order) {
  const service = order.delivery_type === 'service';
  return create(userId, 'order_confirmed',
    '💰 Оплата получена',
    `${service ? 'Заказчик подтвердил выполнение' : 'Покупатель подтвердил получение'} по заказу ${order.order_number}. Зачислено: ${order.seller_amount} ₽`,
    `/orders/${order.id}`
  );
}

async function sellerWithdrawApproved(userId, withdrawal) {
  return create(userId, 'withdraw_approved',
    '✅ Вывод одобрен',
    `Заявка на вывод ${withdrawal.net_amount} ₽ одобрена и обрабатывается.`,
    '/seller/finances'
  );
}

async function sellerWithdrawRejected(userId, withdrawal, reason) {
  return create(userId, 'withdraw_rejected',
    '❌ Вывод отклонён',
    `Заявка на вывод ${withdrawal.amount} ₽ отклонена. Причина: ${reason || 'не указана'}`,
    '/seller/finances'
  );
}

// ── Спор ─────────────────────────────────────────────

async function disputeOpened(order, dispute, opener) {
  const opponentId = opener.id === order.buyer_id ? order.seller_id : order.buyer_id;

  // Уведомляем оппонента
  await create(opponentId, 'order_disputed',
    '⚠️ Открыт спор',
    `По заказу ${order.order_number} открыт спор. Ожидайте решения модератора.`,
    `/orders/${order.id}`
  );

  // Уведомляем всех админов
  await notifyAdmins('order_disputed',
    '🚨 Новый спор',
    `Спор по заказу ${order.order_number} на сумму ${order.amount} ₽. Открыл: ${opener.username}`,
    `/admin/disputes/${dispute.id}`
  );
}

// ── Сообщение в чате ──────────────────────────────────

async function orderMessage(recipientId, order, message) {
  return create(recipientId, 'order_new',
    '💬 Новое сообщение',
    `Сообщение по заказу ${order.order_number}: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
    `/orders/${order.id}`
  );
}

// ── Модерация товара ──────────────────────────────────

async function adminNewProduct(product) {
  return notifyAdmins('system',
    '📦 Новый товар на модерации',
    `Товар "${product.title}" ожидает проверки.`,
    '/admin/products'
  );
}

// ── Уведомить всех админов ────────────────────────────

async function notifyAdmins(type, title, body, link) {
  try {
    const { rows: admins } = await query(
      "SELECT id FROM users WHERE role IN ('admin','moderator') AND status='active'"
    );
    for (const admin of admins) {
      await create(admin.id, type, title, body, link);
    }
    // Отдельно — Telegram admin chat
    const tg = getAdminBot();
    if (tg && process.env.TELEGRAM_ADMIN_CHAT_ID) {
      tg.sendToChat(process.env.TELEGRAM_ADMIN_CHAT_ID, `${title}\n\n${body}`).catch(() => {});
    }
  } catch (err) {
    logger.error('notifyAdmins error', { err: err.message });
  }
}

module.exports = {
  create,
  buyerOrderCreated, buyerOrderConfirmed, buyerKeyDelivered,
  sellerNewOrder, sellerOrderConfirmed, sellerWithdrawApproved, sellerWithdrawRejected,
  disputeOpened, orderMessage, adminNewProduct, notifyAdmins,
};
