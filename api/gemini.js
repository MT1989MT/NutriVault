const { applyCors } = require('./_cors');
const { checkRateLimit } = require('./_ratelimit');

// Per-function config — ensures Vercel allows enough time for Gemini API calls
const config = { maxDuration: 30 };

async function handler(req, res) {
  const start = Date.now();

  try {
    if (applyCors(req, res)) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting (non-blocking — failure falls through)
    try {
      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const { limited, remaining } = await checkRateLimit(clientIp);
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      if (limited) {
        return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
      }
    } catch (_) {
      // Rate limiting failure should not block the request
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const { model, prompt, jsonMode, imageBase64 } = req.body || {};

    if (!model || !prompt) {
      return res.status(400).json({ error: 'Missing model or prompt' });
    }

    if (typeof prompt !== 'string' || prompt.length > 20_000) {
      return res.status(400).json({ error: 'Prompt too long' });
    }

    const allowedModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    if (!allowedModels.includes(model)) {
      return res.status(400).json({ error: 'Invalid model' });
    }

    // Build parts array
    const parts = [{
      text: jsonMode
        ? `You are a helpful assistant. Always respond with valid JSON only, no markdown code blocks, no explanation.\n\n${prompt}`
        : prompt
    }];

    if (imageBase64 && typeof imageBase64 === 'string') {
      if (imageBase64.length > 10_000_000) {
        return res.status(400).json({ error: 'Image too large (max 10MB)' });
      }
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match && allowedImageTypes.includes(match[1])) {
        parts.push({
          inline_data: { mime_type: match[1], data: match[2] }
        });
      }
    }

    // Call Gemini API with its own timeout to avoid Vercel function timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: jsonMode ? 0 : 0.7,
              // Disable thinking for JSON requests — saves ~2-5s latency
              ...(jsonMode ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            }
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] Gemini error:', response.status, errorText);
        const clientError = response.status === 429
          ? 'AI rate limit reached. Please wait a moment.'
          : 'AI service temporarily unavailable.';
        return res.status(response.status).json({ error: clientError });
      }

      const data = await response.json();
      const text = (data.candidates && data.candidates[0] && data.candidates[0].content
        && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
        && data.candidates[0].content.parts[0].text) || '';

      return res.status(200).json({ text, _ms: Date.now() - start });
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({ error: 'Gemini API timed out', _ms: Date.now() - start });
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('[API] Unhandled error:', error && error.message || error);
    return res.status(500).json({
      error: (error && error.message) || 'Internal server error',
      _ms: Date.now() - start
    });
  }
}

module.exports = handler;
module.exports.config = config;
