const { checkRateLimit } = require('./_ratelimit');

module.exports = async function handler(req, res) {
  // Debug diagnostics expose environment/config details — gate behind an explicit
  // opt-in so this never runs on production deployments by default.
  if (process.env.ENABLE_DEBUG_ENDPOINTS !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  const checks = {};

  checks.nodeVersion = process.version;
  checks.fetchAvailable = typeof fetch === 'function' ? 'yes' : 'NO — fetch is undefined (need Node 18+)';

  const apiKey = process.env.GEMINI_API_KEY;
  checks.apiKeySet = apiKey ? `yes (${apiKey.substring(0, 8)}...)` : 'NO — GEMINI_API_KEY not set';

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
        const text = (data.candidates && data.candidates[0] && data.candidates[0].content
          && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
          && data.candidates[0].content.parts[0].text) || '(empty)';
        checks.geminiApi = `OK — responded: "${text.trim()}"`;
      } else {
        const errorText = await geminiRes.text();
        checks.geminiApi = `FAILED — status ${geminiRes.status}: ${errorText.substring(0, 300)}`;
      }
    } catch (err) {
      checks.geminiApi = `ERROR — ${err.message}`;
    }
  } else {
    checks.geminiApi = 'skipped (missing key or fetch)';
  }

  try {
    const result = await checkRateLimit('debug-test');
    checks.rateLimit = `OK — remaining: ${result.remaining}`;
  } catch (err) {
    checks.rateLimit = `ERROR — ${err.message}`;
  }

  return res.status(200).json({
    status: 'debug',
    timestamp: new Date().toISOString(),
    checks
  });
};
