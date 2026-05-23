// src/ws/server.js — WebSocket сервер для Escrow-чата
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const { query } = require('../config/db');
const logger = require('../config/logger');

// Map: orderId → Set<{ ws, userId }>
const orderRooms = new Map();

function getRoomKey(orderId) { return `order:${orderId}`; }

function broadcast(orderId, data, exceptUserId = null) {
  const key  = getRoomKey(orderId);
  const room = orderRooms.get(key);
  if (!room) return;
  const payload = JSON.stringify(data);
  for (const client of room) {
    if (client.userId !== exceptUserId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

function joinRoom(orderId, ws, userId) {
  const key = getRoomKey(orderId);
  if (!orderRooms.has(key)) orderRooms.set(key, new Set());
  orderRooms.get(key).add({ ws, userId });
}

function leaveRoom(orderId, ws) {
  const key  = getRoomKey(orderId);
  const room = orderRooms.get(key);
  if (!room) return;
  for (const client of room) {
    if (client.ws === ws) { room.delete(client); break; }
  }
  if (room.size === 0) orderRooms.delete(key);
}

function setup(server) {
  const wss = new WebSocketServer({ server, path: '/ws/orders' });

  wss.on('connection', async (ws, req) => {
    const { pathname, query: qs } = url.parse(req.url, true);

    // /ws/orders/:orderId
    const match = pathname.match(/^\/ws\/orders\/([a-f0-9-]+)$/i);
    if (!match) return ws.close(1008, 'Invalid path');

    const orderId = match[1];
    const token   = qs.token;

    // Верификация токена
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
    } catch {
      return ws.close(1008, 'Unauthorized');
    }

    // Проверяем доступ к заказу
    try {
      const { rows } = await query(
        'SELECT id FROM orders WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)',
        [orderId, userId]
      );
      if (!rows[0]) return ws.close(1008, 'Access denied');
    } catch {
      return ws.close(1011, 'DB error');
    }

    joinRoom(orderId, ws, userId);
    logger.debug('WS connected', { orderId, userId });

    ws.send(JSON.stringify({ type: 'connected', payload: { orderId } }));

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.type === 'message') {
          // Сохраняем в БД
          const { rows: [msg] } = await query(
            'INSERT INTO order_messages (order_id, sender_id, message) VALUES ($1,$2,$3) RETURNING *',
            [orderId, userId, data.payload?.text?.trim().slice(0, 2000)]
          );
          // Добавляем имя отправителя
          const { rows: [user] } = await query('SELECT username, avatar_url FROM users WHERE id=$1', [userId]);
          const enriched = { ...msg, sender_name: user?.username, sender_avatar: user?.avatar_url };

          // Рассылаем всем в комнате кроме отправителя
          broadcast(orderId, { type: 'message', payload: enriched }, userId);
          // Подтверждаем отправителю
          ws.send(JSON.stringify({ type: 'message_sent', payload: enriched }));
        }

        if (data.type === 'typing') {
          broadcast(orderId, { type: 'typing', payload: { userId } }, userId);
        }

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err) {
        logger.error('WS message error', { err: err.message });
      }
    });

    ws.on('close', () => {
      leaveRoom(orderId, ws);
      logger.debug('WS disconnected', { orderId, userId });
    });

    ws.on('error', (err) => {
      logger.error('WS error', { err: err.message, orderId, userId });
      leaveRoom(orderId, ws);
    });
  });

  // Ping-pong для держания соединения
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });
  wss.on('close', () => clearInterval(interval));

  logger.info('WebSocket server ready at /ws/orders/:id');

  // Экспортируем broadcast для использования в routes
  return { broadcast };
}

module.exports = { setup, broadcast };
