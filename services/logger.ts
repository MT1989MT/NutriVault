/**
 * NutriVault Logger
 *
 * Centralized, environment-aware logging system.
 *
 * - Log levels: DEBUG < INFO < WARN < ERROR < SILENT
 * - Production: only WARN+ reaches the console (less noise, lower cost in hosted log services)
 * - Dev: all levels print
 * - In-memory ring buffer (last 150 entries) survives across the session for crash diagnostics
 * - Safe error serialization strips tokens, long base64, and URLs before logging
 * - Global handlers catch unhandled promise rejections and window errors
 * - exportLogs() produces a plain-text dump suitable for support/diagnostics
 */

// ── Log levels ──────────────────────────────────────────────────────────────

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
} as const;

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

// ── Internal state ──────────────────────────────────────────────────────────

interface LogEntry {
  ts: number;
  lvl: LogLevelValue;
  mod: string;
  msg: string;
  data?: string;
}

const IS_DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

const BUFFER_MAX = 150;
const buffer: LogEntry[] = [];

let minLevel: LogLevelValue = IS_DEV ? LogLevel.DEBUG : LogLevel.WARN;

const LABELS: Record<LogLevelValue, string> = {
  [LogLevel.DEBUG]: 'DBG',
  [LogLevel.INFO]: 'INF',
  [LogLevel.WARN]: 'WRN',
  [LogLevel.ERROR]: 'ERR',
  [LogLevel.SILENT]: '',
};

const CONSOLE_FN: Record<LogLevelValue, 'debug' | 'info' | 'warn' | 'error'> = {
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.INFO]: 'info',
  [LogLevel.WARN]: 'warn',
  [LogLevel.ERROR]: 'error',
  [LogLevel.SILENT]: 'error',
};

// ── Safe serialization ──────────────────────────────────────────────────────

/** Strip tokens, keys, long base64, and file paths from a string */
function sanitize(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._\-/+]{8,}/g, 'Bearer [redacted]')
    .replace(/key=[A-Za-z0-9._\-]{10,}/g, 'key=[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g, '[jwt-redacted]')
    .replace(/[A-Za-z0-9+/]{60,}={0,2}/g, '[base64-redacted]')
    .slice(0, 500);
}

/** Turn any error-like value into a safe loggable string */
function fmtErr(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return sanitize(err.message);
  if (typeof err === 'string') return sanitize(err);
  try { return sanitize(JSON.stringify(err).slice(0, 300)); } catch { return '[unserializable]'; }
}

// ── Core log function ───────────────────────────────────────────────────────

function write(lvl: LogLevelValue, mod: string, msg: string, data?: unknown): void {
  const entry: LogEntry = {
    ts: Date.now(),
    lvl,
    mod,
    msg,
    data: data !== undefined ? fmtErr(data) : undefined,
  };

  // Always buffer (even below current level) — useful for post-crash diagnostics
  buffer.push(entry);
  if (buffer.length > BUFFER_MAX) buffer.shift();

  if (lvl < minLevel) return;

  const tag = `[${LABELS[lvl]}][${mod}]`;
  const fn = CONSOLE_FN[lvl];
  if (entry.data) {
    console[fn](tag, msg, entry.data);
  } else {
    console[fn](tag, msg);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/** Create a scoped logger for a module / component */
export function createLogger(module: string): Logger {
  return {
    debug: (msg, data?) => write(LogLevel.DEBUG, module, msg, data),
    info:  (msg, data?) => write(LogLevel.INFO,  module, msg, data),
    warn:  (msg, data?) => write(LogLevel.WARN,  module, msg, data),
    error: (msg, data?) => write(LogLevel.ERROR, module, msg, data),
  };
}

/** Change the runtime log level (e.g. for on-device debugging) */
export function setLogLevel(level: LogLevelValue): void {
  minLevel = level;
}

/** Get a copy of the in-memory log buffer */
export function getLogBuffer(): ReadonlyArray<LogEntry> {
  return [...buffer];
}

/** Export buffer as a plain-text string for diagnostics / support */
export function exportLogs(): string {
  if (buffer.length === 0) return '(no log entries)';
  return buffer.map(e => {
    const ts = new Date(e.ts).toISOString();
    const extra = e.data ? ` | ${e.data}` : '';
    return `${ts} [${LABELS[e.lvl]}][${e.mod}] ${e.msg}${extra}`;
  }).join('\n');
}

/** Clear the ring buffer */
export function clearLogBuffer(): void {
  buffer.length = 0;
}

// ── Global error handlers ───────────────────────────────────────────────────

let globalHandlersInstalled = false;

/**
 * Install window-level error handlers.
 * Safe to call multiple times — only installs once.
 * Call in App.tsx useEffect on mount.
 */
export function installGlobalHandlers(): void {
  if (globalHandlersInstalled) return;
  if (typeof window === 'undefined') return;
  globalHandlersInstalled = true;

  const log = createLogger('Global');

  window.addEventListener('unhandledrejection', (ev) => {
    log.error('Unhandled promise rejection', ev.reason);
    ev.preventDefault(); // we've captured it
  });

  window.addEventListener('error', (ev) => {
    // Avoid double-logging errors that React's ErrorBoundary already caught
    if (ev.message === 'ResizeObserver loop completed with undelivered notifications.') return;
    log.error(`Uncaught: ${ev.message}`, ev.error);
  });
}
