export interface VenueImage {
  url: string;
  alt: string;
  caption: string;
}
export type VenueOwnership = 'PARTNER' | 'EXTERNAL' | 'COMPANY';
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Body accepted by /admin/content/venues (see server content.schemas venueInput). */
export interface VenueInput {
  slug: string;
  name: string;
  city: string;
  region: string;
  address: string;
  description: string;
  capacityMin: number | null;
  capacityMax: number | null;
  facilities: string[];
  images: VenueImage[];
  coverImage: string;
  rentalPriceMinor: number | null;
  rentalNotes: string;
  ownership: VenueOwnership;
  vendorId: string | null;
  isPublic: boolean;
  exclusive: boolean;
  lat: number | null;
  lng: number | null;
  status: ContentStatus;
  sortOrder: number;
}

export interface VenueRecord extends VenueInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  vendor: { id: string; name: string } | null;
}

export const emptyVenue: VenueInput = {
  slug: '',
  name: '',
  city: '',
  region: '',
  address: '',
  description: '',
  capacityMin: null,
  capacityMax: null,
  facilities: [],
  images: [],
  coverImage: '',
  rentalPriceMinor: null,
  rentalNotes: '',
  ownership: 'PARTNER',
  vendorId: null,
  isPublic: false,
  exclusive: true,
  lat: null,
  lng: null,
  status: 'PUBLISHED',
  sortOrder: 0,
};

export const VENUE_KEYS = Object.keys(emptyVenue) as (keyof VenueInput)[];
export const toVenueInput = (r: VenueRecord): VenueInput => Object.fromEntries(VENUE_KEYS.map((k) => [k, r[k] ?? emptyVenue[k]])) as unknown as VenueInput;
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
