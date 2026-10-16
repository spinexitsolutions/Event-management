import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Spinner } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api';
import { AUTH_IMAGES } from '../authUtils';
import { AuthShell, Notice } from '../ui';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<{ kind: 'working' | 'done' | 'error'; message?: string }>(token ? { kind: 'working' } : { kind: 'error', message: 'This verification link is incomplete. Please open the link from your email again.' });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against the effect running twice (StrictMode / remounts).
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setState({ kind: 'done' });
        await refresh();
        navigate('/portal', { replace: true });
      } catch (err) {
        setState({ kind: 'error', message: errorMessage(err) });
      }
    })();
  }, [token, refresh, navigate]);

  return (
    <AuthShell image={AUTH_IMAGES.register} eyebrow="Client portal" title={state.kind === 'error' ? 'We couldn’t verify your email' : 'Confirming your email'}>
      <div aria-live="polite">
        {state.kind === 'working' && (
          <p className="flex items-center gap-3 text-muted">
            <Spinner className="h-4 w-4" /> One moment while we activate your account…
          </p>
        )}
        {state.kind === 'done' && <Notice tone="success">Your email is confirmed. Taking you to your portal…</Notice>}
        {state.kind === 'error' && (
          <div className="space-y-6">
            <Notice tone="error">{state.message}</Notice>
            <p className="text-sm text-muted">If you already confirmed your email, simply sign in. Otherwise, register again to receive a fresh link.</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/login" className="btn btn-primary">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-secondary">
                Register
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
