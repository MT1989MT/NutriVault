const { timingSafeEqual } = require('crypto');

/** Constant-time string comparison to prevent timing attacks */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function callEdgeFunction(supabaseUrl, supabaseAnonKey, edgeSecret, functionName, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'x-edge-secret': edgeSecret,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function ${functionName} failed: ${response.status} ${text}`);
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Webhook] REVENUECAT_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (!safeEqual(authHeader, `Bearer ${webhookSecret}`)) {
    console.error('[Webhook] Invalid authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const edgeSecret = process.env.EDGE_FUNCTION_SECRET;

  if (!supabaseUrl || !supabaseAnonKey || !edgeSecret) {
    console.error('[Webhook] Missing server configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { event } = req.body;
    if (!event) {
      return res.status(400).json({ error: 'Missing event data' });
    }

    const eventType = event.type;
    const subscriberAttributes = event.subscriber_attributes || {};
    const activationCode = subscriberAttributes.activation_code && subscriberAttributes.activation_code.value;

    console.log(`[Webhook] Event: ${eventType}, has code: ${!!activationCode}`);

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'NON_RENEWING_PURCHASE': {
        if (activationCode) {
          await callEdgeFunction(supabaseUrl, supabaseAnonKey, edgeSecret, 'extend-subscription', {
            code: activationCode,
            months: 1,
          });
          console.log('[Webhook] Extended code for initial purchase');
        }
        break;
      }

      case 'RENEWAL': {
        if (activationCode) {
          await callEdgeFunction(supabaseUrl, supabaseAnonKey, edgeSecret, 'extend-subscription', {
            code: activationCode,
            months: 1,
          });
          console.log('[Webhook] Extended code for renewal');
        } else {
          console.warn('[Webhook] Renewal without activation_code attribute');
        }
        break;
      }

      case 'EXPIRATION': {
        console.log('[Webhook] Subscription expired');
        break;
      }

      case 'CANCELLATION': {
        console.log('[Webhook] Subscription cancelled (still active until period end)');
        break;
      }

      default: {
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error:', error.message);
    return res.status(500).json({ error: 'Processing failed, will retry' });
  }
};
