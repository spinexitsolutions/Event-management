import { useQuery } from '@tanstack/react-query';
import { Bot, CheckCircle2, Clock4, CreditCard, HardDrive, Mail, MessageCircle, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, PageHeader } from '@/admin/ui';
import { api } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { AdmError, CopyButton, RequirePerm, SkeletonRows } from '../shared';

interface Integrations {
  payments: { provider: string; liveCredentials: boolean; webhookSecret: boolean; webhookUrl: string };
  email: { provider: string; configured: boolean; from: string };
  whatsapp: { provider: string; configured: boolean };
  storage: { driver: string };
  captcha: { turnstile: boolean };
  ai: { configured: boolean };
  jobs: { enabled: boolean };
}

type State = 'ok' | 'warn' | 'off';

function IntegrationCard({ icon: Icon, title, state, stateLabel, children, hint }: { icon: LucideIcon; title: string; state: State; stateLabel: string; children?: ReactNode; hint?: ReactNode }) {
  return (
    <section className="adm-card flex flex-col p-5">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adm-bg ring-1 ring-adm-line">
          <Icon className="h-[18px] w-[18px] text-adm-ink" aria-hidden />
        </span>
        <h2 className="flex-1 pt-1.5 text-sm font-semibold">{title}</h2>
        <Badge tone={state === 'ok' ? 'green' : state === 'warn' ? 'amber' : 'gray'}>
          {state === 'ok' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
          {stateLabel}
        </Badge>
      </header>
      {children && <div className="mt-4 space-y-2 text-sm">{children}</div>}
      {hint && <p className="mt-4 border-t border-adm-line pt-3 text-xs leading-relaxed text-adm-muted">{hint}</p>}
    </section>
  );
}

const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-adm-muted">{k}</span>
    <span className="min-w-0 text-right">{v}</span>
  </div>
);
const Env = ({ children }: { children: ReactNode }) => <code className="rounded bg-adm-bg px-1 py-0.5 font-mono text-[11px] text-adm-ink">{children}</code>;

