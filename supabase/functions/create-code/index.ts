// Supabase Edge Function: create-code
// Creates a new activation code after successful payment
// Deploy: supabase functions deploy create-code

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COLORS = ['Green', 'Red', 'Blue', 'Gold', 'Silver', 'Black', 'White', 'Neon', 'Cosmic', 'Solar']
const NOUNS = ['Apple', 'Falcon', 'River', 'Mountain', 'Tiger', 'Storm', 'Wolf', 'Ocean', 'Phoenix', 'Dragon']

async function hashCode(code: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateCode(): string {
  const array = new Uint32Array(4)
  crypto.getRandomValues(array)
  return Array.from(array).map(n => n.toString().slice(-4).padStart(4, '0')).join('')
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use service role key (server-side, bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Generate unique code (retry up to 10 times)
    let code = ''
    let hash = ''
    let isUnique = false

    for (let i = 0; i < 10; i++) {
      code = generateCode()
      hash = await hashCode(code)

      const { data: existing } = await supabase
        .from('activation_codes')
        .select('id')
        .eq('code_hash', hash)
        .limit(1)

      if (!existing || existing.length === 0) {
        isUnique = true
        break
      }
    }

    if (!isUnique) {
      return new Response(
        JSON.stringify({ error: 'Could not generate unique code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate display name
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    const displayName = `${color} ${noun}`

    // 30 days from now
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Insert into database
    const { error: insertError } = await supabase
      .from('activation_codes')
      .insert({
        code_hash: hash,
        display_name: displayName,
        expires_at: expiresAt,
        is_active: true,
      })

    if (insertError) {
      throw insertError
    }

    return new Response(
      JSON.stringify({ code, name: displayName }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
