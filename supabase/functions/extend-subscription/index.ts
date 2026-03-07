// Supabase Edge Function: extend-subscription
// Extends subscription by adding months to expiry date
// Deploy: supabase functions deploy extend-subscription

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://nutrivault-seven.vercel.app',
  'capacitor://localhost',     // iOS Capacitor
  'http://localhost',          // Android Capacitor
  'http://localhost:5173',     // Vite dev server
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-secret',
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Require server-side secret to prevent public abuse
    const secret = req.headers.get('x-edge-secret') ?? ''
    const expectedSecret = Deno.env.get('EDGE_FUNCTION_SECRET') ?? ''
    if (!expectedSecret || secret !== expectedSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { code, months } = await req.json()

    if (!code || !months || typeof months !== 'number' || months < 1 || months > 12) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid parameters' }),
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
      .select('id, expires_at')
      .eq('code_hash', hash)
      .limit(1)

    if (error) {
      console.error('extend-subscription DB error:', error.message)
      throw new Error('Extension failed')
    }

    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Code not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const account = results[0]
    const currentExpiry = Math.max(Date.now(), new Date(account.expires_at).getTime())
    const newExpiry = new Date(currentExpiry + months * 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error: updateError } = await supabase
      .from('activation_codes')
      .update({ expires_at: newExpiry, is_active: true })
      .eq('id', account.id)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true, newExpiry }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('extend-subscription error:', error instanceof Error ? error.message : error)
    return new Response(
      JSON.stringify({ success: false, error: 'Extension failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
