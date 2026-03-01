import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS - allow known origins + Capacitor (which may send no origin)
  const allowedOrigins = [
    'https://nutri-vault.vercel.app',
    'https://nutri-vault-ehct2xqn3-mts-projects-8071bc81.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'capacitor://localhost',
    'ionic://localhost'
  ];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin) || origin.includes('nutri-vault') && origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Capacitor iOS WKWebView does not send origin header — allow but restrict methods
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

  // Rate limiting
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('[API] GEMINI_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { model, prompt, jsonMode, imageBase64 } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: 'Missing model or prompt' });
    }

    // Validate prompt length to prevent abuse
    if (typeof prompt !== 'string' || prompt.length > 5000) {
      return res.status(400).json({ error: 'Prompt too long (max 5000 chars)' });
    }

    // Validate model name
    const allowedModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    if (!allowedModels.includes(model)) {
      return res.status(400).json({ error: 'Invalid model' });
    }

    // Build parts array - supports text-only or text+image (multimodal)
    const parts: any[] = [{
      text: jsonMode
        ? `You are a helpful assistant. Always respond with valid JSON only, no markdown code blocks, no explanation.\n\n${prompt}`
        : prompt
    }];

    if (imageBase64 && typeof imageBase64 === 'string') {
      // Validate image size (max 10MB base64 ≈ 7.5MB raw)
      if (imageBase64.length > 10_000_000) {
        return res.status(400).json({ error: 'Image too large (max 10MB)' });
      }
      // Extract mime type and data from base64 data URL
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match && allowedImageTypes.includes(match[1])) {
        parts.push({
          inline_data: {
            mime_type: match[1],
            data: match[2]
          }
        });
      }
    }

    // Call Gemini API directly via REST
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts
          }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: jsonMode ? 0.1 : 0.7,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] Gemini API error:', response.status, errorText);
      const clientError = response.status === 429 ? 'AI rate limit reached. Please wait a moment.' : 'AI service temporarily unavailable.';
      return res.status(response.status).json({ error: clientError });
    }

    const data = await response.json();

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({ text });
  } catch (error: any) {
    console.error('[API] Error:', error.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
