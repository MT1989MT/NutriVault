import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

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
      return res.status(response.status).json({ error: data.error || 'Failed to extend subscription' });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[API] extend-subscription proxy error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
