const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after every earlier task with the same `key` has finished, so
 * two requests for the same key cannot interleave their reads and writes.
 *
 * Process-local: it serialises requests inside one server instance. A second
 * instance would need a database-level guard as well.
 */
export async function withKeyedLock<T>(
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) {
      tails.delete(key);
    }
  }
}
