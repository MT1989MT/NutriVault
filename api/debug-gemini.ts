import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './_ratelimit';

/**
 * Diagnostic endpoint — visit /api/debug-gemini in the browser to see what's working.
 * Tests: Node.js version, fetch availability, API key, Gemini API connectivity.
 * DELETE THIS FILE before going to production.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const checks: Record<string, string> = {};

  // 1. Node.js version
  checks.nodeVersion = process.version;

  // 2. fetch availability
  checks.fetchAvailable = typeof fetch === 'function' ? 'yes' : 'NO — fetch is undefined (need Node 18+)';

  // 3. API key configured
  const apiKey = process.env.GEMINI_API_KEY;
  checks.apiKeySet = apiKey ? `yes (${apiKey.substring(0, 8)}...)` : 'NO — GEMINI_API_KEY not set';

  // 4. Test Gemini API with a minimal request
  if (apiKey && typeof fetch === 'function') {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with just the word "ok"' }] }],
            generationConfig: { maxOutputTokens: 10, temperature: 0 }
          })
        }
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '(empty)';
        checks.geminiApi = `OK — responded: "${text.trim()}"`;
      } else {
        const errorText = await geminiRes.text();
        checks.geminiApi = `FAILED — status ${geminiRes.status}: ${errorText.substring(0, 300)}`;
      }
    } catch (err: any) {
      checks.geminiApi = `ERROR — ${err.message}`;
    }
  } else {
    checks.geminiApi = 'skipped (missing key or fetch)';
  }

  // 5. Rate limit module
  try {
    const result = await checkRateLimit('debug-test');
    checks.rateLimit = `OK — remaining: ${result.remaining}`;
  } catch (err: any) {
    checks.rateLimit = `ERROR — ${err.message}`;
  }

  return res.status(200).json({
    status: 'debug',
    timestamp: new Date().toISOString(),
    checks
  });
}
