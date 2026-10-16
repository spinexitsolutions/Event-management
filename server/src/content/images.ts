/**
 * Sample photography (Unsplash licence: free to use, no permission needed; attribution appreciated).
 * These are starting images only — replace them with the company's own licensed event photography
 * in Admin → Media. Image URLs are requested at sensible widths via Unsplash's image CDN parameters.
 */
const u = (id: string, w = 2000) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const IMG = {
  weddingCouple: u('photo-1519741497674-611481863552'),
  weddingOutdoor: u('photo-1511285560929-80b456fea0bc'),
  weddingBouquet: u('photo-1465495976277-4387d4b0b4c6'),
  weddingAisle: u('photo-1519225421980-715cb0215aed'),
  receptionLights: u('photo-1511795409834-ef04bbd61622'),
  tableSetting: u('photo-1469371670807-013ccf25f16a'),
  receptionTables: u('photo-1505236858219-8359eb29e329'),
  ballroom: u('photo-1519167758481-83f550bb49b3'),
  confetti: u('photo-1464366400600-7168b8af9bc3'),
  balloons: u('photo-1530103862676-de8c9debad1d'),
  toast: u('photo-1519671482749-fd09be7ccebf'),
  celebrating: u('photo-1528605248644-14dd04022da1'),
  sparklers: u('photo-1533174072545-7a4b6ad7a6c3'),
  partyCrowd: u('photo-1527529482837-4698179dc6ce'),
  eventLights: u('photo-1492684223066-81342ee5ff30'),
  conference: u('photo-1540575467063-178a50c2df87'),
  conferenceHall: u('photo-1505373877841-8d25f7d46678'),
  speaker: u('photo-1475721027785-f74eccf877e2'),
  businessEvent: u('photo-1511578314322-379afb476865'),
  concert: u('photo-1514525253161-7a46d19cd819'),
  festival: u('photo-1501281668745-f7f57925c3b4'),
  concertLights: u('photo-1470229722913-7c0e2dbbafd3'),
  concertCrowd: u('photo-1459749411175-04bf5292ceea'),
  stageCrowd: u('photo-1506157786151-b8491531f063'),
  fineDining: u('photo-1414235077428-338989a2e8c0'),
  buffet: u('photo-1555244162-803834f70033'),
  plated: u('photo-1467003909585-2f8a72700288'),
};
export type ImgKey = keyof typeof IMG;
export const alt: Record<ImgKey, string> = {
  weddingCouple: 'Bride and groom holding hands at their wedding',
  weddingOutdoor: 'Couple walking together outdoors on their wedding day',
  weddingBouquet: 'Bridal bouquet of soft white and blush flowers',
  weddingAisle: 'Wedding ceremony aisle lined with flowers',
  receptionLights: 'Reception tables under warm string lights at dusk',
  tableSetting: 'Elegant wedding table setting with glassware and florals',
  receptionTables: 'Banquet tables dressed for a wedding reception',
  ballroom: 'Grand ballroom with chandeliers prepared for an event',
  confetti: 'Guests celebrating under falling confetti',
  balloons: 'Birthday celebration with balloons and decor',
  toast: 'Friends raising glasses in a celebratory toast',
  celebrating: 'Guests celebrating together at a private party',
  sparklers: 'Sparklers lighting up a night-time celebration',
  partyCrowd: 'Guests dancing at an evening celebration',
  eventLights: 'Audience under dramatic stage lighting at a live event',
  conference: 'Audience seated at a corporate conference',
  conferenceHall: 'Conference hall set for a keynote presentation',
  speaker: 'Speaker presenting on stage at a business event',
  businessEvent: 'Delegates networking at a corporate event',
  concert: 'Concert stage with coloured lights and haze',
  festival: 'Festival crowd in front of an illuminated stage',
  concertLights: 'Crowd silhouetted against bright concert lights',
  concertCrowd: 'Fans with raised hands at a live music performance',
  stageCrowd: 'Live performance with spotlights over the audience',
  fineDining: 'Fine-dining table service at an event',
  buffet: 'Catering buffet with plated dishes',
  plated: 'Chef-plated dish presented for a gala dinner',
};
export const img = (k: ImgKey) => ({ url: IMG[k], alt: alt[k], caption: '' });
