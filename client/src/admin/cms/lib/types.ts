import type { DraftSection, Seo } from '@maison/shared';

export interface PageRow {
  id: string;
  slug: string;
  kind: 'HOME' | 'ABOUT' | 'CONTACT' | 'STANDARD' | 'LEGAL';
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  hasUnpublished: boolean;
  publishedVersion: number;
  updatedAt: string;
}

export interface PageDraftDoc {
  title?: string;
  seo?: Partial<Seo>;
  featuredImage?: string;
  sections?: DraftSection[];
}

export interface PageDetail extends PageRow {
  draft: PageDraftDoc;
  createdAt: string;
}

export interface VersionRow {
  id: string;
  version: number;
  note: string;
  createdAt: string;
  publishedById: string | null;
}

export interface ConfigDoc<T> {
  draft: T;
  published: T;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  lastPublishedAt: string | null;
}

export interface MediaAsset {
  id: string;
  url: string;
  provider: string;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  filename: string;
  alt: string;
  caption: string;
  credit: string;
  folder: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MediaMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  folders?: { name: string; count: number }[];
}

export interface UsageRow {
  type: string;
  title: string;
}
