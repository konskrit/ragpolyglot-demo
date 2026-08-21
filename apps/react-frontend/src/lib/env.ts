export function resolveApiBaseUrl(envApi: string | undefined): string {
  return envApi?.trim() || '';
}

export function resolveWsUrl(
  envWs: string | undefined,
  origin = 'http://localhost:4200',
): string {
  return envWs?.trim() || `${origin}/ws`;
}
