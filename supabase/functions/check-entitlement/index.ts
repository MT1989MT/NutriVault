// Supabase Edge Function: check-entitlement
// Validates that an activation code exists, is active, and has a non-expired
// subscription. Called SERVER-TO-SERVER by the Vercel API routes (never by the
// browser) using the shared EDGE_FUNCTION_SECRET, so it has NO per-IP rate
// limit — that would trip on Vercel's shared egress IPs. Its only job is to let
// the Gemini proxy gate the (costly) AI resource behind a paying subscriber.
// Deploy: supabase functions deploy check-entitlement

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const log = {
  _emit(level: string, msg: string, detail?: unknown) {
    const entry: Record<string, unknown> = { level, fn: 'check-entitlement', msg, ts: new Date().toISOString() };
    if (detail !== undefined) {
      entry.detail = detail instanceof Error ? detail.message : String(detail).slice(0, 300);
    }
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
  },
  error: (msg: string, d?: unknown) => log._emit('error', msg, d),
};

async function hashCode(code: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  // No CORS: this endpoint is only ever called server-to-server, not from a browser.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 })
  }

  // Require the shared server secret — same gate as create-code / extend.
  const secret = req.headers.get('x-edge-secret') ?? ''
  const expectedSecret = Deno.env.get('EDGE_FUNCTION_SECRET') ?? ''
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'Missing code' }), { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const hash = await hashCode(code.replace(/\s/g, ''))
    const { data: results, error } = await supabase
      .from('activation_codes')
      .select('expires_at')
      .eq('code_hash', hash)
      .eq('is_active', true)
      .limit(1)

    if (error) {
      log.error('DB query failed', error)
      return new Response(JSON.stringify({ ok: false, error: 'lookup_failed' }), { status: 500 })
    }

    const entitled = !!(results && results.length > 0 && new Date(results[0].expires_at).getTime() > Date.now())
    return new Response(
      JSON.stringify({ ok: entitled }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    log.error('check-entitlement failed', error)
    return new Response(JSON.stringify({ ok: false, error: 'internal' }), { status: 500 })
  }
})
