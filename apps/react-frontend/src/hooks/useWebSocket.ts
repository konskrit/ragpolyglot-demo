import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { WS_URL } from '../config';

let sharedSocket: Socket | null = null;
const subscribedDocumentIds = new Set<string>();

function resubscribeDocuments(socket: Socket): void {
  for (const documentId of subscribedDocumentIds) {
    socket.emit('subscribe:document', { documentId });
  }
}

function getSharedSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    sharedSocket.on('connect', () => {
      resubscribeDocuments(sharedSocket!);
    });
  }
  return sharedSocket;
}

export function useWebSocketEvent<T>(
  event: string,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

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

  const onConnect = () => {
    socket.emit(event, payload);
  };
  socket.once('connect', onConnect);
}

export function subscribeDocument(documentId: string): void {
  if (!documentId) return;
  subscribedDocumentIds.add(documentId);
  emitWebSocket('subscribe:document', { documentId });
}

export function unsubscribeDocument(documentId: string): void {
  subscribedDocumentIds.delete(documentId);
}
