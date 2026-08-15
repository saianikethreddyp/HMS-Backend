type Entry = { value: unknown; expiresAt: number };

// Single-process in-memory TTL cache for hot read paths (card search/list,
// report summary). Never used on the atomic quota transaction path — that
// stays fully live per the architecture's atomicity/idempotency rules.
const store = new Map<string, Entry>();

export async function getOrSet<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const value = await load();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
