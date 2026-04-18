const crypto = require('crypto');
const { applyCors } = require('./_cors');
const { checkRateLimit } = require('./_ratelimit');
const { createLogger } = require('./_logger');

const log = createLogger('Gemini');

// Per-function config — ensures Vercel allows enough time for Gemini API calls
const config = { maxDuration: 30 };

// Short-lived positive cache of verified activation codes to avoid a round-trip
// to Supabase on every Gemini request. Keyed by SHA-256 of the cleaned code.
const VERIFY_CACHE_TTL = 5 * 60 * 1000;
const VERIFY_CACHE_MAX = 2000;
const verifyCache = new Map();

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (_) {
    return false;
  }
}

function cacheGet(hash) {
  const entry = verifyCache.get(hash);
  if (!entry) return null;
  if (entry.validUntil <= Date.now() || entry.expiresAt <= Date.now()) {
    verifyCache.delete(hash);
    return null;
  }
  return entry;
}

function cacheSet(hash, expiresAt) {
  if (verifyCache.size >= VERIFY_CACHE_MAX) {
    const firstKey = verifyCache.keys().next().value;
    if (firstKey) verifyCache.delete(firstKey);
  }
  verifyCache.set(hash, {
    expiresAt,
    validUntil: Math.min(Date.now() + VERIFY_CACHE_TTL, expiresAt),
  });
}

/**
 * Verify the caller has a paid subscription.
 *
 * Accepts either:
 *   - `x-activation-code` header matching a non-expired row in
 *     `activation_codes` (checked via the existing verify-code Edge Function);
 *   - `x-test-mode-secret` header equal to the `TEST_MODE_SECRET` env var,
 *     which is an opt-in local-testing escape hatch that is only active when
 *     the env var is explicitly set (unset in production).
 */
async function authorizeCaller(req) {
  const testSecret = process.env.TEST_MODE_SECRET;
  const providedTestSecret = req.headers['x-test-mode-secret'];
  if (testSecret && providedTestSecret && safeEqual(String(providedTestSecret), testSecret)) {
    return { ok: true, testMode: true };
  }

  const rawCode = req.headers['x-activation-code'];
  if (!rawCode || typeof rawCode !== 'string') return { ok: false };
  const code = rawCode.replace(/\s/g, '');
  if (!code || code.length > 128) return { ok: false };

  const hash = sha256Hex(code);
  if (cacheGet(hash)) return { ok: true };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    log.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY for auth');
    return { ok: false };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/verify-code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) return { ok: false };
    const data = await response.json();
    if (!data || data.success !== true) return { ok: false };
    const expiry = Number(data.expiry);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return { ok: false };
    cacheSet(hash, expiry);
    return { ok: true };
  } catch (error) {
    log.error('verify-code request failed', error);
    return { ok: false };
  }
}

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

    // Require a valid activation code (or test-mode secret). Without this the
    // Gemini API key is effectively public and anyone can consume the quota.
    const auth = await authorizeCaller(req);
    if (!auth.ok) {
      return res.status(401).json({ error: 'Unauthorized. Valid activation code required.' });
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
        log.error(`Gemini API ${response.status}`, errorText);
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
    log.error('Unhandled error', error);
    return res.status(500).json({
      error: (error && error.message) || 'Internal server error',
      _ms: Date.now() - start
    });
  }
}

module.exports = handler;
module.exports.config = config;
