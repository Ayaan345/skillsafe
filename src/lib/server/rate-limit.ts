export interface LimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}

export interface LimiterDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Per-instance fixed window. On serverless this is a first line of defence, not a
 * global guarantee; a shared store (Upstash) replaces it when accounts arrive.
 */
export function createLimiter(options: LimiterOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = options.maxKeys ?? 5000;

  return {
    check(key: string, now: number = Date.now()): LimiterDecision {
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        if (hits.size >= maxKeys) hits.clear();
        hits.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
      }
      if (entry.count >= options.limit) {
        return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
      }
      entry.count += 1;
      return { allowed: true, remaining: options.limit - entry.count, retryAfterMs: 0 };
    },
    reset(): void {
      hits.clear();
    },
  };
}
