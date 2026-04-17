import {
  isSupabaseConfigured,
  createActivationCode,
  verifyActivationCode,
} from "./supabase";
import { createLogger } from "./logger";

const log = createLogger('Auth');

// Local storage keys
const SESSION_KEY = 'nutrivault_auth_session';

// Dev mode detection
const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

// Mock database key (dev only)
const MOCK_DB_KEY = 'nutrivault_server_db_hashes';

// Session interface
interface Session {
  accountNumber: string;
  token: string;
  subscriptionEnds: number;
  name?: string;
  expiry: number;
  createdAt?: number;
}

// Mock database account interface (dev only)
interface MockAccount {
  hashedKey: string;
  subscriptionExpiry: number;
  createdAt: number;
  name?: string;
}

// Food-themed display name generators (unique per account)
// 40 adjectives x 50 foods = 2000 unique combinations
const ADJECTIVES = [
  'Fresh', 'Golden', 'Spicy', 'Sweet', 'Crispy', 'Roasted', 'Juicy', 'Ripe',
  'Savory', 'Zesty', 'Smoky', 'Tangy', 'Creamy', 'Crunchy', 'Toasted',
  'Glazed', 'Seared', 'Grilled', 'Minty', 'Nutty', 'Buttery', 'Pickled',
  'Steamed', 'Braised', 'Candied', 'Peppered', 'Herbed', 'Smoked', 'Charred',
  'Whipped', 'Silky', 'Velvet', 'Honey', 'Maple', 'Truffle', 'Rustic',
  'Wild', 'Organic', 'Toasty', 'Bitter'
];
const FOODS = [
  'Avocado', 'Mango', 'Coconut', 'Papaya', 'Walnut', 'Pistachio', 'Acai',
  'Quinoa', 'Saffron', 'Ginger', 'Wasabi', 'Matcha', 'Cacao', 'Tahini',
  'Kimchi', 'Kombucha', 'Tempeh', 'Arugula', 'Dragonfruit', 'Turmeric',
  'Cardamom', 'Cinnamon', 'Vanilla', 'Hazelnut', 'Almond', 'Cashew',
  'Macadamia', 'Pecan', 'Blueberry', 'Raspberry', 'Pomegranate',
  'Passionfruit', 'Lychee', 'Guava', 'Starfruit', 'Tamarind', 'Edamame',
  'Brioche', 'Focaccia', 'Pesto', 'Risotto', 'Burrata', 'Halloumi',
  'Mochi', 'Granola', 'Churro', 'Croissant', 'Biscotti', 'Tiramisu'
];

// SHA-256 hash function using Web Crypto API
const hashKey = async (key: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Generate a cryptographically secure session token
const generateSessionToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Create a new account.
 * Production: requires the RevenueCat `appUserId` of a subscriber who just
 * completed a purchase — the server verifies the entitlement before minting
 * a code via Supabase Edge Functions (proxied through Vercel).
 * Dev only: falls back to a local mock that does not require appUserId.
 */
export const createAccount = async (appUserId?: string | null): Promise<{ key: string; name: string } | null> => {
  // Try Supabase first (production)
  if (isSupabaseConfigured()) {
    if (!appUserId) {
      if (!IS_DEV) {
        log.error('Account creation requires a RevenueCat appUserId');
        return null;
      }
    } else {
      const result = await createActivationCode(appUserId);
      if (result) {
        return { key: result.code, name: result.name };
      }
      // If Supabase fails in production, do NOT fall back to mock
      if (!IS_DEV) {
        log.error('Account creation failed: Supabase unavailable');
        return null;
      }
    }
  }

  // Dev-only mock fallback
  if (!IS_DEV) return null;

  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  const key = Array.from(array).map(n => n.toString().slice(-4).padStart(4, '0')).join('');
  const hashed = await hashKey(key);

  const dbStr = localStorage.getItem(MOCK_DB_KEY);
  const db: MockAccount[] = dbStr ? JSON.parse(dbStr) : [];

  const existingNames = new Set(db.map(acc => acc.name));
  let name = '';
  for (let i = 0; i < 20; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const food = FOODS[Math.floor(Math.random() * FOODS.length)];
    const candidate = `${adj} ${food}`;
    if (!existingNames.has(candidate)) {
      name = candidate;
      break;
    }
  }
  if (!name) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const food = FOODS[Math.floor(Math.random() * FOODS.length)];
    name = `${adj} ${food} ${Math.floor(Math.random() * 100)}`;
  }

  db.push({
    hashedKey: hashed,
    subscriptionExpiry: Date.now() + (1000 * 60 * 60 * 24 * 30),
    createdAt: Date.now(),
    name
  });

  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
  return { key, name };
};

/**
 * Verify an activation key
 * Production: verifies via Supabase Edge Function
 * Dev only: falls back to localStorage mock
 */
