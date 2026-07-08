const ALLOWED_ORIGINS = [
  'https://nutri-vault-two.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'capacitor://localhost',
  'ionic://localhost',
];

/**
 * Set CORS headers on the response. Returns true if this was a preflight
 * OPTIONS request (caller should end the response in that case).
 */
function applyCors(req, res) {
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allAllowed = [...ALLOWED_ORIGINS, ...extraOrigins];
  const origin = req.headers.origin || '';

  // Only this project's production domain and its Vercel preview deployments
  // (nutri-vault-two-<git-branch|hash>.vercel.app). The old pattern matched any
  // "nutri-vault-*.vercel.app", so anyone could register nutri-vault-evil.vercel.app
  // and get a credentialed allowed origin.
  const isAllowed = allAllowed.includes(origin)
    || /^https:\/\/nutri-vault-two(-[a-z0-9-]+)?\.vercel\.app$/.test(origin);

  // Vary on Origin so shared/CDN caches never serve one origin's ACAO to another.
  res.setHeader('Vary', 'Origin');

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Native (Capacitor) requests send no Origin header.
    res.setHeader('Access-Control-Allow-Origin', 'capacitor://localhost');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = { applyCors };