function IntegrationsScreen() {
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<Integrations>('/admin/settings/integrations') });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError) return <AdmError error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;
  const paymentsState: State = s.payments.provider === 'razorpay' ? (s.payments.webhookSecret ? 'ok' : 'warn') : 'warn';
  return (
    <div>
      <PageHeader
        back={{ to: '/admin/settings/business', label: 'Business settings' }}
        title="Integrations"
        subtitle="Live status of the services this platform connects to. Credentials are set as server environment variables and are never shown here."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <IntegrationCard
          icon={CreditCard}
          title="Online payments"
          state={paymentsState}
          stateLabel={s.payments.provider === 'razorpay' ? (s.payments.webhookSecret ? 'Live' : 'Webhook secret missing') : 'Sandbox'}
          hint={
            s.payments.provider === 'razorpay' ? (
              <>Add this webhook URL in the Razorpay dashboard and set <Env>RAZORPAY_WEBHOOK_SECRET</Env> to the same secret. See docs/integrations.md → Razorpay and docs/deployment.md.</>
            ) : (
              <>The sandbox provider simulates payments for testing and is refused in production. Set <Env>PAYMENT_PROVIDER=razorpay</Env> with <Env>RAZORPAY_KEY_ID</Env>, <Env>RAZORPAY_KEY_SECRET</Env> and <Env>RAZORPAY_WEBHOOK_SECRET</Env>. See docs/integrations.md → Razorpay.</>
            )
          }
        >
          <Row k="Provider" v={titleCase(s.payments.provider)} />
          <Row k="Webhook secret" v={s.payments.webhookSecret ? <span className="text-emerald-700">Set</span> : <span className="text-amber-700">Not set</span>} />
          <div>
            <p className="mb-1 text-adm-muted">Webhook URL</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-adm-bg px-2 py-1.5 font-mono text-[11px]" title={s.payments.webhookUrl}>
                {s.payments.webhookUrl}
              </code>
              <CopyButton text={s.payments.webhookUrl} />
            </div>
          </div>
        </IntegrationCard>

        <IntegrationCard
          icon={Mail}
          title="Email"
          state={s.email.configured ? 'ok' : 'warn'}
          stateLabel={s.email.configured ? 'Connected' : 'Not configured'}
          hint={
            s.email.configured ? (
              <>Delivery is logged in Emails & automations → Outbox.</>
            ) : (
              <>Without a provider, emails are logged as skipped and never shown as sent. Set <Env>EMAIL_PROVIDER</Env> to <Env>smtp</Env> (<Env>SMTP_HOST</Env>, <Env>SMTP_USER</Env>, <Env>SMTP_PASS</Env>) or <Env>resend</Env> (<Env>RESEND_API_KEY</Env>), plus <Env>EMAIL_FROM</Env>. See docs/integrations.md → Email.</>
            )
          }
        >
          <Row k="Provider" v={s.email.provider === 'none' ? 'None' : titleCase(s.email.provider)} />
          <Row k="From address" v={<span className="break-all">{s.email.from || '—'}</span>} />
        </IntegrationCard>

        <IntegrationCard
          icon={MessageCircle}
          title="WhatsApp"
          state={s.whatsapp.configured ? 'ok' : 'off'}
          stateLabel={s.whatsapp.configured ? 'Connected' : 'Optional — off'}
          hint={!s.whatsapp.configured && <>Set <Env>WHATSAPP_PROVIDER=meta</Env> with <Env>WHATSAPP_TOKEN</Env> and <Env>WHATSAPP_PHONE_NUMBER_ID</Env> (Meta Cloud API), then turn on WhatsApp in Automations. See docs/integrations.md → WhatsApp.</>}
        >
          <Row k="Provider" v={s.whatsapp.provider === 'none' ? 'None' : titleCase(s.whatsapp.provider)} />
        </IntegrationCard>

        <IntegrationCard
          icon={HardDrive}
          title="Media storage"
          state={s.storage.driver === 'cloudinary' ? 'ok' : 'warn'}
          stateLabel={s.storage.driver === 'cloudinary' ? 'Cloudinary' : 'Local disk'}
          hint={s.storage.driver !== 'cloudinary' && <>Local disk is fine for development, but most hosts wipe it on redeploy. Set <Env>STORAGE_DRIVER=cloudinary</Env> with the <Env>CLOUDINARY_*</Env> variables for production. See docs/integrations.md → Media storage.</>}
        >
          <Row k="Driver" v={titleCase(s.storage.driver)} />
        </IntegrationCard>

        <IntegrationCard
          icon={ShieldCheck}
          title="Spam protection"
          state={s.captcha.turnstile ? 'ok' : 'warn'}
          stateLabel={s.captcha.turnstile ? 'Turnstile on' : 'Not configured'}
          hint={!s.captcha.turnstile && <>Public forms still use a honeypot, minimum fill time and rate limits. For Cloudflare Turnstile set <Env>TURNSTILE_SITE_KEY</Env> and <Env>TURNSTILE_SECRET_KEY</Env>. See docs/integrations.md → Spam protection.</>}
        >
          <Row k="Cloudflare Turnstile" v={s.captcha.turnstile ? 'Enabled' : 'Disabled'} />
        </IntegrationCard>

        <IntegrationCard
          icon={Bot}
          title="AI assistance"
          state={s.ai.configured ? 'ok' : 'off'}
          stateLabel={s.ai.configured ? 'Connected' : 'Optional — off'}
          hint={!s.ai.configured && <>Optional drafting help in the admin. Set <Env>AI_PROVIDER=anthropic</Env> and <Env>ANTHROPIC_API_KEY</Env>. See docs/integrations.md → AI assistance.</>}
        >
          <Row k="Status" v={s.ai.configured ? 'Available' : 'Not configured'} />
        </IntegrationCard>

        <IntegrationCard
          icon={Clock4}
          title="Scheduled jobs"
          state={s.jobs.enabled ? 'ok' : 'warn'}
          stateLabel={s.jobs.enabled ? 'Running' : 'Disabled'}
          hint={
            s.jobs.enabled ? (
              <>Sends queued messages, reminders, quotation expiry and nightly cleanup.</>
            ) : (
              <>Reminders, the outbox queue and cleanup will not run. Set <Env>JOBS_ENABLED=true</Env> on exactly one server instance.</>
            )
          }
        >
          <Row k="Background jobs" v={s.jobs.enabled ? 'Enabled' : 'Disabled'} />
        </IntegrationCard>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <RequirePerm any={['dashboard.view']}>
      <IntegrationsScreen />
    </RequirePerm>
  );
}
