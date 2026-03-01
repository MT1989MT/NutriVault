// Supabase Edge Function: extend-subscription
// Extends subscription by adding months to expiry date
// Deploy: supabase functions deploy extend-subscription

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hashCode(code: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the request comes from an authenticated client
    const authHeader = req.headers.get('authorization') ?? ''
    const expectedAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (!authHeader.includes(expectedAnonKey) && expectedAnonKey) {
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
  } catch (error) {
    console.error('extend-subscription error:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: 'Extension failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
