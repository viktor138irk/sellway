import { useEffect, useRef, useState, useCallback } from 'react';

const WS_BASE = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export function useOrderWebSocket(orderId, onMessage) {
  const ws         = useRef(null);
  const [ready, setReady]       = useState(false);
  const [error, setError]       = useState(null);
  const reconnectTimer          = useRef(null);
  const attempts                = useRef(0);
  const onMessageRef            = useRef(onMessage);
  onMessageRef.current          = onMessage;

  const connect = useCallback(() => {
    if (!orderId) return;
    const token = localStorage.getItem('accessToken');
    const url   = `${WS_BASE}/ws/orders/${orderId}?token=${token}`;

    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setReady(true);
      setError(null);
      attempts.current = 0;
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessageRef.current?.(data);
      } catch {}
    };

    ws.current.onerror = () => setError('Ошибка соединения');

    ws.current.onclose = (e) => {
      setReady(false);
      if (e.code !== 1000 && attempts.current < 5) {
        const delay = Math.min(1000 * 2 ** attempts.current, 15000);
        attempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [orderId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close(1000);
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, ready, error };
}
