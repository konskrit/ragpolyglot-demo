/** Format milliseconds; use seconds when >= 1000. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';

  if (ms >= 1000) {
    const seconds = ms / 1000;
    const rounded =
      seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10;
    return `${rounded}s`;
  }

  return `${Math.round(ms)}ms`;
}
