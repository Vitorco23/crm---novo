export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry(
  operation: () => Promise<void>,
  options: RetryOptions = {},
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError;
}

/**
 * Serializes cloud operations per user/key scope. A failure does not poison
 * later operations for that scope, and unrelated scopes continue in parallel.
 */
export class ScopedWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue(scope: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.tails.get(scope) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.tails.set(scope, current);

    void current.finally(() => {
      if (this.tails.get(scope) === current) this.tails.delete(scope);
    }).catch(() => undefined);

    return current;
  }

  hasPending(scope: string): boolean {
    return this.tails.has(scope);
  }
}
