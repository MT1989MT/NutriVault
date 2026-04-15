import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Distributed rate limiter using Upstash Redis
// Falls back to in-memory if UPSTASH env vars are not set

let ratelimit: Ratelimit | null = null;

// In-memory fallback for when Redis is not configured
const memoryMap = new Map<string, { count: number; resetAt: number }>();

function getOrCreateRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(30, '60 s'), // 30 requests per 60 seconds
    analytics: false,
    prefix: 'nutrivault:ratelimit',
  });

  return ratelimit;
}

function memoryRateLimit(ip: string): { limited: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 30;
  const entry = memoryMap.get(ip);

  if (!entry || now > entry.resetAt) {
    memoryMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxRequests - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { limited: entry.count > maxRequests, remaining };
}

/**
 * Check if the given IP is rate limited.
 * Uses Upstash Redis if configured, otherwise falls back to in-memory.
 * Returns { limited, remaining }.
 */
export async function checkRateLimit(ip: string): Promise<{ limited: boolean; remaining: number }> {
  const rl = getOrCreateRatelimit();

  if (!rl) {
    // Fallback to in-memory rate limiting
    return memoryRateLimit(ip);
  }

  try {
    const result = await rl.limit(ip);
    return { limited: !result.success, remaining: result.remaining };
  } catch {
    // Redis unreachable — fall back to memory
    return memoryRateLimit(ip);
  }
}
