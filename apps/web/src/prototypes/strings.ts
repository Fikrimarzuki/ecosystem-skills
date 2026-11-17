/**
 * Indonesian for the development-only prototype pages (Concept B and the prototype index). They ship only in the
 * prototype chunk; strings the site already translates fall back to locales/id.ts. prototypes.test.tsx checks that
 * every pt() string has a translation here or there, and that none is duplicated.
 */
export const PT_ID: Record<string, string> = {
  'Skill Library': 'Perpustakaan Skill',
  'Guild Hall': 'Balai Serikat',
  'Development reference: Concept B was not selected. The landing page is Concept A.':
    'Referensi pengembangan: Konsep B tidak dipilih. Halaman utama memakai Konsep A.',
  'All prototypes': 'Semua prototipe',
  'Landing prototypes': 'Prototipe halaman utama',
  'Development preview only. Not linked from the site, not in the production build and not cached for offline use.':
    'Pratinjau pengembangan saja. Tidak ditautkan dari situs, tidak ada di build produksi, dan tidak disimpan untuk penggunaan luring.',
  'Concept A: Living Library (the landing page)': 'Konsep A: Perpustakaan Hidup (halaman utama)',
  'Concept B: Archive Overworld (reference)': 'Konsep B: Peta Dunia Arsip (referensi)',
};