export const verifyKey = async (inputKey: string): Promise<{
  success: boolean;
  expiry?: number;
  token?: string;
  name?: string
}> => {
  // Try Supabase first
  if (isSupabaseConfigured()) {
    const result = await verifyActivationCode(inputKey);
    if (result && result.success) {
      return {
        success: true,
        expiry: result.expiry,
        token: generateSessionToken(),
        name: result.name
      };
    }
    // In production, don't fall through to mock
    if (!IS_DEV) {
      // If Supabase returned an explicit failure, code is invalid
      if (result && !result.success) {
        return { success: false };
      }
      // If Supabase was unreachable (result === null), return error
      return { success: false };
    }
  }

  // Dev-only mock fallback
  if (!IS_DEV) return { success: false };

  const hashedInput = await hashKey(inputKey.replace(/\s/g, ''));
  const dbStr = localStorage.getItem(MOCK_DB_KEY);
  const db: MockAccount[] = dbStr ? JSON.parse(dbStr) : [];

  const account = db.find(acc => acc.hashedKey === hashedInput);
  if (!account || Date.now() > account.subscriptionExpiry) {
    return { success: false };
  }

  return {
    success: true,
    expiry: account.subscriptionExpiry,
    token: generateSessionToken(),
    name: account.name || "Unknown User"
  };
};

/**
 * Add subscription time to an account.
 *
 * SECURITY: in production, subscription extension happens strictly
 * server-to-server via the authenticated RevenueCat webhook. There is no
 * client-reachable endpoint to extend a subscription — a client call here
 * in production always returns false.
 *
 * Dev only: updates the local mock database so developers can test the UI
 * without standing up Supabase / RevenueCat.
 */
export const addTime = async (inputKey: string, months: number): Promise<boolean> => {
  if (!IS_DEV) return false;

  const hashedInput = await hashKey(inputKey.replace(/\s/g, ''));
  const dbStr = localStorage.getItem(MOCK_DB_KEY);
  const db: MockAccount[] = dbStr ? JSON.parse(dbStr) : [];

  const accountIndex = db.findIndex(acc => acc.hashedKey === hashedInput);
  if (accountIndex === -1) return false;

  const currentExpiry = Math.max(Date.now(), db[accountIndex].subscriptionExpiry);
  db[accountIndex].subscriptionExpiry = currentExpiry + (1000 * 60 * 60 * 24 * 30 * months);
  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
  return true;
};

/**
 * Save session to local storage
 * Token is cryptographically generated (not a fake JWT)
 */
export const saveSession = (key: string, token: string, expiry: number, name?: string): void => {
  const session: Session = {
    accountNumber: key,
    token,
    subscriptionEnds: expiry,
    name,
    expiry: Date.now() + (1000 * 60 * 60 * 24), // Session valid for 24 hours
    createdAt: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

/**
 * Get current session
 * Returns session even if subscription expired (for data access)
 * Enforces max 7-day session lifetime requiring re-verification
 */
export const getSession = (): Session | null => {
  try {
    // Dev bypass: auto-create session for testing
    if (IS_DEV) {
      const str = localStorage.getItem(SESSION_KEY);
      if (!str) {
        const devSession: Session = {
          accountNumber: 'DEV-0000-0000-0000',
          token: 'dev-token',
          subscriptionEnds: Date.now() + (1000 * 60 * 60 * 24 * 365),
          name: 'Dev Tester',
          expiry: Date.now() + (1000 * 60 * 60 * 24 * 365),
          createdAt: Date.now()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(devSession));
        return devSession;
      }
    }

    const str = localStorage.getItem(SESSION_KEY);
    if (!str) return null;

    const session: Session = JSON.parse(str);

    // Max session lifetime: 7 days without re-login
    const maxLifetime = 1000 * 60 * 60 * 24 * 7;
    const sessionAge = Date.now() - (session.createdAt || 0);
    if (session.createdAt && sessionAge > maxLifetime) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    // Session token expired within 7-day window - refresh it
    if (Date.now() > session.expiry) {
      session.expiry = Date.now() + (1000 * 60 * 60 * 24);
      session.token = generateSessionToken();
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    return session;
  } catch {
    return null;
  }
};

/**
 * Check if subscription is still active
 */
export const isSubscriptionActive = (): boolean => {
  const session = getSession();
  if (!session) return false;
  return Date.now() < session.subscriptionEnds;
};

/**
 * Check if user has any session (even expired subscription)
 */
export const hasExistingAccount = (): boolean => {
  return getSession() !== null;
};

/**
 * Clear session (logout)
 * Only clears session, NOT the user's food/workout data
 */
export const logout = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/**
 * Check if using production backend
 */
export const isProductionMode = (): boolean => {
  return isSupabaseConfigured();
};
