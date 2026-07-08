// Simple in-memory rate limiter for Vercel serverless functions
// No external dependencies — works reliably on all plans

// NOTE: This is per-serverless-instance memory. It resets on cold starts and is
// not shared across concurrent instances, so it only blunts single-instance
// bursts. For durable, cross-instance limiting move this to Upstash/Vercel KV.
const memoryMap = new Map();
let lastSweep = 0;

// Drop expired entries periodically so the map can't grow unbounded over the
// lifetime of a warm instance (previously never evicted).
function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [ip, entry] of memoryMap) {
    if (now > entry.resetAt) memoryMap.delete(ip);
  }
}

async function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 30;
  sweep(now);
  const entry = memoryMap.get(ip);

  if (!entry || now > entry.resetAt) {
    memoryMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxRequests - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { limited: entry.count > maxRequests, remaining };
}

module.exports = { checkRateLimit };
