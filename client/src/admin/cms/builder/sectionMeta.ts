import { BarChart3, BookOpen, Box, Clapperboard, FileText, Grid3x3, HelpCircle, Image, Images, LayoutTemplate, ListOrdered, Mail, MapPin, Megaphone, MessageSquareQuote, Newspaper, Package, Phone, Quote, Sparkles, Star, Users, Wrench, type LucideIcon } from 'lucide-react';
import { SECTION_META, type DraftSection, type SectionType } from '@maison/shared';

export const SECTION_ICONS: Record<SectionType, LucideIcon> = {
  hero: Clapperboard,
  intro: BookOpen,
  categories: Grid3x3,
  featuredProjects: Star,
  services: Wrench,
  features: Sparkles,
  process: ListOrdered,
  gallery: Images,
  testimonials: MessageSquareQuote,
  packages: Package,
  venues: MapPin,
  stats: BarChart3,
  logos: LayoutTemplate,
  faq: HelpCircle,
  cta: Megaphone,
  inquiryForm: FileText,
  contact: Phone,
  newsletter: Mail,
  richText: Newspaper,
  imageText: Image,
  video: Clapperboard,
  stage3d: Box,
  team: Users,
  blog: Newspaper,
  quote: Quote,
};

export const GROUP_ORDER = ['Hero & story', 'Showcase', 'Social proof', 'Conversion', 'Content'] as const;

/** Human label for a section in the list: its heading, otherwise the section type name. */
export function sectionLabel(s: DraftSection): string {
  const p = s.props as Record<string, unknown>;
  const h = [p.heading, p.headline, s.type === 'quote' ? p.quote : undefined].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return h?.trim() || SECTION_META[s.type]?.label || s.type;
}
