import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl } from '@/lib/api';

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('builds URLs and drops empty params', () => {
    expect(buildUrl('/admin/inquiries', { q: '', page: 2, status: undefined })).toBe('/api/v1/admin/inquiries?page=2');
  });

  it('sends the CSRF header on mutations and normalises errors', async () => {
    document.cookie = 'me_csrf=tok123';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Bad', details: [{ path: 'email', message: 'Invalid email' }] } }), { status: 422 }),
    );
    const err = (await api.post('/public/inquiries', { a: 1 }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toEqual({ email: 'Invalid email' });
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ 'X-CSRF-Token': 'tok123' });
    expect((init as RequestInit).credentials).toBe('include');
  });

  it('returns data on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    await expect(api.get('/public/version')).resolves.toEqual({ ok: true });
  });
});
