import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { WS_URL } from '../config';

let sharedSocket: Socket | null = null;

function getSharedSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
  }
  return sharedSocket;
}

export function useWebSocketEvent<T>(
  event: string,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const socket = getSharedSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener as (...args: unknown[]) => void);

    return () => {
      socket.off(event, listener as (...args: unknown[]) => void);
    };
  }, [event]);
}

export function useWebSocketStatus(): {
  connected: boolean;
} {
  const [connected, setConnected] = useState(() => getSharedSocket().connected);

  useEffect(() => {
    const socket = getSharedSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { connected };
}

export function emitWebSocket<T>(event: string, payload?: T): void {
  const socket = getSharedSocket();
  if (socket.connected) {
    socket.emit(event, payload);
    return;
  }

  socket.once('connect', () => {
    socket.emit(event, payload);
  });
}

export function subscribeDocument(documentId: string): void {
  emitWebSocket('subscribe:document', { documentId });
}
