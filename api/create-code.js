const { applyCors } = require('./_cors');
const { limit } = require('./_ratelimit');
const { createLogger } = require('./_logger');

const log = createLogger('CreateCode');

// Optional receipt gate. When "true", a code is only minted after a valid
// RevenueCat purchase is confirmed for the customer (prevents anyone from
// curl-minting free 30-day codes). Requires REVENUECAT_SECRET_KEY. Default off
// so the current flow keeps working until you wire up receipt validation.
const REQUIRE_RECEIPT = process.env.REQUIRE_PURCHASE_RECEIPT === 'true';

// Verify the RevenueCat customer has the "premium" entitlement active.
async function hasActiveEntitlement(appUserId) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key || !appUserId) return false;
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const ent = data?.subscriber?.entitlements?.premium;
    return !!(ent && (!ent.expires_date || new Date(ent.expires_date).getTime() > Date.now()));
  } catch (err) {
    log.warn('RevenueCat entitlement check failed', err);
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit code creation per IP so the activation_codes table can't be
  // spammed unboundedly (5 codes/hour/IP).
  try {
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const { limited } = await limit(`create-code:${clientIp}`, 5, 60 * 60_000);
    if (limited) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  } catch (_) { /* limiter failure must not block a legitimate purchase */ }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const edgeSecret = process.env.EDGE_FUNCTION_SECRET;

  if (!supabaseUrl || !supabaseAnonKey || !edgeSecret) {
    log.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or EDGE_FUNCTION_SECRET');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Receipt gate (optional): only mint after a confirmed purchase.
  if (REQUIRE_RECEIPT) {
    const appUserId = (req.body && req.body.appUserId) || '';
    if (!(await hasActiveEntitlement(appUserId))) {
      return res.status(402).json({ error: 'No active purchase found for this account.' });
    }
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'x-edge-secret': edgeSecret,
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      log.warn(`Edge function returned ${response.status}`, data.error);
      return res.status(response.status).json({ error: data.error || 'Failed to create code' });
    }

    return res.status(200).json(data);
  } catch (error) {
    log.error('create-code proxy error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
