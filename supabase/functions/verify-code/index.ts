// Supabase Edge Function: verify-code
// Verifies an activation code and returns account info
// Deploy: supabase functions deploy verify-code

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Structured logger — JSON output for Supabase log drain
const log = {
  _emit(level: string, msg: string, detail?: unknown) {
    const entry: Record<string, unknown> = { level, fn: 'verify-code', msg, ts: new Date().toISOString() };
    if (detail !== undefined) {
      entry.detail = detail instanceof Error ? detail.message : typeof detail === 'string' ? detail.slice(0, 300) : String(detail).slice(0, 300);
    }
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(entry));
  },
  info:  (msg: string, d?: unknown) => log._emit('info', msg, d),
  warn:  (msg: string, d?: unknown) => log._emit('warn', msg, d),
  error: (msg: string, d?: unknown) => log._emit('error', msg, d),
};

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://nutri-vault-two.vercel.app',
  'capacitor://localhost',     // iOS Capacitor
  'http://localhost',          // Android Capacitor
  'http://localhost:5173',     // Vite dev server
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/nutri-vault(-[a-z0-9]+)*\.vercel\.app$/.test(origin)
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

async function hashCode(code: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Brute-force protection: limit verification attempts per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 5 // max 5 attempts per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Rate limit by IP to prevent brute-force code guessing
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many attempts. Please wait.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { code } = await req.json()

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const cleanCode = code.replace(/\s/g, '')
    const hash = await hashCode(cleanCode)

    const { data: results, error } = await supabase
      .from('activation_codes')
      .select('display_name, expires_at')
      .eq('code_hash', hash)
      .eq('is_active', true)
      .limit(1)

    if (error) {
      log.error('DB query failed', error)
      throw new Error('Verification failed')
    }

    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({ success: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const account = results[0]
    const expiryDate = new Date(account.expires_at).getTime()

    if (Date.now() > expiryDate) {
      return new Response(
        JSON.stringify({ success: false, error: 'Subscription expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        expiry: expiryDate,
        name: account.display_name,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    log.error('Verification failed', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Verification failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
