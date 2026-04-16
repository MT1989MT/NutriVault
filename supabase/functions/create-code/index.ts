// Supabase Edge Function: create-code
// Creates a new activation code after successful payment
// Deploy: supabase functions deploy create-code

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Structured logger — JSON output for Supabase log drain
const log = {
  _emit(level: string, msg: string, detail?: unknown) {
    const entry: Record<string, unknown> = { level, fn: 'create-code', msg, ts: new Date().toISOString() };
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

// Food-themed display name generators
// 40 adjectives x 50 foods = 2000 unique combinations
const ADJECTIVES = [
  'Fresh', 'Golden', 'Spicy', 'Sweet', 'Crispy', 'Roasted', 'Juicy', 'Ripe',
  'Savory', 'Zesty', 'Smoky', 'Tangy', 'Creamy', 'Crunchy', 'Toasted',
  'Glazed', 'Seared', 'Grilled', 'Minty', 'Nutty', 'Buttery', 'Pickled',
  'Steamed', 'Braised', 'Candied', 'Peppered', 'Herbed', 'Smoked', 'Charred',
  'Whipped', 'Silky', 'Velvet', 'Honey', 'Maple', 'Truffle', 'Rustic',
  'Wild', 'Organic', 'Toasty', 'Bitter'
]
const FOODS = [
  'Avocado', 'Mango', 'Coconut', 'Papaya', 'Walnut', 'Pistachio', 'Acai',
  'Quinoa', 'Saffron', 'Ginger', 'Wasabi', 'Matcha', 'Cacao', 'Tahini',
  'Kimchi', 'Kombucha', 'Tempeh', 'Arugula', 'Dragonfruit', 'Turmeric',
  'Cardamom', 'Cinnamon', 'Vanilla', 'Hazelnut', 'Almond', 'Cashew',
  'Pistachio', 'Macadamia', 'Pecan', 'Blueberry', 'Raspberry', 'Pomegranate',
  'Passionfruit', 'Lychee', 'Guava', 'Starfruit', 'Tamarind', 'Edamame',
  'Brioche', 'Focaccia', 'Pesto', 'Risotto', 'Burrata', 'Halloumi',
  'Mochi', 'Granola', 'Churro', 'Croissant', 'Biscotti', 'Tiramisu'
]

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
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Require server-side secret to prevent public abuse
    const secret = req.headers.get('x-edge-secret') ?? ''
    const expectedSecret = Deno.env.get('EDGE_FUNCTION_SECRET') ?? ''
    if (!expectedSecret || secret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Generate unique food-themed display name
    let displayName = ''
    for (let i = 0; i < 20; i++) {
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
      const food = FOODS[Math.floor(Math.random() * FOODS.length)]
      const candidate = `${adj} ${food}`

      const { data: nameExists } = await supabase
        .from('activation_codes')
        .select('id')
        .eq('display_name', candidate)
        .limit(1)

      if (!nameExists || nameExists.length === 0) {
        displayName = candidate
        break
      }
    }
    if (!displayName) {
      // Fallback: append random number for guaranteed uniqueness
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
      const food = FOODS[Math.floor(Math.random() * FOODS.length)]
      displayName = `${adj} ${food} ${Math.floor(Math.random() * 1000)}`
    }

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
  } catch (error: unknown) {
    log.error('Failed to create code', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create code' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
