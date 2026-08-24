export function formatSimilarityPercent(similarity: number): string {
  if (!Number.isFinite(similarity)) return '—';
  const pct = similarity <= 1 ? similarity * 100 : similarity;
  return `${pct.toFixed(1)}%`;
}
