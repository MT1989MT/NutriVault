/**
 * Server-side logger for Vercel API functions.
 *
 * Structured JSON logging for machine-parseable output in Vercel's log drain.
 * - Consistent format: { level, module, msg, ts, ...extra }
 * - Automatically strips sensitive data (Bearer tokens, API keys, long base64)
 * - Error objects are safely serialized (message only, no stack in production)
 * - Minimal overhead — no external dependencies
 */

const IS_DEV = process.env.NODE_ENV !== 'production';

/** Strip tokens, keys, and long base64 from strings */
function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/Bearer\s+[A-Za-z0-9._\-/+]{8,}/g, 'Bearer [redacted]')
    .replace(/key=[A-Za-z0-9._\-]{10,}/g, 'key=[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g, '[jwt-redacted]')
    .replace(/[A-Za-z0-9+/]{60,}={0,2}/g, '[base64-redacted]')
    .slice(0, 500);
}

/** Safely extract a loggable string from an error-like value */
function fmtErr(err) {
  if (!err) return undefined;
  if (err instanceof Error) return sanitize(err.message);
  if (typeof err === 'string') return sanitize(err);
  try { return sanitize(JSON.stringify(err).slice(0, 300)); } catch { return '[unserializable]'; }
}

function createLogger(module) {
  function emit(level, msg, data) {
    const entry = { level, module, msg, ts: new Date().toISOString() };
    if (data !== undefined) entry.detail = fmtErr(data);

    // Use structured JSON for production (Vercel log drain friendly)
    // Use readable format for dev
    if (IS_DEV) {
      const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      const detail = entry.detail ? ` | ${entry.detail}` : '';
      console[fn](`[${level.toUpperCase()}][${module}] ${msg}${detail}`);
    } else {
      // In production, only emit warn+ to reduce log volume and cost
      if (level === 'debug' || level === 'info') return;
      const fn = level === 'error' ? 'error' : 'warn';
      console[fn](JSON.stringify(entry));
    }
  }

  return {
    debug: (msg, data) => emit('debug', msg, data),
    info:  (msg, data) => emit('info',  msg, data),
    warn:  (msg, data) => emit('warn',  msg, data),
    error: (msg, data) => emit('error', msg, data),
  };
}

module.exports = { createLogger };
