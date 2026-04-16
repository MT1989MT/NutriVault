const { applyCors } = require('./_cors');
const { createLogger } = require('./_logger');

const log = createLogger('ExtendSub');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const edgeSecret = process.env.EDGE_FUNCTION_SECRET;

  if (!supabaseUrl || !supabaseAnonKey || !edgeSecret) {
    log.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or EDGE_FUNCTION_SECRET');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { code, months } = req.body;

    if (!code || !months || typeof months !== 'number' || months < 1 || months > 12) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/extend-subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'x-edge-secret': edgeSecret,
      },
      body: JSON.stringify({ code, months }),
    });

    const data = await response.json();

    if (!response.ok) {
      log.warn(`Edge function returned ${response.status}`, data.error);
      return res.status(response.status).json({ error: data.error || 'Failed to extend subscription' });
    }

    return res.status(200).json(data);
  } catch (error) {
    log.error('extend-subscription proxy error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
