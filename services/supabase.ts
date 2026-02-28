/**
 * Supabase Client
 *
 * Uses Edge Functions for write operations (create, extend)
 * Uses REST API for read operations (verify)
 *
 * SETUP: See /supabase/migrations/001_activation_codes.sql
 * DEPLOY: See /supabase/README.md
 */

// Configuration - use env vars when available, fallback to defaults
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://gbdrsqskqvsfnwyeidda.supabase.co';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHJzcXNrcXZzZm53eWVpZGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NTQwOTAsImV4cCI6MjA4MjUzMDA5MH0.tqq-TlB0ufuBbRwOFCbierb3ywJu-nSvkWKXkpT-gcQ';

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');
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

// REST API for reads (uses anon key, allowed by RLS SELECT policy)
const supabaseRead = async (endpoint: string) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase read error: ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

// Hash function using Web Crypto API
const hashCode = async (code: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export interface ActivationCode {
  id: string;
  code_hash: string;
  display_name: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

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
 * Verify an activation code via REST API (read-only, allowed by RLS)
 */
export const verifyActivationCode = async (code: string): Promise<{
  success: boolean;
  expiry?: number;
  name?: string;
} | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const cleanCode = code.replace(/\s/g, '');
    const hash = await hashCode(cleanCode);

    const results = await supabaseRead(
      `activation_codes?code_hash=eq.${hash}&is_active=eq.true&select=display_name,expires_at`
    );

    if (!results || results.length === 0) {
      return { success: false };
    }

    const account = results[0];
    const expiryDate = new Date(account.expires_at).getTime();

    if (Date.now() > expiryDate) {
      return { success: false };
    }

    return {
      success: true,
      expiry: expiryDate,
      name: account.display_name,
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
