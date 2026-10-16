import type { Section, SectionType } from '@maison/shared';
import type { PublicPage } from '@/lib/types';
import { BlogSection, FaqSection, LogosSection, TeamSection, TestimonialsSection } from './social';
import { CategoriesSection, FeaturedProjectsSection, GallerySection, PackagesSection, ServicesSection, VenuesSection } from './showcase';
import { ContactSection, CtaSection, InquiryFormSection, NewsletterSection } from './conversion';
import { FeaturesSection, ImageTextSection, IntroSection, ProcessSection, QuoteSection, RichTextSection, StatsSection, VideoSection } from './story';
import { HeroSection } from './Hero';
import { Stage3DSection } from './Stage3D';
import type { SectionComponent } from './types';

/** Section type → renderer. Every type in `sectionPropsSchemas` has an entry (enforced by the mapped type). */
export const SECTION_RENDERERS: { [K in SectionType]: SectionComponent<K> } = {
  hero: HeroSection,
  intro: IntroSection,
  categories: CategoriesSection,
  featuredProjects: FeaturedProjectsSection,
  services: ServicesSection,
  features: FeaturesSection,
  process: ProcessSection,
  gallery: GallerySection,
  testimonials: TestimonialsSection,
  packages: PackagesSection,
  venues: VenuesSection,
  stats: StatsSection,
  logos: LogosSection,
  faq: FaqSection,
  cta: CtaSection,
  inquiryForm: InquiryFormSection,
  contact: ContactSection,
  newsletter: NewsletterSection,
  richText: RichTextSection,
  imageText: ImageTextSection,
  video: VideoSection,
  stage3d: Stage3DSection,
  team: TeamSection,
  blog: BlogSection,
  quote: QuoteSection,
};

export function SectionRenderer({ section, data, index, preview }: { section: Section; data: unknown; index: number; preview?: boolean }) {
  if (!section.enabled) return null;
  const C = SECTION_RENDERERS[section.type] as SectionComponent<SectionType>;
  if (!C) return null;
  return <C section={section as never} data={data} index={index} preview={preview} />;
}

/** True when the page opens with a full-bleed photographic hero (the header can then sit transparently over it). */
export function startsWithDarkHero(sections: Section[]) {
  const first = sections.find((s) => s.enabled);
  return !!first && first.type === 'hero' && first.props.variant !== 'split';
}

/** Renders a CMS page's enabled sections in order. */
export function PageRenderer({ page, preview }: { page: Pick<PublicPage, 'sections' | 'data'>; preview?: boolean }) {
  const visible = page.sections.filter((s) => s.enabled);
  return (
    <>
      {visible.map((s, i) => (
        <SectionRenderer key={s.id} section={s} data={page.data?.[s.id]} index={i} preview={preview} />
      ))}
    </>
  );
}
