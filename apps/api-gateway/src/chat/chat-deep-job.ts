import type { RedisService } from '../core/redis.service';

export type DeepJobState = {
  query: string;
  done: number;
  total: number;
};

const DEEP_JOB_TTL_SECONDS = 86_400;

export function deepJobKey(conversationId: string): string {
  return `chat:deep:${conversationId}`;
}

export async function setDeepJob(
  redis: RedisService,
  conversationId: string,
  state: DeepJobState,
): Promise<void> {
  await redis.setex(
    deepJobKey(conversationId),
    DEEP_JOB_TTL_SECONDS,
    JSON.stringify(state),
  );
}

export async function getDeepJob(
  redis: RedisService,
  conversationId: string,
): Promise<DeepJobState | null> {
  const raw = await redis.get(deepJobKey(conversationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeepJobState;
    if (!parsed?.query || typeof parsed.done !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearDeepJob(
  redis: RedisService,
  conversationId: string,
): Promise<void> {
  await redis.del(deepJobKey(conversationId));
}
