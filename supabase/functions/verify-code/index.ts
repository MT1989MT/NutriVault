// Supabase Edge Function: verify-code
// Verifies an activation code and returns account info
// Deploy: supabase functions deploy verify-code

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
      console.error('verify-code DB error:', error.message)
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
  } catch (error) {
    console.error('verify-code error:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: 'Verification failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
