type Entry = { value: unknown; expiresAt: number };

/**
 * Upper bound on cached keys. The list key contains the query (cursor
 * included), so a public caller can mint unbounded entries; evicting expired
 * ones and then the oldest keeps memory flat.
 */
const MAX_ENTRIES = 500;

const entries = new Map<string, Entry>();
/** One upstream load per key, so an expiry burst does not stampede Shows. */
const pending = new Map<string, Promise<unknown>>();

export function clearShowsCache(): void {
  entries.clear();
  pending.clear();
}

/**
 * Serve a value from memory for `ttlMs`.
 *
 * `now` is a parameter rather than `Date.now` so tests can move the clock
 * without sleeping. A failed load is never cached.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  now: () => number,
  load: () => Promise<T>
): Promise<T> {
  const current = now();
  const hit = entries.get(key);

  if (hit && hit.expiresAt > current) {
    return Promise.resolve(hit.value as T);
  }

  const inflight = pending.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const promise = load()
    .then((value) => {
      if (entries.size >= MAX_ENTRIES) {
        prune(current);
      }
      entries.set(key, { value, expiresAt: now() + ttlMs });
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

function prune(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }

  for (const key of entries.keys()) {
    if (entries.size < MAX_ENTRIES) {
      break;
    }
    entries.delete(key);
  }
}
