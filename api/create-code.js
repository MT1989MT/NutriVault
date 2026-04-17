const { applyCors } = require('./_cors');
const { createLogger } = require('./_logger');

const log = createLogger('CreateCode');

const ENTITLEMENT_ID = 'NutriVault';

/**
 * Verify via the RevenueCat REST API that the given app_user_id currently
 * holds an active NutriVault entitlement. Returns true only when the
 * server-authoritative subscriber record includes a non-expired entitlement.
 */
async function hasActiveEntitlement(appUserId, rcSecretKey) {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${rcSecretKey}`,
      'Content-Type': 'application/json',
      'X-Platform': 'server',
    },
  });

  if (!response.ok) {
    log.warn(`RevenueCat subscriber lookup failed: ${response.status}`);
    return false;
  }

  const data = await response.json();
  const entitlement = data && data.subscriber && data.subscriber.entitlements
    ? data.subscriber.entitlements[ENTITLEMENT_ID]
    : null;
  if (!entitlement || !entitlement.expires_date) return false;

  const expiresMs = Date.parse(entitlement.expires_date);
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const edgeSecret = process.env.EDGE_FUNCTION_SECRET;
  const rcSecretKey = process.env.REVENUECAT_SECRET_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !edgeSecret || !rcSecretKey) {
    log.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, EDGE_FUNCTION_SECRET, or REVENUECAT_SECRET_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const body = req.body || {};
  const appUserId = typeof body.appUserId === 'string' ? body.appUserId.trim() : '';

  // RevenueCat anonymous IDs are prefixed `$RCAnonymousID:` followed by a hex UUID,
  // and named IDs are at most 255 chars. Reject anything that can't be a valid ID.
  if (!appUserId || appUserId.length > 255 || !/^[\w$:.\-]+$/.test(appUserId)) {
    return res.status(400).json({ error: 'Missing or invalid appUserId' });
  }

  let entitled = false;
  try {
    entitled = await hasActiveEntitlement(appUserId, rcSecretKey);
  } catch (error) {
    log.error('RevenueCat verification error', error);
    return res.status(502).json({ error: 'Subscription verification failed' });
  }

  if (!entitled) {
    return res.status(402).json({ error: 'No active subscription found' });
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
