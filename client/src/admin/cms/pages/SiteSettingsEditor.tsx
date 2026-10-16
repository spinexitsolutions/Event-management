import { useQuery } from '@tanstack/react-query';
import { Building2, Compass, Image as ImageIcon, Inbox, Megaphone, MessageCircle, Newspaper, PanelBottom, Plus, Search, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { DEFAULT_THEME, siteSettingsSchema, themeTokensSchema, type SiteSettings, type ThemeTokens } from '@maison/shared';
import { Field, Input, Select, Toggle } from '@/admin/ui';
import { api } from '@/lib/api';
import { Callout, CharCount, FieldGroup } from '../components/bits';
import { ConfigWorkspace, type Panel } from '../components/ConfigWorkspace';
import { CountedTextarea, LinkInput, useSiteLinks } from '../components/inputs';
import { ListEditor, StringListEditor } from '../components/ListEditor';
import { ImageField } from '../components/MediaFields';
import { useConfigEditor } from '../lib/config';
import type { ConfigDoc } from '../lib/types';
import { errorUnder, fillMissing, issuesToMap, setAt } from '../lib/util';

type NavLink = { label: string; href: string; newTab: boolean };
type NavItem = NavLink & { children: NavLink[] };
type Social = SiteSettings['social'][number];

const NETWORKS: Social['network'][] = ['instagram', 'facebook', 'youtube', 'linkedin', 'x', 'pinterest', 'tiktok', 'vimeo'];
const NETWORK_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X (Twitter)', pinterest: 'Pinterest', tiktok: 'TikTok', vimeo: 'Vimeo' };

/** Quick-add menu of internal links (built-in pages, CMS pages, event categories). */
function QuickAdd({ onPick, label = 'Quick add a link…' }: { onPick: (l: { label: string; href: string }) => void; label?: string }) {
  const links = useSiteLinks();
  return (
    <Select
      aria-label={label}
      value=""
      className="py-1.5 text-xs"
      onChange={(e) => {
        const all = [...links.builtin, ...links.pages, ...links.categories];
        const l = all.find((x) => x.href === e.target.value);
        if (l) onPick({ label: l.label.replace(/ \(.*\)$/, ''), href: l.href });
      }}
    >
      <option value="">{label}</option>
      <optgroup label="Built-in pages">
        {links.builtin.map((l) => (
          <option key={l.href} value={l.href}>
            {l.label}
          </option>
        ))}
      </optgroup>
      {links.pages.length > 0 && (
        <optgroup label="Your pages">
          {links.pages.map((l) => (
            <option key={l.href} value={l.href}>
              {l.label}
            </option>
          ))}
        </optgroup>
      )}
      {links.categories.length > 0 && (
        <optgroup label="Event categories">
          {links.categories.map((l) => (
            <option key={l.href} value={l.href}>
              {l.label}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

function LinkFields({ value, onChange, errors }: { value: NavLink; onChange: (p: Partial<NavLink>) => void; errors?: { label?: string; href?: string } }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <span className="adm-label">Label</span>
          <Input value={value.label} maxLength={40} onChange={(e) => onChange({ label: e.target.value })} invalid={!!errors?.label} />
        </div>
        <div>
          <span className="adm-label">Link</span>
          <LinkInput value={value.href} onChange={(href) => onChange({ href })} invalid={!!errors?.href} />
        </div>
      </div>
      {(errors?.label || errors?.href) && <p className="text-xs text-red-600">{errors.label ?? errors.href}</p>}
      <Toggle checked={!!value.newTab} onChange={(newTab) => onChange({ newTab })} label={<span className="text-xs">Open in a new tab</span>} />
    </div>
  );
}

function LinkListEditor({ value, onChange, max, errs, prefix, addLabel = 'Add link' }: { value: NavLink[]; onChange: (v: NavLink[]) => void; max: number; errs: Record<string, string>; prefix: string; addLabel?: string }) {
  return (
    <div className="space-y-2">
      <ListEditor<NavLink>
        items={value}
        onChange={onChange}
        max={max}
        compact
        addLabel={addLabel}
        newItem={() => ({ label: '', href: '/', newTab: false })}
        itemTitle={(l) => (
          <span>
            {l.label || <em className="font-normal text-adm-muted">Untitled</em>} <span className="font-normal text-adm-muted">→ {l.href}</span>
          </span>
        )}
        renderItem={(l, update, i) => <LinkFields value={l} onChange={update} errors={{ label: errs[`${prefix}.${i}.label`], href: errs[`${prefix}.${i}.href`] }} />}
      />
      {value.length < max && <QuickAdd onPick={(l) => onChange([...value, { ...l, newTab: false }])} />}
    </div>
  );
}

const normalize = (draft: unknown, published: unknown) => fillMissing<SiteSettings>(draft, published as SiteSettings);

export default function SiteSettingsEditor() {
  const editor = useConfigEditor<SiteSettings>('site', normalize);
  const theme = useQuery({ queryKey: ['cms-config', 'theme'], queryFn: () => api.get<ConfigDoc<unknown>>('/admin/cms/site/theme') });
  const s = editor.value;
  const set = (path: string, v: unknown) => editor.setValue((cur) => (cur ? setAt(cur, path, v) : cur));

  const issues = useMemo(() => {
    if (!s) return [];
    const r = siteSettingsSchema.safeParse(s);
    const out = r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message === 'Required' ? 'This is required' : i.message }));
    if (s.seo.titleTemplate && !s.seo.titleTemplate.includes('%s')) out.push({ path: 'seo.titleTemplate', message: 'Include %s where the page title should go' });
    return out;
  }, [s]);
  const errs = issuesToMap(issues);
  const count = (...prefixes: string[]) => issues.filter((i) => prefixes.some((p) => i.path === p || i.path.startsWith(`${p}.`))).length;

  const previewTheme = (): ThemeTokens => {
    if (!theme.data) return DEFAULT_THEME;
    const base = themeTokensSchema.safeParse(theme.data.published).success ? (theme.data.published as ThemeTokens) : DEFAULT_THEME;
    return fillMissing<ThemeTokens>(theme.data.draft, base);
  };

  const panels: Panel[] = !s
    ? []
    : [
        {
          id: 'branding',
          label: 'Branding',
          description: 'Name, logo, wordmark and favicon.',
          icon: ImageIcon,
          errors: count('brand'),
          render: () => (
            <div className="space-y-5">
              <Field label="Business name" required error={errs['brand.name']}>
                <Input value={s.brand.name} maxLength={60} onChange={(e) => set('brand.name', e.target.value)} invalid={!!errs['brand.name']} />
              </Field>
              <Field label="Tagline" error={errs['brand.tagline']} hint="A short line used in the footer and search results.">
                <Input value={s.brand.tagline} maxLength={140} onChange={(e) => set('brand.tagline', e.target.value)} />
              </Field>
              <Field label="Wordmark" hint="Text logo shown when no logo image is uploaded (e.g. MAISON AURELLE).">
                <Input value={s.brand.wordmark} maxLength={40} onChange={(e) => set('brand.wordmark', e.target.value)} />
              </Field>
              <Field label="Logo" hint="SVG or transparent PNG. Shown on light backgrounds and solid headers." error={errs['brand.logoUrl']}>
                <ImageField value={s.brand.logoUrl} onChange={(v) => set('brand.logoUrl', v)} aspect="aspect-[3/2]" label="logo" />
              </Field>
              <Field label="Light logo (for dark overlays)" hint="A white/light version used over photographs and the transparent header." error={errs['brand.logoLightUrl']}>
                <ImageField value={s.brand.logoLightUrl} onChange={(v) => set('brand.logoLightUrl', v)} aspect="aspect-[3/2]" label="light logo" />
              </Field>
              <Field label="Logo alt text" hint="Usually your business name.">
                <Input value={s.brand.logoAlt} maxLength={120} onChange={(e) => set('brand.logoAlt', e.target.value)} />
              </Field>
              <Field label="Favicon" hint="Square image, at least 512 × 512px. Shown in browser tabs." error={errs['brand.faviconUrl']}>
                <ImageField value={s.brand.faviconUrl} onChange={(v) => set('brand.faviconUrl', v)} aspect="aspect-square" label="favicon" />
              </Field>
            </div>
          ),
        },
        {
          id: 'company',
          label: 'Company & contact',
          description: 'About text, email, phone, WhatsApp, address and map.',
          icon: Building2,
          errors: count('company'),
          render: () => {
            const c = s.company;
            const mapOk = !c.mapEmbedUrl || /^https:\/\/(www\.)?google\.com\/maps\/embed\?/.test(c.mapEmbedUrl);
            return (
              <div className="space-y-6">
                <Field label="About the company" hint="Short description used in the footer and contact sections." error={errs['company.about']}>
                  <CountedTextarea value={c.about} max={600} rows={4} onChange={(v) => set('company.about', v)} />
                </Field>
                <FieldGroup title="Contact">
                  <Field label="Email" error={errs['company.email']}>
                    <Input type="email" value={c.email} onChange={(e) => set('company.email', e.target.value)} invalid={!!errs['company.email']} placeholder="hello@yourstudio.com" />
                  </Field>
                  <Field label="Phone" error={errs['company.phone']}>
                    <Input type="tel" value={c.phone} maxLength={30} onChange={(e) => set('company.phone', e.target.value)} placeholder="+91 98765 43210" />
                  </Field>
                  <Field label="WhatsApp number" hint="Digits only, with country code (e.g. 919876543210)." error={errs['company.whatsapp']}>
                    <Input inputMode="tel" value={c.whatsapp} maxLength={20} onChange={(e) => set('company.whatsapp', e.target.value.replace(/[^\d+]/g, ''))} invalid={!!errs['company.whatsapp']} />
                  </Field>
                  <Field label="WhatsApp pre-filled message" hint="The text a visitor’s WhatsApp opens with." error={errs['company.whatsappMessage']}>
                    <Input value={c.whatsappMessage} maxLength={200} onChange={(e) => set('company.whatsappMessage', e.target.value)} />
                  </Field>
                  <Field label="Opening hours">
                    <Input value={c.hours} maxLength={200} onChange={(e) => set('company.hours', e.target.value)} placeholder="Mon–Sat, 10am–7pm · Consultations by appointment" />
                  </Field>
                </FieldGroup>
                <FieldGroup title="Address">
                  <Field label="Street address">
                    <Input value={c.addressLine} maxLength={200} onChange={(e) => set('company.addressLine', e.target.value)} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="City">
                      <Input value={c.city} maxLength={80} onChange={(e) => set('company.city', e.target.value)} />
                    </Field>
                    <Field label="State / region">
                      <Input value={c.region} maxLength={80} onChange={(e) => set('company.region', e.target.value)} />
                    </Field>
                    <Field label="Postal code">
                      <Input value={c.postalCode} maxLength={20} onChange={(e) => set('company.postalCode', e.target.value)} />
                    </Field>
                    <Field label="Country">
                      <Input value={c.country} maxLength={60} onChange={(e) => set('company.country', e.target.value)} />
                    </Field>
                  </div>
                  <Field
                    label="Google Maps embed URL"
                    error={errs['company.mapEmbedUrl'] ?? (!mapOk ? 'Must be a Google Maps embed URL' : undefined)}
                    hint="In Google Maps: Share → Embed a map → Copy HTML, then paste it here — we keep only the https://www.google.com/maps/embed?… address."
                  >
                    <Input
                      value={c.mapEmbedUrl}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const src = raw.match(/src="([^"]+)"/)?.[1] ?? raw;
                        set('company.mapEmbedUrl', src);
                      }}
                      invalid={!mapOk}
                      placeholder="https://www.google.com/maps/embed?pb=…"
                    />
                  </Field>
                </FieldGroup>
              </div>
            );
          },
        },
        {
          id: 'social',
          label: 'Social links',
          description: 'Instagram, YouTube, LinkedIn and more.',
          icon: Share2,
          errors: count('social'),
          render: () => (
            <ListEditor<Social>
              items={s.social}
              onChange={(v) => set('social', v)}
              max={10}
              addLabel="Add social link"
              empty="No social links yet."
              newItem={() => ({ network: NETWORKS.find((n) => !s.social.some((x) => x.network === n)) ?? 'instagram', url: 'https://' })}
              itemTitle={(x) => (
                <span>
                  {NETWORK_LABEL[x.network]} <span className="font-normal text-adm-muted">{x.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </span>
              )}
              renderItem={(x, update, i) => (
                <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                  <Select aria-label="Network" value={x.network} onChange={(e) => update({ network: e.target.value as Social['network'] })} options={NETWORKS.map((n) => ({ value: n, label: NETWORK_LABEL[n] }))} />
                  <div>
                    <Input aria-label="Profile URL" value={x.url} onChange={(e) => update({ url: e.target.value.trim() })} invalid={!!errs[`social.${i}.url`]} placeholder="https://instagram.com/yourstudio" />
                    {errs[`social.${i}.url`] && <p className="mt-1 text-xs text-red-600">{errs[`social.${i}.url`]}</p>}
                  </div>
                </div>
              )}
            />
          ),
        },
        {
          id: 'navigation',
          label: 'Navigation',
          description: 'Header menu with drop-down items.',
          icon: Compass,
          errors: count('navigation'),
          render: () => (
            <div className="space-y-3">
              <p className="text-xs text-adm-muted">Drag to reorder. Items with sub-links open a drop-down menu. Keep it to 5–7 top-level items for a calm header.</p>
              <ListEditor<NavItem>
                items={s.navigation as NavItem[]}
                onChange={(v) => set('navigation', v)}
                max={10}
                addLabel="Add menu item"
                newItem={() => ({ label: '', href: '/', newTab: false, children: [] })}
                itemTitle={(n) => (
                  <span>
                    {n.label || <em className="font-normal text-adm-muted">Untitled</em>} <span className="font-normal text-adm-muted">→ {n.href}</span>
                    {n.children?.length > 0 && <span className="ml-1.5 rounded-full bg-adm-bg px-1.5 text-[11px] font-normal text-adm-muted">{n.children.length} sub-links</span>}
                  </span>
                )}
                renderItem={(n, update, i) => (
                  <>
                    <LinkFields value={n} onChange={update} errors={{ label: errs[`navigation.${i}.label`], href: errs[`navigation.${i}.href`] }} />
                    <div className="rounded-lg bg-adm-bg/60 p-2.5">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-adm-muted">Drop-down links</p>
                      <LinkListEditor value={n.children ?? []} onChange={(children) => update({ children })} max={12} errs={errs} prefix={`navigation.${i}.children`} addLabel="Add sub-link" />
                    </div>
                  </>
                )}
              />
              {s.navigation.length < 10 && (
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-adm-muted" />
                  <QuickAdd label="Quick add a menu item…" onPick={(l) => set('navigation', [...s.navigation, { ...l, newTab: false, children: [] }])} />
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'footer',
          label: 'Footer',
          description: 'Footer text, link columns and legal line.',
          icon: PanelBottom,
          errors: count('footer'),
          render: () => (
            <div className="space-y-6">
              <Field label="Footer blurb" error={errs['footer.blurb']}>
                <CountedTextarea value={s.footer.blurb} max={300} onChange={(v) => set('footer.blurb', v)} />
              </Field>
              <FieldGroup title="Link columns" description="Up to 5 columns of links.">
                <ListEditor<{ title: string; links: NavLink[] }>
                  items={s.footer.columns}
                  onChange={(v) => set('footer.columns', v)}
                  max={5}
                  addLabel="Add column"
                  newItem={() => ({ title: 'Studio', links: [] })}
                  itemTitle={(c) => (
                    <span>
                      {c.title || <em className="font-normal text-adm-muted">Untitled</em>} <span className="font-normal text-adm-muted">· {c.links.length} links</span>
                    </span>
                  )}
                  renderItem={(c, update, i) => (
                    <>
                      <div>
                        <span className="adm-label">Column title</span>
                        <Input value={c.title} maxLength={40} onChange={(e) => update({ title: e.target.value })} invalid={!!errs[`footer.columns.${i}.title`]} />
                      </div>
                      <LinkListEditor value={c.links} onChange={(links) => update({ links })} max={12} errs={errs} prefix={`footer.columns.${i}.links`} />
                    </>
                  )}
                />
              </FieldGroup>
              <Field label="Legal line" hint="e.g. © 2026 Maison Aurelle Events Pvt. Ltd. All rights reserved." error={errs['footer.legalText']}>
                <Input value={s.footer.legalText} maxLength={200} onChange={(e) => set('footer.legalText', e.target.value)} />
              </Field>
              <FieldGroup title="Legal links" description="Privacy policy, terms, cookie policy…">
                <LinkListEditor value={s.footer.legalLinks} onChange={(v) => set('footer.legalLinks', v)} max={6} errs={errs} prefix="footer.legalLinks" />
              </FieldGroup>
            </div>
          ),
        },
        {
          id: 'announcement',
          label: 'Announcement bar',
          description: 'A slim message above the header.',
          icon: Megaphone,
          errors: count('announcement'),
          render: () => (
            <div className="space-y-5">
              <Toggle checked={s.announcement.enabled} onChange={(v) => set('announcement.enabled', v)} label="Show the announcement bar" />
              <Field label={<span className="flex justify-between">Message <CharCount value={s.announcement.text} max={160} /></span>} error={errs['announcement.text']}>
                <Input value={s.announcement.text} maxLength={160} onChange={(e) => set('announcement.text', e.target.value)} placeholder="Now booking destination weddings for the 2027 season." />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Link label" error={errs['announcement.linkLabel']}>
                  <Input value={s.announcement.linkLabel} maxLength={30} onChange={(e) => set('announcement.linkLabel', e.target.value)} placeholder="Inquire" />
                </Field>
                <Field label="Link" error={errs['announcement.href']}>
                  <LinkInput value={s.announcement.href} onChange={(v) => set('announcement.href', v)} />
                </Field>
              </div>
              {s.announcement.enabled && !s.announcement.text && <Callout tone="warn">Add a message, otherwise the bar stays hidden.</Callout>}
            </div>
          ),
        },
        {
          id: 'newsletter',
          label: 'Newsletter',
          description: 'Signup heading and text.',
          icon: Newspaper,
          errors: count('newsletter'),
          render: () => (
            <div className="space-y-5">
              <Field label="Heading" error={errs['newsletter.heading']}>
                <Input value={s.newsletter.heading} maxLength={100} onChange={(e) => set('newsletter.heading', e.target.value)} />
              </Field>
              <Field label="Text" error={errs['newsletter.body']}>
                <CountedTextarea value={s.newsletter.body} max={300} onChange={(v) => set('newsletter.body', v)} />
              </Field>
              <p className="text-xs text-adm-muted">Subscribers are listed under Content library → Newsletter subscribers. Visitors must tick a consent box to subscribe.</p>
            </div>
          ),
        },
        {
          id: 'inquiry',
          label: 'Inquiry form',
          description: 'Budget ranges, services and confirmation text.',
          icon: Inbox,
          errors: count('inquiry'),
          render: () => (
            <div className="space-y-6">
              <Field label="Budget ranges" required hint="Shown as choices in the inquiry form, in this order." error={errorUnder(errs, 'inquiry.budgetRanges')}>
                <StringListEditor value={s.inquiry.budgetRanges} onChange={(v) => set('inquiry.budgetRanges', v)} max={12} maxLength={60} placeholder="e.g. ₹25 – 50 lakh" />
              </Field>
              <Field label="Services visitors can tick" hint="Leave empty to use your published services." error={errorUnder(errs, 'inquiry.serviceOptions')}>
                <StringListEditor value={s.inquiry.serviceOptions} onChange={(v) => set('inquiry.serviceOptions', v)} max={40} maxLength={80} placeholder="e.g. Décor & florals" />
              </Field>
              <Field label="Success message" hint="Shown after an inquiry is submitted." error={errs['inquiry.successMessage']}>
                <CountedTextarea value={s.inquiry.successMessage} max={400} onChange={(v) => set('inquiry.successMessage', v)} />
              </Field>
              <Toggle checked={s.inquiry.allowUploads} onChange={(v) => set('inquiry.allowUploads', v)} label="Allow visitors to attach inspiration images" />
            </div>
          ),
        },
        {
          id: 'seo',
          label: 'SEO defaults',
          description: 'Default title, description and share image.',
          icon: Search,
          errors: count('seo'),
          render: () => (
            <div className="space-y-5">
              <Field label={<span className="flex justify-between">Default title <CharCount value={s.seo.title} max={70} recommended={60} /></span>} error={errs['seo.title']}>
                <Input value={s.seo.title} maxLength={70} onChange={(e) => set('seo.title', e.target.value)} />
              </Field>
              <Field label="Default description" error={errs['seo.description']}>
                <CountedTextarea value={s.seo.description} max={170} onChange={(v) => set('seo.description', v)} />
              </Field>
              <Field label="Title template" hint="%s is replaced by each page’s title, e.g. “%s · Maison Aurelle”." error={errs['seo.titleTemplate']}>
                <Input value={s.seo.titleTemplate} maxLength={60} onChange={(e) => set('seo.titleTemplate', e.target.value)} invalid={!!errs['seo.titleTemplate']} />
              </Field>
              <Field label="Site URL" hint="Your public address, used for canonical links and the sitemap (e.g. https://maisonaurelle.com)." error={errs['seo.siteUrl']}>
                <Input type="url" value={s.seo.siteUrl} onChange={(e) => set('seo.siteUrl', e.target.value.trim())} invalid={!!errs['seo.siteUrl']} />
              </Field>
              <Field label="Default share image" hint="1200 × 630px. Used when a page has no image of its own." error={errs['seo.image']}>
                <ImageField value={s.seo.image} onChange={(v) => set('seo.image', v)} label="share image" />
              </Field>
              <Field label="Business type (structured data)">
                <Select value={s.seo.organizationType} onChange={(e) => set('seo.organizationType', e.target.value)} options={[{ value: 'EventPlanner', label: 'Event planner' }, { value: 'LocalBusiness', label: 'Local business' }, { value: 'Organization', label: 'Organisation' }]} />
              </Field>
              <Toggle checked={s.seo.noIndex} onChange={(v) => set('seo.noIndex', v)} label="Hide the whole site from search engines" />
              {s.seo.noIndex && <Callout tone="danger">Search engines will be asked not to index any page. Only use this while the site is under construction.</Callout>}
            </div>
          ),
        },
        {
          id: 'widgets',
          label: 'WhatsApp & cookies',
          description: 'Floating WhatsApp button and cookie notice.',
          icon: MessageCircle,
          errors: count('floatingWhatsApp', 'cookieNotice'),
          render: () => (
            <div className="space-y-5">
              <Toggle checked={s.floatingWhatsApp} onChange={(v) => set('floatingWhatsApp', v)} label="Show a floating WhatsApp button" />
              {s.floatingWhatsApp && !s.company.whatsapp && <Callout tone="warn">Add a WhatsApp number under Company & contact — the button only appears when a number is set.</Callout>}
              <Toggle checked={s.cookieNotice} onChange={(v) => set('cookieNotice', v)} label="Show the cookie notice to new visitors" />
              <p className="text-xs text-adm-muted">The notice is shown once per visitor and links to your privacy policy (Footer → Legal links).</p>
            </div>
          ),
        },
      ];

  return (
    <ConfigWorkspace<SiteSettings>
      title="Global content"
      subtitle="Branding, contact details, navigation and footer"
      configKey="site"
      editor={editor}
      panels={panels}
      validate={() => issues}
      previewMessage={() => (s ? { site: s, theme: previewTheme() } : null)}
    />
  );
}
