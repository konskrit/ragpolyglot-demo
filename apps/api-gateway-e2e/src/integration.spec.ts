import { io, Socket } from 'socket.io-client';
import {
  api,
  STUB_ANSWER,
  WS_URL,
  pollUntilReady,
  uploadReadyDocument,
} from './support';

describe('integration (--profile test + llm-stub)', () => {
  it('health — all dependencies ok', async () => {
    const res = await api.get('/api/health');
    expect(res.data.status).toBe('ok');
    expect(res.data.document_service).toBe('ok');
    expect(res.data.rag_worker).toBe('ok');
    expect(res.data.event_processor).toBe('ok');
    expect(res.data.redis).toBe('ok');
    expect(res.data.rabbitmq).toBe('ok');
  });

  it('ingestion — upload reaches ready', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['Integration upload test document.'], { type: 'text/plain' }),
      'upload-test.txt',
    );
    form.append('title', 'Upload Test');

    const upload = await api.post<{ id: string }>(
      '/api/documents/upload',
      form,
    );
    expect(upload.data.id).toBeTruthy();
    await pollUntilReady(upload.data.id);
  }, 95_000);

  describe('chat', () => {
    let socket: Socket;

    beforeAll(() => uploadReadyDocument());

    beforeEach(async () => {
      socket = io(WS_URL, { transports: ['websocket'], forceNew: true });
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('ws connect timeout')),
          10_000,
        );
        socket.on('connect', () => {
          clearTimeout(t);
          resolve();
        });
        socket.on('connect_error', (e) => {
          clearTimeout(t);
          reject(e);
        });
      });
    });

    afterEach(() => {
      socket?.removeAllListeners();
      socket?.disconnect();
    });

    it('WebSocket — stub LLM answer with sources', async () => {
      const conversationId = crypto.randomUUID();
      const result = await new Promise<{ text: string; sources: unknown[] }>(
        (resolve, reject) => {
          const tokens: string[] = [];
          const t = setTimeout(() => reject(new Error('chat timeout')), 45_000);

          socket.on('chat:token', ({ token, conversationId: id }) => {
            if (id === conversationId) tokens.push(token);
          });
          socket.on('chat:complete', (p) => {
            if (p.conversationId !== conversationId) return;
            clearTimeout(t);
            resolve({ text: tokens.join(''), sources: p.sources ?? [] });
          });

          socket.emit('chat:query', {
            query: 'What is this document about?',
            conversationId,
          });
        },
      );

      expect(result.text).toContain(STUB_ANSWER);
      expect(result.sources.length).toBeGreaterThan(0);
    }, 50_000);

    it('WebSocket — interrupt cancels in-flight request', async () => {
      // Unique query avoids Redis cache so the stub delay is in play.
      const conversationId = crypto.randomUUID();
      const query = `interrupt-${conversationId}`;

      const result = await new Promise<{ interrupted?: boolean }>(
        (resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error('interrupt timeout')),
            15_000,
          );

          socket.on('chat:complete', (p) => {
            if (p.conversationId !== conversationId) return;
            clearTimeout(t);
            resolve(p);
          });

          socket.emit('chat:query', { query, conversationId });
          setTimeout(
            () => socket.emit('chat:interrupt', { conversationId }),
            200,
          );
        },
      );

      expect(result.interrupted).toBe(true);
    }, 20_000);

    it('REST POST /api/chat — stub answer', async () => {
      const res = await api.post<{ content: string; sources: unknown[] }>(
        '/api/chat',
        { message: 'Summarize the document.' },
      );
      expect(res.data.content).toContain(STUB_ANSWER);
      expect(res.data.sources.length).toBeGreaterThan(0);
    });
  });
});
