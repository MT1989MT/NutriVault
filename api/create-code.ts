import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const edgeSecret = process.env.EDGE_FUNCTION_SECRET;

  if (!supabaseUrl || !supabaseAnonKey || !edgeSecret) {
    console.error('[API] Missing SUPABASE_URL, SUPABASE_ANON_KEY, or EDGE_FUNCTION_SECRET');
    return res.status(500).json({ error: 'Server configuration error' });
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
      return res.status(response.status).json({ error: data.error || 'Failed to create code' });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[API] create-code proxy error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
