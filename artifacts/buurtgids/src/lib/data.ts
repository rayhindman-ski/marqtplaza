export type Category = 'Museums' | 'Tours' | 'Family' | 'Entertainment' | 'Outdoors' | 'Markets';
export const ALL_CATEGORIES: Category[] = ['Museums', 'Tours', 'Family', 'Entertainment', 'Outdoors', 'Markets'];

export interface Location {
  id: string;
  name: string;
  postcodes: string[];
  description: string;
  mapType: 'amsterdam' | 'rotterdam' | 'utrecht' | 'denhaag' | 'eindhoven';
  neighborhoods: string[];
  lat: number;
  lng: number;
  zoom: number;
  neighborhoodCoords: Record<string, { lat: number; lng: number; zoom: number }>;
}

export interface Marker {
  id: string;
  locationId: string;
  category: Category;
  name: string;
  description: string;
  x: number;
  y: number;
  details: string;
  lat: number;
  lng: number;
  /** Link back to the crawled source that listed this activity. */
  sourceUrl?: string;
}

export const LOCATIONS: Location[] = [
  {
    id: 'ams',
    name: 'Amsterdam',
    postcodes: ['1011', '1012', '1013', '1014'],
    description: 'The historic capital, rich in canals and culture.',
    mapType: 'amsterdam',
    lat: 52.3676,
    lng: 4.9041,
    zoom: 13,
    neighborhoods: ['Jordaan', 'De Pijp', 'Oud-West'],
    neighborhoodCoords: {
      Jordaan:    { lat: 52.3748, lng: 4.8817, zoom: 15 },
      'De Pijp':  { lat: 52.3527, lng: 4.8975, zoom: 15 },
      'Oud-West': { lat: 52.3672, lng: 4.8693, zoom: 15 },
    },
  },
  {
    id: 'rot',
    name: 'Rotterdam',
    postcodes: ['3011', '3012', '3013'],
    description: 'Modern architecture and the mighty Maas.',
    mapType: 'rotterdam',
    lat: 51.9244,
    lng: 4.4777,
    zoom: 13,
    neighborhoods: ['Kop van Zuid', 'Kralingen', 'Delfshaven'],
    neighborhoodCoords: {
      'Kop van Zuid': { lat: 51.9055, lng: 4.4833, zoom: 15 },
      Kralingen:      { lat: 51.9231, lng: 4.5249, zoom: 15 },
      Delfshaven:     { lat: 51.9101, lng: 4.4425, zoom: 15 },
    },
  },
  {
    id: 'utr',
    name: 'Utrecht',
    postcodes: ['3511', '3512'],
    description: 'The beating heart of the Netherlands.',
    mapType: 'utrecht',
    lat: 52.0907,
    lng: 5.1214,
    zoom: 14,
    neighborhoods: ['Wittevrouwen', 'Lombok', 'Oudwijk'],
    neighborhoodCoords: {
      Wittevrouwen: { lat: 52.0942, lng: 5.1318, zoom: 15 },
      Lombok:       { lat: 52.0876, lng: 5.1011, zoom: 15 },
      Oudwijk:      { lat: 52.0879, lng: 5.1363, zoom: 15 },
    },
  },
  {
    id: 'dhg',
    name: 'The Hague',
    postcodes: ['2511', '2512'],
    description: 'City of peace, justice, and the sea.',
    mapType: 'denhaag',
    lat: 52.0705,
    lng: 4.3007,
    zoom: 13,
    neighborhoods: ['Scheveningen', 'Statenkwartier', 'Schilderswijk'],
    neighborhoodCoords: {
      Scheveningen:   { lat: 52.1059, lng: 4.2742, zoom: 14 },
      Statenkwartier: { lat: 52.0893, lng: 4.2780, zoom: 15 },
      Schilderswijk:  { lat: 52.0666, lng: 4.3154, zoom: 15 },
    },
  },
  {
    id: 'ein',
    name: 'Eindhoven',
    postcodes: ['5611', '5612'],
    description: 'The city of light and innovation.',
    mapType: 'eindhoven',
    lat: 51.4416,
    lng: 5.4697,
    zoom: 14,
    neighborhoods: ['Strijp-S', 'Woensel', 'Stratum'],
    neighborhoodCoords: {
      'Strijp-S': { lat: 51.4478, lng: 5.4489, zoom: 15 },
      Woensel:    { lat: 51.4663, lng: 5.4752, zoom: 15 },
      Stratum:    { lat: 51.4313, lng: 5.4872, zoom: 15 },
    },
  },
];

