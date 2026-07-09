// Server-side entitlement check for gating paid resources (e.g. /api/gemini).
//
// Calls the Supabase `check-entitlement` edge function with the shared
// EDGE_FUNCTION_SECRET and caches POSITIVE results briefly in memory so we
// don't hit Supabase on every single AI request. Negative results are not
// cached (so a just-renewed code isn't locked out).
const { createLogger } = require('./_logger');

const log = createLogger('Entitlement');

// code(raw) -> expiry timestamp (ms) of the cached "entitled" verdict.
const positiveCache = new Map();
const POSITIVE_TTL_MS = 60_000; // re-check at most once per minute per code
const MAX_CACHE = 5000;

function cacheGet(code) {
  const until = positiveCache.get(code);
  if (until && Date.now() < until) return true;
  if (until) positiveCache.delete(code);
  return false;
}

function cacheSet(code) {
  if (positiveCache.size > MAX_CACHE) positiveCache.clear();
  positiveCache.set(code, Date.now() + POSITIVE_TTL_MS);
}

/**
 * Returns true if `code` maps to an active, non-expired subscription.
 * Fails CLOSED (false) when it can't confirm — callers gate a paid resource.
 */
async function isEntitled(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.replace(/\s/g, '');
  if (!clean) return false;
  if (cacheGet(clean)) return true;

  const supabaseUrl = process.env.SUPABASE_URL;
  const edgeSecret = process.env.EDGE_FUNCTION_SECRET;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !edgeSecret) {
    log.error('Entitlement check misconfigured (missing SUPABASE_URL / EDGE_FUNCTION_SECRET)');
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${supabaseUrl}/functions/v1/check-entitlement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-edge-secret': edgeSecret,
        ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({ code: clean }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data.ok === true) {
      cacheSet(clean);
      return true;
    }
    return false;
  } catch (err) {
    log.warn('Entitlement check failed', err);
    return false;
  }
}

module.exports = { isEntitled };
