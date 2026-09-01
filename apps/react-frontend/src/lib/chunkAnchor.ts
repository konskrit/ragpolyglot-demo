export function chunkAnchorId(chunkIndex: number): string {
  return `chunk-${chunkIndex + 1}`;
}

export function parseChunkAnchorHash(hash: string): number | null {
  const match = hash.match(/^#chunk-(\d+)$/);
  if (!match) return null;
  const display = Number(match[1]);
  if (!Number.isInteger(display) || display < 1) return null;
  return display - 1;
}

export function parseChunkNavigationTarget(
  hash: string,
  state: unknown,
): number | null {
  const fromHash = parseChunkAnchorHash(hash);
  if (fromHash !== null) return fromHash;
  if (state && typeof state === 'object' && 'chunkIndex' in state) {
    const fromState = Number((state as { chunkIndex: unknown }).chunkIndex);
    if (Number.isInteger(fromState) && fromState >= 0) return fromState;
  }
  return null;
}
