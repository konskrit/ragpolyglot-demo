import { resolveApiBaseUrl, resolveWsUrl } from './lib/env';

const envApi = import.meta.env.VITE_API_URL as string | undefined;
const envWs = import.meta.env.VITE_WS_URL as string | undefined;

export const API_BASE_URL = resolveApiBaseUrl(envApi);

export const WS_URL = resolveWsUrl(
  envWs,
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3000',
);
