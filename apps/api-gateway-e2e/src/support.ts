import axios from 'axios';

export const BASE_URL =
  process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:3000';
export const WS_URL =
  process.env.INTEGRATION_WS_URL ?? 'http://127.0.0.1:3000/ws';
export const STUB_ANSWER =
  process.env.STUB_LLM_ANSWER ?? 'Integration test answer from stub LLM.';

export const api = axios.create({ baseURL: BASE_URL, timeout: 30_000 });

const TEST_DOC =
  'RAGPolyglot integration test document for upload, chunking, and chat.';

let readyDocId: string | undefined;

export async function pollUntilReady(
  documentId: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: string | undefined;

  while (Date.now() < deadline) {
    const { data } = await api.get<{ status: string }>(
      `/api/documents/${documentId}`,
    );
    lastStatus = data.status;
    if (data.status === 'ready') return;
    if (data.status === 'failed') {
      throw new Error(`Document ${documentId} failed during ingestion`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(
    `Timed out waiting for ready (documentId=${documentId}, last=${lastStatus})`,
  );
}

export async function uploadReadyDocument(): Promise<string> {
  if (readyDocId) {
    const check = await api.get<{ status: string }>(
      `/api/documents/${readyDocId}`,
    );
    if (check.data.status === 'ready') return readyDocId;
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([TEST_DOC], { type: 'text/plain' }),
    'fixture.txt',
  );
  form.append('title', 'Integration Fixture');

  const upload = await api.post<{ id: string }>('/api/documents/upload', form);
  await pollUntilReady(upload.data.id);
  readyDocId = upload.data.id;
  return readyDocId;
}
