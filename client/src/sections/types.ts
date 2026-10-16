import type { Section, SectionType } from '@maison/shared';

export type SectionOf<K extends SectionType> = Extract<Section, { type: K }>;

export interface SectionRenderProps<K extends SectionType> {
  section: SectionOf<K>;
  /** Pre-resolved data from `page.data[section.id]` (data-backed sections only). */
  data: unknown;
  /** Position on the page (0 = first) — the first section carries the page's h1. */
  index: number;
  /** Rendered inside the CMS live preview (shows hints for empty data-backed sections). */
  preview?: boolean;
}

export type SectionComponent<K extends SectionType> = (props: SectionRenderProps<K>) => JSX.Element | null;

/** Narrow unknown data to an array (sections with no data render nothing). */
export const asList = <T,>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);
