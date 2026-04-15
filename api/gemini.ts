import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors';
import { checkRateLimit } from './_ratelimit';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Distributed rate limiting (Upstash Redis with in-memory fallback)
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
  const { limited, remaining } = await checkRateLimit(clientIp);
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  if (limited) {
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
    // Food parsing prompt with reference data is ~6100 chars; coach with user context can be larger
    if (typeof prompt !== 'string' || prompt.length > 20_000) {
      return res.status(400).json({ error: 'Prompt too long' });
    }

    // Validate model name
    const allowedModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    if (!allowedModels.includes(model)) {
      return res.status(400).json({ error: 'Invalid model' });
    }

    // Build parts array - supports text-only or text+image (multimodal)
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [{
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
            temperature: jsonMode ? 0 : 0.7,
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
