import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * RevenueCat Webhook Handler
 *
 * RevenueCat sends webhooks when subscription events occur:
 * - INITIAL_PURCHASE: New subscription → create activation code
 * - RENEWAL: Subscription renewed → extend expiry
 * - CANCELLATION: Subscription cancelled (user still has access until expiry)
 * - EXPIRATION: Subscription expired → deactivate code
 *
 * Setup in RevenueCat Dashboard:
 * 1. Go to Project Settings → Integrations → Webhooks
 * 2. URL: https://your-domain.vercel.app/api/revenuecat-webhook
 * 3. Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    // Webhooks don't need CORS, but handle gracefully
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook authenticity
  const authHeader = req.headers.authorization;
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Webhook] REVENUECAT_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (authHeader !== `Bearer ${webhookSecret}`) {
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
    const activationCode = subscriberAttributes.activation_code?.value;

    console.log(`[Webhook] Event: ${eventType}, has code: ${!!activationCode}`);

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'NON_RENEWING_PURCHASE': {
        // New purchase - the app creates the code client-side after payment
        // This webhook confirms the purchase is valid
        // If the client already created a code and set it as attribute, extend it
        if (activationCode) {
          await callEdgeFunction(supabaseUrl, supabaseAnonKey, edgeSecret, 'extend-subscription', {
            code: activationCode,
            months: 1,
          });
          console.log(`[Webhook] Extended code for initial purchase`);
        }
        break;
      }

      case 'RENEWAL': {
        // Subscription renewed - extend the linked activation code
        if (activationCode) {
          await callEdgeFunction(supabaseUrl, supabaseAnonKey, edgeSecret, 'extend-subscription', {
            code: activationCode,
            months: 1,
          });
          console.log(`[Webhook] Extended code for renewal`);
        } else {
          console.warn('[Webhook] Renewal without activation_code attribute');
        }
        break;
      }

      case 'EXPIRATION': {
        // Subscription expired - code will naturally expire via expires_at
        // No action needed, the verify-code function checks expiry
        console.log(`[Webhook] Subscription expired`);
        break;
      }

      case 'CANCELLATION': {
        // User cancelled but still has access until period ends
        // No action needed
        console.log(`[Webhook] Subscription cancelled (still active until period end)`);
        break;
      }

      default: {
        // Other events (BILLING_ISSUE, PRODUCT_CHANGE, etc.)
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[Webhook] Error:', error.message);
    // Return 200 to prevent RevenueCat from retrying indefinitely
    // Log the error for investigation
    return res.status(200).json({ success: false, error: 'Processing error logged' });
  }
}

async function callEdgeFunction(
  supabaseUrl: string,
  supabaseAnonKey: string,
  edgeSecret: string,
  functionName: string,
  body: Record<string, unknown>
) {
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
