// Distributed rate limiter using Upstash Redis
// Falls back to in-memory if @upstash packages are unavailable or Redis is not configured

// Lazy-loaded to prevent module import crashes from breaking the entire API handler
let ratelimitModule: any = null;
let redisModule: any = null;
let ratelimit: any = null;
let modulesLoaded = false;

// In-memory fallback for when Redis is not configured or packages unavailable
const memoryMap = new Map<string, { count: number; resetAt: number }>();

async function loadModules(): Promise<boolean> {
  if (modulesLoaded) return ratelimitModule !== null;

  try {
    ratelimitModule = await import('@upstash/ratelimit');
    redisModule = await import('@upstash/redis');
    modulesLoaded = true;
    return true;
  } catch {
    modulesLoaded = true;
    return false;
  }
}

async function getOrCreateRatelimit(): Promise<any> {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  const loaded = await loadModules();
  if (!loaded) return null;

  try {
    const redis = new redisModule.Redis({ url, token });
    ratelimit = new ratelimitModule.Ratelimit({
      redis,
      limiter: ratelimitModule.Ratelimit.slidingWindow(30, '60 s'),
      analytics: false,
      prefix: 'nutrivault:ratelimit',
    });
    return ratelimit;
  } catch {
    return null;
  }
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
  try {
    const rl = await getOrCreateRatelimit();

    if (!rl) {
      return memoryRateLimit(ip);
    }

    const result = await rl.limit(ip);
    return { limited: !result.success, remaining: result.remaining };
  } catch {
    // Any failure — fall back to memory
    return memoryRateLimit(ip);
  }
}
