/**
 * Supabase Client
 *
 * All operations go through Edge Functions (create, verify, extend)
 * Edge Functions use service_role key server-side to bypass RLS
 *
 * SETUP: See /supabase/migrations/001_activation_codes.sql
 * DEPLOY: See /supabase/README.md
 */

// Configuration - require env vars, no hardcoded fallbacks
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
};

// Call a Supabase Edge Function
const callEdgeFunction = async (functionName: string, body: Record<string, unknown>) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function error ${response.status}: ${text}`);
  }

  return response.json();
};

/**
 * Create a new activation code via Edge Function
 * The Edge Function uses the service_role key to bypass RLS
 */
export const createActivationCode = async (): Promise<{ code: string; name: string } | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const result = await callEdgeFunction('create-code', {});
    if (result.error) throw new Error(result.error);
    return { code: result.code, name: result.name };
  } catch (error) {
    console.error('Failed to create activation code:', error);
    return null;
  }
};

/**
 * Verify an activation code via Edge Function (server-side, uses service_role)
 */
export const verifyActivationCode = async (code: string): Promise<{
  success: boolean;
  expiry?: number;
  name?: string;
} | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const result = await callEdgeFunction('verify-code', { code });
    return {
      success: result.success === true,
      expiry: result.expiry,
      name: result.name,
    };
  } catch (error) {
    console.error('Failed to verify code:', error);
    return null; // null = Supabase unavailable, fallback to mock
  }
};

/**
 * Extend subscription via Edge Function
 */
export const extendSubscription = async (code: string, months: number): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;

  try {
    const result = await callEdgeFunction('extend-subscription', { code, months });
    return result.success === true;
  } catch (error) {
    console.error('Failed to extend subscription:', error);
    return false;
  }
};
