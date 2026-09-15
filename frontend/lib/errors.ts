/**
 * One place that decides what a human sees and what a developer sees.
 *
 * Users get a calm, actionable sentence with no stack traces, status codes or
 * internal names. The browser console gets everything: the real message, HTTP
 * status, the backend's request id (grep the server log with it), the URL, and
 * the stack.
 *
 *   try { ... } catch (err) {
 *     setError(reportError('Claim RDP', err));   // returns the friendly text
 *   }
 */

export interface ErrorDetail {
  /** Safe to render in the UI. */
  friendly: string;
  /** Verbatim message from the API or thrown Error. Console only. */
  raw: string;
  status?: number;
  /** Correlates with "[id]" in the backend log. */
  requestId?: string;
  url?: string;
  method?: string;
  /** Extra server-side diagnostics (development only). */
  debug?: unknown;
}

/** Error carrying both audiences' information. Thrown by lib/api.ts. */
export class AppError extends Error {
  readonly friendly: string;
  readonly raw: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly url?: string;
  readonly method?: string;
  readonly debug?: unknown;

  constructor(detail: ErrorDetail) {
    super(detail.friendly || detail.raw);
    this.name = 'AppError';
    this.friendly = detail.friendly;
    this.raw = detail.raw;
    this.status = detail.status;
    this.requestId = detail.requestId;
    this.url = detail.url;
    this.method = detail.method;
    this.debug = detail.debug;
  }
}

/** Patterns mapped to plain language. First match wins, so order matters. */
const FRIENDLY_RULES: { test: RegExp; message: string }[] = [
  {
    test: /failed to fetch|networkerror|cannot reach|load failed|err_network/i,
    message: 'We can’t reach the server right now. Check your connection and try again.',
  },
  {
    test: /timeout|timed out|etimedout/i,
    message: 'That took longer than expected. Please try again.',
  },
  {
    test: /not authenticated|invalid or expired token|jwt|401/i,
    message: 'Your session has expired. Please sign in again.',
  },
  {
    test: /access denied|forbidden|not allowed|do not have|403/i,
    message: 'You don’t have permission to do that.',
  },
  {
    test: /not found|404/i,
    message: 'We couldn’t find what you were looking for.',
  },
  {
    test: /too many requests|rate limit|429/i,
    message: 'Too many attempts. Please wait a moment and try again.',
  },
  {
    // Deliberately narrow. Phrases like "You already have an open session on
    // RDP1. End that connection first." are written for the worker and name
    // the machine — replacing them with a generic line loses the instruction,
    // so they fall through to the pass-through check below.
    test: /^conflict$|integrityerror|duplicate key|unique constraint|\b409\b/i,
    message: 'That conflicts with something that already exists.',
  },
  {
    // Technical remote-desktop failures only. A bare "rdp" would also match
    // machine names like "RDP1" inside messages meant for the worker.
    test: /guacamole|websocket|ws-tunnel|\btunnel\b|\b516\b|connectionclosed|protocol error/i,
    message: 'The remote desktop could not start. Ask an admin to check the machine.',
  },
  {
    test: /internal server error|something went wrong|500|502|503|504/i,
    message: 'Something went wrong on our side. Please try again in a moment.',
  },
];

function rawMessageOf(error: unknown): string {
  if (!error) return '';
  if (error instanceof AppError) return error.raw || error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in (error as object)) {
    return String((error as { message: unknown }).message ?? '');
  }
  return String(error);
}

/**
 * The sentence to show a user. Backend 4xx messages are already written for
 * humans (“You already have an open session on RDP1”), so those pass through;
 * anything technical is replaced.
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof AppError && error.friendly) return error.friendly;

  const raw = rawMessageOf(error).trim();
  if (!raw) return fallback;

  for (const rule of FRIENDLY_RULES) {
    if (rule.test.test(raw)) return rule.message;
  }

  // A short, punctuated sentence without technical markers is very likely a
  // deliberate message from our own API — show it as-is.
  const looksTechnical = /[{}<>]|\b(error|exception|traceback|null|undefined|stack)\b/i.test(raw);
  if (!looksTechnical && raw.length <= 160) return raw;

  return fallback;
}

const isBrowser = () => typeof window !== 'undefined';
const MAX_HISTORY = 50;

/** Recent errors, for support: read window.__gsErrors in the console. */
const history: (ErrorDetail & { at: string; context: string })[] = [];

function pushHistory(entry: ErrorDetail & { at: string; context: string }) {
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  if (isBrowser()) {
    (window as unknown as Record<string, unknown>).__gsErrors = history;
  }
}

/**
 * Log the real failure to the console and return the friendly sentence.
 *
 * `context` should name the action, not the component — "Claim RDP",
 * "Upload session image" — because that is what tells you where to look.
 */
export function reportError(context: string, error: unknown, extra?: Record<string, unknown>): string {
  const friendly = friendlyError(error);
  const raw = rawMessageOf(error);
  const app = error instanceof AppError ? error : undefined;

  const entry = {
    at: new Date().toISOString(),
    context,
    friendly,
    raw,
    status: app?.status,
    requestId: app?.requestId,
    url: app?.url,
    method: app?.method,
    debug: app?.debug,
  };
  pushHistory(entry);

  if (isBrowser() && typeof console !== 'undefined') {
    const label = app?.status ? `${context} — HTTP ${app.status}` : context;
    /* eslint-disable no-console */
    console.groupCollapsed(`%c✖ ${label}`, 'color:#ef4444;font-weight:700');
    console.info('%cShown to user:', 'color:#9ca3af', friendly);
    if (raw && raw !== friendly) console.error('Actual error:', raw);
    if (app?.method || app?.url) console.info('Request:', `${app.method ?? ''} ${app.url ?? ''}`.trim());
    if (app?.requestId) {
      console.info(
        `%cRequest id: ${app.requestId}`,
        'color:#f59e0b;font-weight:700',
        '— find it in the backend log',
      );
    }
    if (app?.debug) console.info('Server debug:', app.debug);
    if (extra && Object.keys(extra).length) console.info('Context:', extra);
    if (error instanceof Error && error.stack) console.debug(error.stack);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  return friendly;
}

/** Fire-and-forget failures worth recording but not worth alarming anyone about. */
export function reportWarning(context: string, error: unknown, extra?: Record<string, unknown>): void {
  if (!isBrowser() || typeof console === 'undefined') return;
  /* eslint-disable no-console */
  console.groupCollapsed(`%c⚠ ${context}`, 'color:#f59e0b;font-weight:700');
  console.warn(rawMessageOf(error) || error);
  if (extra) console.info('Context:', extra);
  console.groupEnd();
  /* eslint-enable no-console */
}
