import type { VercelRequest, VercelResponse } from '@vercel/node';

// CORS origin whitelist (same as gemini.ts)
const ALLOWED_ORIGINS = [
  'https://nutrivault-seven.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'capacitor://localhost',
  'ionic://localhost',
  ...(process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || []),
];

function getAllowedOrigin(origin: string): string | null {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https:\/\/nutrivault(-[a-z0-9]+)*\.vercel\.app$/.test(origin)) return origin;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || '';
  const allowed = getAllowedOrigin(origin);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'capacitor://localhost');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
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
