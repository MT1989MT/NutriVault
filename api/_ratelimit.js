// Rate limiter for Vercel serverless functions.
//
// Two backends:
//  - Upstash Redis (durable, shared across instances) when UPSTASH_REDIS_REST_URL
//    and UPSTASH_REDIS_REST_TOKEN are set.
//  - In-memory fallback otherwise. This resets on cold starts and is per-instance,
//    so it only blunts single-instance bursts — set up Upstash for real limiting.

const { createLogger } = require('./_logger');
const log = createLogger('RateLimit');

const memoryMap = new Map();
let lastSweep = 0;

function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, entry] of memoryMap) {
    if (now > entry.resetAt) memoryMap.delete(k);
  }
}

function memoryLimit(key, max, windowMs) {
  const now = Date.now();
  sweep(now);
  const entry = memoryMap.get(key);
  if (!entry || now > entry.resetAt) {
    memoryMap.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: max - 1 };
  }
  entry.count++;
  return { limited: entry.count > max, remaining: Math.max(0, max - entry.count) };
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashEnabled = !!(UPSTASH_URL && UPSTASH_TOKEN);

// Fixed-window counter in Redis: INCR the key, and on the first hit set an
// expiry equal to the window. Uses the Upstash REST pipeline (one round-trip).
async function upstashLimit(key, max, windowMs) {
  const redisKey = `rl:${key}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, String(windowMs), 'NX'],
      ]),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const results = await res.json();
    const count = Array.isArray(results) ? Number(results[0]?.result ?? 0) : 0;
    return { limited: count > max, remaining: Math.max(0, max - count) };
  } catch (err) {
    clearTimeout(timeout);
    // Fail OPEN to a memory check so a Redis blip never takes the API down.
    log.warn('Upstash rate limit failed, falling back to memory', err);
    return memoryLimit(key, max, windowMs);
  }
}

/**
 * Generic keyed limiter.
 * @param {string} key   Unique bucket key (e.g. `gemini:<ip>` or `code:<hash>`).
 * @param {number} max   Max requests per window.
 * @param {number} windowMs  Window length in ms.
 */
async function limit(key, max = 30, windowMs = 60_000) {
  if (upstashEnabled) return upstashLimit(key, max, windowMs);
  return memoryLimit(key, max, windowMs);
}

// Backwards-compatible helper: 30 req/min per IP for the Gemini endpoint.
async function checkRateLimit(ip) {
  return limit(`gemini:${ip}`, 30, 60_000);
}

module.exports = { checkRateLimit, limit, upstashEnabled };
