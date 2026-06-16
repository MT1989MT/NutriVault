/**
 * Shared configuration for all services
 * Centralizes API base URL detection to avoid duplication
 */

// API base URL
// - Web (Vercel): empty string → relative URL → same-origin, no CORS
// - Native (Capacitor): full URL since there's no local API server
// - Explicit env var overrides everything
export const API_BASE_URL = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || window.location?.protocol === 'capacitor:')) {
    return 'https://nutrivault-seven.vercel.app';
  }
  return '';
})();

// Public site URL for static pages (privacy policy, support) and legal links.
// - Web (Vercel): same-origin via API_BASE_URL ('') → relative path, works on every
//   preview/production deploy without hardcoding the domain.
// - Native (Capacitor): falls back to the absolute production URL via API_BASE_URL.
export const PRIVACY_POLICY_URL = `${API_BASE_URL}/docs/privacy-policy.html`;
export const SUPPORT_URL = `${API_BASE_URL}/docs/support.html`;