export const MARKERS: Marker[] = [
  // ── Amsterdam ──────────────────────────────────────────────────────────
  { id: 'm1',  locationId: 'ams', category: 'Markets',       name: 'De Kade Roastery',      description: 'Specialty coffee roasted locally in small batches.',                   x: 40, y: 55, details: 'Open until 17:00',      lat: 52.3748, lng: 4.8820 },
  { id: 'm2',  locationId: 'ams', category: 'Markets',       name: 'Boutique Lokaal',        description: 'Handcrafted goods from independent local artisans.',                   x: 65, y: 35, details: 'Open until 18:00',      lat: 52.3660, lng: 4.9030 },
  { id: 'm3',  locationId: 'ams', category: 'Entertainment', name: 'Gracht Festival',        description: 'Live classical music performance right on the canals.',                x: 50, y: 50, details: 'Aug 12, 19:00',          lat: 52.3700, lng: 4.8980 },
  { id: 'm4',  locationId: 'ams', category: 'Outdoors',      name: 'Vondelpark Run',         description: 'Weekly community 5k run followed by coffee.',                         x: 25, y: 75, details: 'Sunday, 09:00',          lat: 52.3580, lng: 4.8681 },
  { id: 'm5',  locationId: 'ams', category: 'Markets',       name: 'Bakkerij Boter',         description: '2 for 1 on all freshly baked croissants before noon.',                x: 75, y: 45, details: 'Valid today',            lat: 52.3724, lng: 4.9110 },
  { id: 'm6',  locationId: 'ams', category: 'Markets',       name: 'Café de Jaren',          description: 'Happy hour on local draft beers and bitterballen.',                   x: 45, y: 65, details: '17:00–19:00',            lat: 52.3681, lng: 4.8960 },

  // ── Rotterdam ──────────────────────────────────────────────────────────
  { id: 'm7',  locationId: 'rot', category: 'Markets',       name: 'Maas Design',            description: 'Industrial furniture showroom featuring Rotterdam designers.',         x: 30, y: 60, details: 'Open until 18:00',      lat: 51.9101, lng: 4.4820 },
  { id: 'm8',  locationId: 'rot', category: 'Tours',         name: 'Dakendagen',             description: 'Rooftop discovery tours showing unseen city views.',                  x: 60, y: 40, details: 'June 4, 10:00',          lat: 51.9244, lng: 4.4777 },
  { id: 'm9',  locationId: 'rot', category: 'Markets',       name: 'Markthal Bites',         description: 'Free tasting platter when ordering two signature drinks.',            x: 55, y: 55, details: 'Valid this week',        lat: 51.9200, lng: 4.4840 },
  { id: 'm19', locationId: 'rot', category: 'Markets',       name: 'Kop van Zuid Roasters',  description: 'Third-wave coffee bar overlooking the harbor.',                       x: 70, y: 30, details: 'Open until 16:00',      lat: 51.9055, lng: 4.4833 },
  { id: 'm20', locationId: 'rot', category: 'Outdoors',      name: 'Erasmusbrug Run',        description: 'Night run across the iconic Swan bridge.',                           x: 50, y: 50, details: 'Friday, 20:00',          lat: 51.9118, lng: 4.4845 },
  { id: 'm27', locationId: 'rot', category: 'Tours',         name: 'Kralingen Culture Walk', description: 'A self-guided route through local parks, galleries, and cafés.',     x: 82, y: 24, details: 'Available daily',        lat: 51.9231, lng: 4.5249 },
  { id: 'm28', locationId: 'rot', category: 'Markets',       name: 'Delfshaven Makers Market', description: 'Weekend market celebrating local makers and vintage finds.',       x: 12, y: 62, details: 'Saturday, 10:00',       lat: 51.9101, lng: 4.4425 },

  // ── Utrecht ────────────────────────────────────────────────────────────
  { id: 'm10', locationId: 'utr', category: 'Markets',       name: 'Domstad Books',          description: 'Rare finds and cozy reading nooks in a historic cellar.',            x: 50, y: 45, details: 'Open until 20:00',      lat: 52.0907, lng: 5.1214 },
  { id: 'm11', locationId: 'utr', category: 'Markets',       name: 'Oudegracht Market',      description: 'Vintage and artisan goods along the sunken canal.',                  x: 45, y: 55, details: 'Saturday, 08:00',       lat: 52.0882, lng: 5.1160 },
  { id: 'm12', locationId: 'utr', category: 'Entertainment', name: 'Bierlokaal',             description: 'Tasting flight of 4 local microbrews for €10.',                     x: 60, y: 40, details: 'Valid evenings',         lat: 52.0942, lng: 5.1318 },
  { id: 'm21', locationId: 'utr', category: 'Entertainment', name: 'TivoliVredenburg Late',  description: 'Intimate jazz sessions in the rooftop lounge.',                     x: 40, y: 60, details: 'Tonight, 22:00',          lat: 52.0925, lng: 5.1179 },
  { id: 'm22', locationId: 'utr', category: 'Markets',       name: 'Kanaalzicht Cafe',       description: 'Plant-based lunchroom with terrace seating.',                        x: 60, y: 70, details: 'Open until 16:00',      lat: 52.0876, lng: 5.1011 },

  // ── The Hague — real activities from crawled sources ──────────────────
  // Museums (Wannado, FijnUit, editorial sources)
  { id: 'dhg-m1', locationId: 'dhg', category: 'Museums', name: 'Mauritshuis',
    description: 'Home to Vermeer\'s Girl with a Pearl Earring and Rembrandt\'s Anatomy Lesson.',
    x: 54, y: 52, details: 'Open Tue–Sun 10:00–18:00', lat: 52.0798, lng: 4.3141,
    sourceUrl: 'https://www.mauritshuis.nl' },
  { id: 'dhg-m2', locationId: 'dhg', category: 'Museums', name: 'Kunstmuseum Den Haag',
    description: 'World\'s largest Mondrian collection in a stunning 1935 Art Deco building.',
    x: 30, y: 38, details: 'Open Tue–Sun 10:00–17:00', lat: 52.0873, lng: 4.2896,
    sourceUrl: 'https://www.kunstmuseum.nl' },
  { id: 'dhg-m3', locationId: 'dhg', category: 'Museums', name: 'Panorama Mesdag',
    description: 'Step inside an 1881 circular painting of Scheveningen — the world\'s largest panorama.',
    x: 38, y: 43, details: 'Open daily 10:00–17:00', lat: 52.0844, lng: 4.2977,
    sourceUrl: 'https://www.panorama-mesdag.nl' },
  { id: 'dhg-m4', locationId: 'dhg', category: 'Museums', name: 'Escher in Het Paleis',
    description: 'M.C. Escher\'s mind-bending prints displayed inside a former royal palace on Lange Voorhout.',
    x: 57, y: 40, details: 'Open Tue–Sun 11:00–17:00', lat: 52.0863, lng: 4.3172,
    sourceUrl: 'https://www.escherinhetpaleis.nl' },
  { id: 'dhg-m5', locationId: 'dhg', category: 'Museums', name: 'Louwman Museum',
    description: 'The world\'s oldest private car collection — over 230 historic vehicles from 1886 onward.',
    x: 26, y: 88, details: 'Open Tue–Sun 10:00–17:00', lat: 52.0573, lng: 4.2862,
    sourceUrl: 'https://www.louwmanmuseum.nl' },

  // Tours (Enter The Hague, seeTheHague, DagjeWeg.NL)
  { id: 'dhg-t1', locationId: 'dhg', category: 'Tours', name: 'Enter The Hague: Free Walking Tour',
    description: 'Tip-based guided tour of The Hague\'s history, architecture, and royal highlights.',
    x: 53, y: 53, details: 'Daily 10:30 & 14:00', lat: 52.0793, lng: 4.3130,
    sourceUrl: 'https://www.enterthehague.com/the-hague-free-walking-tour' },
  { id: 'dhg-t2', locationId: 'dhg', category: 'Tours', name: 'seeTheHague Bike Tour',
    description: 'Explore the city\'s best spots by bike with a knowledgeable local guide.',
    x: 41, y: 68, details: 'Book in advance', lat: 52.0705, lng: 4.3007,
    sourceUrl: 'https://seethehague.nl/activiteiten-in-den-haag/' },
  { id: 'dhg-t3', locationId: 'dhg', category: 'Tours', name: 'Street Art Tour: Binckhorst',
    description: 'Guided tour of The Hague\'s emerging creative district — murals and urban art.',
    x: 51, y: 90, details: 'Weekends, 13:00', lat: 52.0567, lng: 4.3311,
    sourceUrl: 'https://www.enterthehague.com/street-art-tour-the-hague' },
  { id: 'dhg-t4', locationId: 'dhg', category: 'Tours', name: 'Escape the City Den Haag',
    description: 'Solve the mystery of Hugo de Groot\'s escape in this outdoor historical city game.',
    x: 52, y: 55, details: 'Available daily', lat: 52.0771, lng: 4.3121,
    sourceUrl: 'https://www.dagjeweg.nl/tip/13599/Escape-the-City-Den-Haag' },
  { id: 'dhg-t5', locationId: 'dhg', category: 'Tours', name: 'Vredespaleis Visitor Centre',
    description: 'Visit the iconic seat of international justice — guided tours and an interactive visitor centre.',
    x: 31, y: 31, details: 'Visitor centre open daily', lat: 52.0921, lng: 4.2921,
    sourceUrl: 'https://www.vredespaleis.nl' },

  // Family (Wannado, FijnUit)
  { id: 'dhg-f1', locationId: 'dhg', category: 'Family', name: 'Madurodam',
    description: 'Explore a 1:25 scale miniature Netherlands — windmills, canals, and a working airport.',
    x: 45, y: 20, details: 'Open daily 09:00–19:00', lat: 52.0978, lng: 4.3046,
    sourceUrl: 'https://www.dagjeweg.nl' },
  { id: 'dhg-f2', locationId: 'dhg', category: 'Family', name: 'SEA LIFE Scheveningen',
    description: 'Walk through an underwater ocean tunnel and discover hundreds of sea creatures.',
    x: 13, y: 5, details: 'Open daily 10:00–19:00', lat: 52.1073, lng: 4.2734,
    sourceUrl: 'https://www.fijnuit.nl/47/sea-life-scheveningen' },
  { id: 'dhg-f3', locationId: 'dhg', category: 'Family', name: 'Museon-Omniversum',
    description: 'Hands-on science museum with a 360° dome cinema showing Earth and space films.',
    x: 32, y: 57, details: 'Open daily 10:00–17:00', lat: 52.0762, lng: 4.2927,
    sourceUrl: 'https://wannado.nl/e/museon-omniversum-den-haag' },
  { id: 'dhg-f4', locationId: 'dhg', category: 'Family', name: 'Zandkasteel Scheveningen',
    description: 'Indoor beach playground for children — slides, sandpits, and splash pools.',
    x: 12, y: 12, details: 'Open daily 10:00–18:00', lat: 52.1030, lng: 4.2720,
    sourceUrl: 'https://www.fijnuit.nl' },

  // Entertainment (Wannado top-reviewed, FijnUit, Stappen in Den Haag)
  { id: 'dhg-e1', locationId: 'dhg', category: 'Entertainment', name: 'Escape Room Operation Exit',
    description: 'Award-winning escape rooms rated ★4.9 by 1,294 Google reviewers — book ahead for weekends.',
    x: 52, y: 56, details: 'Open daily 10:00–23:00', lat: 52.0771, lng: 4.3121,
    sourceUrl: 'https://wannado.nl/e/escape-room-operation-exit-den-haag' },
  { id: 'dhg-e2', locationId: 'dhg', category: 'Entertainment', name: 'Amaze VR Den Haag',
    description: 'Full-body VR experiences: horror, adventure, and multiplayer gaming in shared virtual worlds.',
    x: 51, y: 58, details: 'Open Tue–Sun 11:00–22:00', lat: 52.0752, lng: 4.3119,
    sourceUrl: 'https://wannado.nl/e/amaze-vr-den-haag' },
  { id: 'dhg-e3', locationId: 'dhg', category: 'Entertainment', name: 'Pathé Scheveningen',
    description: 'Multiplex cinema on the Scheveningen seafront — latest releases with sea views.',
    x: 13, y: 11, details: 'Check times online', lat: 52.1041, lng: 4.2736,
    sourceUrl: 'https://www.fijnuit.nl/95/pathe-scheveningen' },
  { id: 'dhg-e4', locationId: 'dhg', category: 'Entertainment', name: 'Zuiderstrandtheater',
    description: 'Striking theatre right on Scheveningen beach — a unique setting for live performances.',
    x: 13, y: 14, details: 'See website for programme', lat: 52.1026, lng: 4.2743,
    sourceUrl: 'https://stappenindenhaag.nl' },

  // Outdoors (DenHaag.com, Reisroutes)
  { id: 'dhg-o1', locationId: 'dhg', category: 'Outdoors', name: 'Scheveningen Beach & Boulevard',
    description: '11 km of sandy beach with beach bars, water sports, and unforgettable North Sea sunsets.',
    x: 13, y: 8, details: 'Open 24/7', lat: 52.1059, lng: 4.2742,
    sourceUrl: 'https://denhaag.com/en/things-to-do' },
  { id: 'dhg-o2', locationId: 'dhg', category: 'Outdoors', name: 'Westduinpark & Kijkduin',
    description: 'Sandy dune nature reserve stretching to Kijkduin beach — ideal for hiking and cycling.',
    x: 5, y: 55, details: 'Open 24/7', lat: 52.0769, lng: 4.2358,
    sourceUrl: 'https://www.reisroutes.nl/stadswandelingen/den-haag/' },
  { id: 'dhg-o3', locationId: 'dhg', category: 'Outdoors', name: 'Haagse Bos',
    description: 'Ancient royal forest on the city\'s edge — running trails, deer, and a hidden palace.',
    x: 83, y: 53, details: 'Open daily, free entry', lat: 52.0780, lng: 4.3430,
    sourceUrl: 'https://denhaag.com/en/things-to-do' },

  // Markets (Wannado, DagjeWeg.NL)
  { id: 'dhg-mk1', locationId: 'dhg', category: 'Markets', name: 'Haagse Markt',
    description: 'One of Europe\'s largest outdoor markets — fresh produce, street food, and world flavours.',
    x: 47, y: 76, details: 'Mon, Wed, Fri & Sat 08:00–17:00', lat: 52.0653, lng: 4.3072,
    sourceUrl: 'https://wannado.nl/wat-te-doen/den-haag' },
  { id: 'dhg-mk2', locationId: 'dhg', category: 'Markets', name: 'Lange Voorhout Antique Market',
    description: 'Antique books, art, and curiosities under the historic linden trees of Lange Voorhout.',
    x: 49, y: 42, details: 'Sunday 11:00–17:00', lat: 52.0848, lng: 4.3093,
    sourceUrl: 'https://www.dagjeweg.nl' },

  // ── Eindhoven ──────────────────────────────────────────────────────────
  { id: 'm16', locationId: 'ein', category: 'Entertainment', name: 'Strijp-S Tech Lab',        description: 'Open workspace with 3D printing and prototyping tools.',         x: 35, y: 45, details: '24/7 Access',            lat: 51.4478, lng: 5.4489 },
  { id: 'm17', locationId: 'ein', category: 'Tours',         name: 'Glow Prep',                description: 'Behind the scenes tour of the upcoming light festival.',          x: 60, y: 60, details: 'Oct 15, 19:00',          lat: 51.4416, lng: 5.4697 },
  { id: 'm18', locationId: 'ein', category: 'Museums',       name: 'Philips Heritage Museum',  description: 'Half price entry to the historic Philips museum.',               x: 50, y: 40, details: 'Valid weekends',           lat: 51.4400, lng: 5.4760 },
  { id: 'm25', locationId: 'ein', category: 'Museums',       name: 'Design Academy Show',      description: 'Graduation exhibition from emerging designers.',                x: 45, y: 50, details: 'Starts tomorrow',          lat: 51.4430, lng: 5.4730 },
  { id: 'm26', locationId: 'ein', category: 'Markets',       name: 'Klokgebouw Coffee',        description: 'Industrial coffee bar serving single-origin beans.',              x: 30, y: 40, details: 'Open until 18:00',        lat: 51.4480, lng: 5.4510 },
  { id: 'm29', locationId: 'ein', category: 'Markets',       name: 'Woensel Food & Music Night', description: 'An evening of local food stalls and live neighbourhood music.', x: 62, y: 20, details: 'Friday, 18:00',          lat: 51.4663, lng: 5.4752 },
];
