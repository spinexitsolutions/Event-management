/**
 * REST client.
 *  - Sends the httpOnly session cookie with every request.
 *  - Adds the CSRF double-submit header on mutating requests (and retries once if the token rotated).
 *  - Normalises errors into ApiError { status, code, message, details, fieldErrors }.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api/v1';

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** Field errors keyed by path (e.g. "email", "milestones.0.date"). */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) for (const d of this.details as FieldIssue[]) if (d && typeof d.path === 'string') out[d.path] = d.message;
    return out;
  }
}

let csrfToken: string | null = null;
const readCookie = (name: string) =>
  typeof document === 'undefined'
    ? undefined
    : document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${name}=`))
        ?.split('=')[1];

export async function ensureCsrf(): Promise<string> {
  const fromCookie = readCookie('me_csrf');
  if (fromCookie) return (csrfToken = decodeURIComponent(fromCookie));
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: 'include' });
  const json = await res.json();
  csrfToken = json.data.csrfToken as string;
  return csrfToken;
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export type Query = Record<string, string | number | boolean | undefined | null>;
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  raw?: boolean;
}
export interface Paged<T> {
  data: T;
  meta?: { page: number; limit: number; total: number; pages: number; [k: string]: unknown };
}

export function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams();
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ''}`;
}

async function doFetch(path: string, opts: RequestOptions) {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();
  return fetch(buildUrl(path, opts.query), { method, headers, body, credentials: 'include', signal: opts.signal });
}

export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<Paged<T>> {
  let res: Response;
  try {
    res = await doFetch(path, opts);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error — check your connection and try again.');
  }
  if (res.status === 403) {
    const peek = await res.clone().json().catch(() => null);
    if (peek?.error?.code === 'CSRF_FAILED') {
      csrfToken = null;
      res = await doFetch(path, opts);
    }
  }
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json?.error?.code ?? 'HTTP_ERROR', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  if (opts.raw) return { data: res as unknown as T };
  if (res.status === 204) return { data: undefined as T };
  return (await res.json()) as Paged<T>;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => apiRequest<T>(path, { query, signal }).then((r) => r.data),
  getPaged: <T>(path: string, query?: Query) => apiRequest<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }).then((r) => r.data),
  postFull: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: <T>(path: string, query?: Query) => apiRequest<T>(path, { method: 'DELETE', query }).then((r) => r.data),
  upload: <T>(path: string, form: FormData) => apiRequest<T>(path, { method: 'POST', body: form }).then((r) => r.data),
  uploadFull: <T>(path: string, form: FormData) => apiRequest<T>(path, { method: 'POST', body: form }),
  /** Same-origin URL for links to authenticated files (PDFs, CSV) — the cookie authenticates them. */
  url: (path: string, query?: Query) => buildUrl(path, query),
};

/** Downloads a file from an authenticated endpoint. */
export async function download(path: string, query?: Query, fallbackName = 'download') {
  const { data } = await apiRequest<Response>(path, { query, raw: true });
  const res = data as unknown as Response;
  const blob = await res.blob();
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = decodeURIComponent(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
