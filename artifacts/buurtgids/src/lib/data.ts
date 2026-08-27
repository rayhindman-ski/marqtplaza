export type Category = 'Museums' | 'Tours' | 'Family' | 'Entertainment' | 'Outdoors' | 'Markets' | 'Businesses' | 'Food & Drink' | 'Social map';
export const EVENT_CATEGORIES: Category[] = ['Museums', 'Tours', 'Family', 'Entertainment', 'Outdoors', 'Markets'];
export const ALL_CATEGORIES: Category[] = [...EVENT_CATEGORIES, 'Food & Drink', 'Social map', 'Businesses'];

export type SocialMapCategory =
  | 'Geldzaken'
  | 'Gezin en opvoeden'
  | 'Gezondheid'
  | 'Heilige plaatsen'
  | "Hobby's en interesses"
  | 'Ondersteuning'
  | 'Ontmoeten en samenleven'
  | 'Sporten en bewegen'
  | 'Taal en computer'
  | 'Vervoer'
  | 'Werk en opleiding'
  | 'Wonen en huishouden'
  | 'Zorg voor een naaste';

export const SOCIAL_MAP_CATEGORIES: SocialMapCategory[] = [
  'Geldzaken',
  'Gezin en opvoeden',
  'Gezondheid',
  'Heilige plaatsen',
  "Hobby's en interesses",
  'Ondersteuning',
  'Ontmoeten en samenleven',
  'Sporten en bewegen',
  'Taal en computer',
  'Vervoer',
  'Werk en opleiding',
  'Wonen en huishouden',
  'Zorg voor een naaste',
];

export type BusinessCategory =
  | 'Retail & Shopping'
  | 'Food & Drink'
  | 'Health & Wellness'
  | 'Beauty & Personal Care'
  | 'Professional Services'
  | 'Finance & Legal'
  | 'Home & Repair'
  | 'Automotive & Mobility'
  | 'Education & Childcare'
  | 'Hospitality & Travel'
  | 'Arts, Culture & Entertainment'
  | 'Fitness & Sports';

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  'Retail & Shopping',
  'Food & Drink',
  'Health & Wellness',
  'Beauty & Personal Care',
  'Professional Services',
  'Finance & Legal',
  'Home & Repair',
  'Automotive & Mobility',
  'Education & Childcare',
  'Hospitality & Travel',
  'Arts, Culture & Entertainment',
  'Fitness & Sports',
];

export type ListingSource = 'google_maps' | 'openstreetmap' | 'curated' | 'source_scan';
export type SocialMapReviewStatus = 'verified' | 'review_due' | 'changed' | 'unavailable';
export type EventPriceType = 'free' | 'low-cost' | 'paid' | 'unknown';
export type EventMealType = 'community-meal' | 'food-support';
export type EventActivityKind = 'community' | 'culture' | 'learning' | 'movement' | 'meal' | 'family' | 'market' | 'outdoor' | 'entertainment';

export interface Location {
  id: string;
  name: string;
  nameNl: string;
  lat: number;
  lng: number;
  zoom: number;
  mapType: 'amsterdam' | 'rotterdam' | 'utrecht' | 'denhaag' | 'eindhoven';
  postcodes: string[];
  neighborhoods: string[];
  neighborhoodCoords: Record<string, { lat: number; lng: number; zoom: number }>;
}

export interface Marker {
  id: string;
  locationId: string;
  category: Category;
  name: string;
  /** Provider-supplied street address when one is available. */
  address?: string;
  description: string;
  startsAt?: string | null;
  openingTimes?: string | null;
  venue?: string | null;
  x: number;
  y: number;
  details: string;
  lat: number;
  lng: number;
  /** Link back to the website where this activity was listed. */
  sourceUrl?: string;
  /** Normalized business taxonomy label, present for business listings. */
  businessCategory?: BusinessCategory;
  /** Provider or editorial source for this listing. */
  source?: ListingSource;
  /** Human-readable publisher or provider that listed this item. */
  sourceName?: string;
  neighborhood?: string;
  socialCategory?: SocialMapCategory;
  officialUrl?: string;
  sourcePageUrl?: string;
  snapshotDate?: string;
  reviewStatus?: SocialMapReviewStatus;
  reviewReason?: string | null;
  lastCheckedAt?: string;
  nextReviewAt?: string;
  isCancelled?: boolean;
  sourceGroup?: 'city-agenda' | 'culture' | 'community' | 'meals';
  organizer?: string | null;
  activityKind?: EventActivityKind | null;
  priceType?: EventPriceType;
  priceText?: string | null;
  mealType?: EventMealType | null;
  audience?: string | null;
  recurrenceText?: string | null;
  isApproximateLocation?: boolean;
  isIndoor?: boolean | null;
  openNow?: boolean | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
}

// Active cities — add more Location entries here when expanding beyond Den Haag.
export const LOCATIONS: Location[] = [
  {
    id: 'dhg',
    name: 'The Hague',
    nameNl: 'Den Haag',
    lat: 52.0705,
    lng: 4.3007,
    zoom: 13,
    mapType: 'denhaag',
    postcodes: Array.from({ length: 100 }, (_, index) => String(2500 + index)),
    neighborhoods: [
      'Centrum',
      'Archipelbuurt',
      'Belgisch Park',
      'Benoordenhout',
      'Bezuidenhout',
      'Binckhorst',
      'Bloemenbuurt',
      'Bohemen en Meer en Bos',
      'Bomenbuurt',
      'Bouwlust en Vrederust',
      'Duindorp',
      'Duinoord',
      'Forepark',
      'Haagse Bos',
      'Kijkduin en Ockenburgh',
      'Kortenbos',
      'Kraayenstein en Vroondaal',
      'Laakkwartier en Spoorwijk',
      'Leidschenveen',
      'Leyenburg',
      'Loosduinen',
      'Mariahoeve en Marlot',
      'Moerwijk',
      'Morgenstond',
      'Regentessekwartier',
      'Rivierenbuurt',
      'Rustenburg en Oostbroek',
      'Scheveningen',
      'Schilderswijk',
      'Statenkwartier',
      'Stationsbuurt',
      'Transvaal',
      'Valkenboskwartier',
      'Van Stolkpark en Scheveningse Bosjes',
      'Vogelwijk',
      'Vruchtenbuurt',
      'Wateringse Veld',
      'Westbroekpark en Duttendel',
      'Willemspark',
      'Ypenburg',
      'Zeeheldenkwartier',
      'Zorgvliet',
    ],
    neighborhoodCoords: {
      Centrum:                                  { lat: 52.0750, lng: 4.3120, zoom: 14 },
      Archipelbuurt:                            { lat: 52.0875, lng: 4.3159, zoom: 15 },
      Willemspark:                              { lat: 52.0885, lng: 4.3070, zoom: 15 },
      Kortenbos:                                { lat: 52.0790, lng: 4.3000, zoom: 15 },
      Schilderswijk:                            { lat: 52.0666, lng: 4.3154, zoom: 15 },
      Stationsbuurt:                            { lat: 52.0720, lng: 4.3220, zoom: 15 },
      Zeeheldenkwartier:                        { lat: 52.0830, lng: 4.3020, zoom: 15 },
      Rivierenbuurt:                            { lat: 52.0690, lng: 4.3220, zoom: 15 },
      Transvaal:                                { lat: 52.0630, lng: 4.3020, zoom: 15 },
      'Laakkwartier en Spoorwijk':             { lat: 52.0550, lng: 4.3310, zoom: 14 },
      Binckhorst:                               { lat: 52.0840, lng: 4.3410, zoom: 14 },
      Benoordenhout:                            { lat: 52.1010, lng: 4.3260, zoom: 14 },
      Bezuidenhout:                             { lat: 52.0890, lng: 4.3370, zoom: 14 },
      'Haagse Bos':                             { lat: 52.0970, lng: 4.3340, zoom: 14 },
      'Mariahoeve en Marlot':                   { lat: 52.1110, lng: 4.3650, zoom: 14 },
      'Belgisch Park':                          { lat: 52.1110, lng: 4.2850, zoom: 14 },
      Duindorp:                                 { lat: 52.0990, lng: 4.2670, zoom: 14 },
      Duinoord:                                 { lat: 52.0850, lng: 4.2900, zoom: 15 },
      Scheveningen:                             { lat: 52.1059, lng: 4.2742, zoom: 14 },
      Statenkwartier:                           { lat: 52.0893, lng: 4.2780, zoom: 15 },
      'Van Stolkpark en Scheveningse Bosjes':   { lat: 52.1020, lng: 4.2860, zoom: 14 },
      'Westbroekpark en Duttendel':             { lat: 52.1090, lng: 4.2910, zoom: 14 },
      Zorgvliet:                                { lat: 52.0960, lng: 4.2840, zoom: 14 },
      Bomenbuurt:                               { lat: 52.0870, lng: 4.2880, zoom: 15 },
      Bloemenbuurt:                             { lat: 52.0790, lng: 4.2710, zoom: 15 },
      Regentessekwartier:                       { lat: 52.0800, lng: 4.2950, zoom: 15 },
      Valkenboskwartier:                        { lat: 52.0740, lng: 4.2810, zoom: 15 },
      Vruchtenbuurt:                            { lat: 52.0750, lng: 4.2660, zoom: 15 },
      Vogelwijk:                                { lat: 52.0950, lng: 4.2600, zoom: 14 },
      'Bouwlust en Vrederust':                  { lat: 52.0340, lng: 4.2850, zoom: 14 },
      Leyenburg:                                { lat: 52.0450, lng: 4.2930, zoom: 14 },
      Morgenstond:                              { lat: 52.0350, lng: 4.3130, zoom: 14 },
      Moerwijk:                                 { lat: 52.0410, lng: 4.3200, zoom: 14 },
      'Rustenburg en Oostbroek':                { lat: 52.0560, lng: 4.2930, zoom: 15 },
      'Wateringse Veld':                        { lat: 52.0260, lng: 4.3140, zoom: 14 },
      'Bohemen en Meer en Bos':                 { lat: 52.0730, lng: 4.2440, zoom: 14 },
      'Kijkduin en Ockenburgh':                 { lat: 52.0630, lng: 4.2450, zoom: 14 },
      'Kraayenstein en Vroondaal':              { lat: 52.0330, lng: 4.2580, zoom: 14 },
      Loosduinen:                               { lat: 52.0550, lng: 4.2450, zoom: 14 },
      Forepark:                                 { lat: 52.0780, lng: 4.3900, zoom: 14 },
      Leidschenveen:                            { lat: 52.0750, lng: 4.4020, zoom: 14 },
      Ypenburg:                                 { lat: 52.0450, lng: 4.3700, zoom: 14 },
    },
  },
];

// All city marker data is kept here for future expansion.
// Only the active city (Den Haag) is exported — change the filter below to add cities.
const ALL_MARKERS: Marker[] = [

  // ── AMSTERDAM (bounds w:4.85 e:5.00 s:52.34 n:52.40) ─────────────────

  { id: "ams-m1", locationId: "ams", category: "Museums",
    name: "Rijksmuseum",
    description: "The Netherlands' premier art museum — Rembrandt, Vermeer, and a billion-euro building.",
    x: 24, y: 67, details: "Open daily 09:00–17:00", lat: 52.3600, lng: 4.8852,
    sourceUrl: "https://www.rijksmuseum.nl" },
  { id: "ams-m2", locationId: "ams", category: "Museums",
    name: "Van Gogh Museum",
    description: "Home to the world's largest Van Gogh collection — over 200 paintings and 500 drawings.",
    x: 21, y: 69, details: "Open daily 09:00–18:00 (Fri until 21:00)", lat: 52.3584, lng: 4.8811,
    sourceUrl: "https://www.vangoghmuseum.nl" },
  { id: "ams-m3", locationId: "ams", category: "Museums",
    name: "Anne Frank Huis",
    description: "The secret annex where Anne Frank hid during WWII — one of Europe's most moving sites.",
    x: 23, y: 41, details: "Open daily 09:00–22:00 (book online)", lat: 52.3752, lng: 4.8839,
    sourceUrl: "https://www.annefrank.org" },
  { id: "ams-m4", locationId: "ams", category: "Museums",
    name: "Stedelijk Museum Amsterdam",
    description: "Cutting-edge modern and contemporary art from Mondrian to Basquiat.",
    x: 20, y: 70, details: "Open daily 10:00–18:00 (Fri until 22:00)", lat: 52.3581, lng: 4.8796,
    sourceUrl: "https://www.stedelijk.nl" },
  { id: "ams-m5", locationId: "ams", category: "Museums",
    name: "NEMO Science Museum",
    description: "Five floors of hands-on science experiments — and Amsterdam's best rooftop terrace.",
    x: 42, y: 44, details: "Open Tue–Sun 10:00–17:30", lat: 52.3738, lng: 4.9122,
    sourceUrl: "https://www.nemo.nl" },

  { id: "ams-t1", locationId: "ams", category: "Tours",
    name: "Amsterdam Canal Boat",
    description: "Classic 1-hour cruise through the UNESCO-listed canal ring with live commentary.",
    x: 34, y: 35, details: "Departs every 30 min from Centraal", lat: 52.3788, lng: 4.9003,
    sourceUrl: "https://www.iamsterdam.com" },
  { id: "ams-t2", locationId: "ams", category: "Tours",
    name: "Heineken Experience",
    description: "Interactive brewery tour inside the original Heineken plant — ends with a cold draft.",
    x: 28, y: 71, details: "Open Mon–Thu 10:30–19:30, Fri–Sun until 21:00", lat: 52.3576, lng: 4.8913,
    sourceUrl: "https://www.heinekenexperience.com" },
  { id: "ams-t3", locationId: "ams", category: "Tours",
    name: "Eye Filmmuseum",
    description: "Avant-garde cinema archive and exhibition space on the north bank of the IJ.",
    x: 32, y: 26, details: "Open daily 10:00–19:00", lat: 52.3843, lng: 4.8985,
    sourceUrl: "https://www.eyefilm.nl" },
  { id: "ams-t4", locationId: "ams", category: "Tours",
    name: "Royal Palace Amsterdam",
    description: "Explore the opulent 17th-century palace on Dam Square — built as a city hall for the world's richest republic.",
    x: 29, y: 45, details: "Open Tue–Sun 10:00–17:00", lat: 52.3731, lng: 4.8932,
    sourceUrl: "https://www.paleisamsterdam.nl" },
  { id: "ams-t5", locationId: "ams", category: "Tours",
    name: "Jordaan Bike Tour",
    description: "Cycle through Amsterdam's most charming neighbourhood — courtyards, galleries, and brown cafés.",
    x: 23, y: 42, details: "Daily departures 10:00 & 14:00", lat: 52.3750, lng: 4.8840,
    sourceUrl: "https://www.iamsterdam.com" },

  { id: "ams-f1", locationId: "ams", category: "Family",
    name: "ARTIS Royal Zoo",
    description: "Amsterdam's historic zoo with over 700 species, a planetarium, and an aquarium.",
    x: 44, y: 56, details: "Open daily 09:00–18:00", lat: 52.3665, lng: 4.9165,
    sourceUrl: "https://www.artis.nl" },
  { id: "ams-f2", locationId: "ams", category: "Family",
    name: "Madame Tussauds Amsterdam",
    description: "Come face to face with lifelike wax figures from Beyoncé to Rembrandt.",
    x: 29, y: 43, details: "Open daily 10:00–20:00", lat: 52.3741, lng: 4.8940,
    sourceUrl: "https://www.madametussauds.com/amsterdam" },
  { id: "ams-f3", locationId: "ams", category: "Family",
    name: "Amsterdam Dungeon",
    description: "80 spine-tingling minutes through Amsterdam's dark history — for brave families.",
    x: 31, y: 50, details: "Open daily 11:00–18:00", lat: 52.3702, lng: 4.8933,
    sourceUrl: "https://www.thedungeons.com/amsterdam" },
  { id: "ams-f4", locationId: "ams", category: "Family",
    name: "TunFun Indoor Playground",
    description: "Vast underground adventure playground in a converted traffic tunnel — perfect for rainy days.",
    x: 37, y: 56, details: "Open daily 10:00–18:00", lat: 52.3662, lng: 4.9059,
    sourceUrl: "https://www.tunfun.nl" },

  { id: "ams-e1", locationId: "ams", category: "Entertainment",
    name: "Paradiso",
    description: "Legendary concert hall in a converted church — where Nirvana, Bowie, and Prince all played.",
    x: 22, y: 63, details: "Check programme at paradiso.nl", lat: 52.3624, lng: 4.8823,
    sourceUrl: "https://www.paradiso.nl" },
  { id: "ams-e2", locationId: "ams", category: "Entertainment",
    name: "Melkweg",
    description: "Iconic multi-venue complex with live music, cinema, club nights, and gallery exhibitions.",
    x: 23, y: 61, details: "Check programme at melkweg.nl", lat: 52.3634, lng: 4.8839,
    sourceUrl: "https://www.melkweg.nl" },
  { id: "ams-e3", locationId: "ams", category: "Entertainment",
    name: "Royal Concertgebouw",
    description: "One of the world's great concert halls — home to the Royal Concertgebouw Orchestra.",
    x: 20, y: 73, details: "Check programme at concertgebouw.nl", lat: 52.3564, lng: 4.8796,
    sourceUrl: "https://www.concertgebouw.nl" },
  { id: "ams-e4", locationId: "ams", category: "Entertainment",
    name: "Royal Theatre Carré",
    description: "Grand 19th-century circus theatre staging musicals, cabaret, and international acts.",
    x: 38, y: 64, details: "Check programme at theatercarre.nl", lat: 52.3618, lng: 4.9071,
    sourceUrl: "https://www.theatercarre.nl" },

  { id: "ams-o1", locationId: "ams", category: "Outdoors",
    name: "Vondelpark",
    description: "Amsterdam's beloved city park — open-air theatre, rose garden, and Sunday roller skating.",
    x: 12, y: 70, details: "Open 24/7, free entry", lat: 52.3580, lng: 4.8681,
    sourceUrl: "https://www.amsterdam.nl/vondelpark" },
  { id: "ams-o2", locationId: "ams", category: "Outdoors",
    name: "Hortus Botanicus Amsterdam",
    description: "One of the world's oldest botanical gardens — 6,000 plant species in spectacular greenhouses.",
    x: 38, y: 56, details: "Open daily 10:00–17:00", lat: 52.3663, lng: 4.9071,
    sourceUrl: "https://www.dehortus.nl" },
  { id: "ams-o3", locationId: "ams", category: "Outdoors",
    name: "Flevopark",
    description: "Expansive east Amsterdam park with swimming ponds, BBQ spots, and nature trails.",
    x: 60, y: 47, details: "Open 24/7, free entry", lat: 52.3720, lng: 4.9394,
    sourceUrl: "https://www.amsterdam.nl/flevopark" },

  { id: "ams-mk1", locationId: "ams", category: "Markets",
    name: "Albert Cuyp Markt",
    description: "Amsterdam's biggest and best street market — 260 stalls of food, fashion, and flowers in De Pijp.",
    x: 30, y: 78, details: "Mon–Sat 09:30–17:00", lat: 52.3532, lng: 4.8953,
    sourceUrl: "https://www.albertcuyp-markt.amsterdam" },
  { id: "ams-mk2", locationId: "ams", category: "Markets",
    name: "Waterlooplein Flea Market",
    description: "Amsterdam's oldest market — vintage clothing, records, bicycles, and curiosities.",
    x: 34, y: 56, details: "Mon–Sat 09:30–18:00", lat: 52.3667, lng: 4.9002,
    sourceUrl: "https://www.waterloopleinmarkt.nl" },
  { id: "ams-mk3", locationId: "ams", category: "Markets",
    name: "Noordermarkt",
    description: "Saturday antique market and Monday organic farmers' market in the lively Jordaan.",
    x: 22, y: 34, details: "Sat antiques 09:00–16:00, Mon organic 09:00–13:00", lat: 52.3795, lng: 4.8831,
    sourceUrl: "https://www.noordermarkt-amsterdam.nl" },

  // ── ROTTERDAM (bounds w:4.43 e:4.55 s:51.88 n:51.96) ─────────────────

  { id: "rot-m1", locationId: "rot", category: "Museums",
    name: "Museum Boijmans Van Beuningen",
    description: "One of the Netherlands' great art museums — Bruegel, Dalí, and Van Eyck under one roof.",
    x: 33, y: 53, details: "Closed for renovation; visit the Depot", lat: 51.9178, lng: 4.4699,
    sourceUrl: "https://www.boijmans.nl" },
  { id: "rot-m2", locationId: "rot", category: "Museums",
    name: "Kunsthal Rotterdam",
    description: "No permanent collection — just a relentless stream of world-class temporary exhibitions.",
    x: 33, y: 57, details: "Open Tue–Sun 10:00–17:00", lat: 51.9143, lng: 4.4700,
    sourceUrl: "https://www.kunsthal.nl" },
  { id: "rot-m3", locationId: "rot", category: "Museums",
    name: "Depot Boijmans Van Beuningen",
    description: "The world's first publicly accessible art depot — 151,000 works in a mirrored flying saucer.",
    x: 32, y: 52, details: "Open Tue–Sun 11:00–17:00", lat: 51.9183, lng: 4.4688,
    sourceUrl: "https://www.depot.nl" },
  { id: "rot-m4", locationId: "rot", category: "Museums",
    name: "Maritime Museum Rotterdam",
    description: "Explore Rotterdam's seafaring heritage aboard historic vessels in the old inner harbour.",
    x: 37, y: 54, details: "Open Tue–Sun 10:00–17:00", lat: 51.9167, lng: 4.4741,
    sourceUrl: "https://www.maritiemmuseum.nl" },
  { id: "rot-m5", locationId: "rot", category: "Museums",
    name: "TENT Rotterdam",
    description: "Dynamic platform for contemporary art with a focus on Rotterdam-based artists.",
    x: 43, y: 49, details: "Open Tue–Sun 11:00–18:00", lat: 51.9205, lng: 4.4820,
    sourceUrl: "https://www.tentrotterdam.nl" },

  { id: "rot-t1", locationId: "rot", category: "Tours",
    name: "Spido Rotterdam Harbor Tour",
    description: "75-minute boat tour of Europe's largest port — tankers, container cranes, and the iconic skyline.",
    x: 46, y: 69, details: "Multiple daily departures from Leuvehaven", lat: 51.9046, lng: 4.4855,
    sourceUrl: "https://www.spido.nl" },
  { id: "rot-t2", locationId: "rot", category: "Tours",
    name: "Rotterdam Architecture Tour",
    description: "Guided walk through one of Europe's most daring skylines — cube houses, the Markthal, and more.",
    x: 40, y: 45, details: "Sat & Sun 12:00 from Centraal Station", lat: 51.9244, lng: 4.4777,
    sourceUrl: "https://www.thisisrotterdam.com" },
  { id: "rot-t3", locationId: "rot", category: "Tours",
    name: "Euromast Observation Tower",
    description: "Climb the 185 m Euromast for panoramic views from Rotterdam to the North Sea.",
    x: 32, y: 70, details: "Open daily 09:30–23:00", lat: 51.9044, lng: 4.4681,
    sourceUrl: "https://www.euromast.nl" },
  { id: "rot-t4", locationId: "rot", category: "Tours",
    name: "Kubuswoningen Cube Houses Walk",
    description: "Walk through Piet Blom's surreal tilted cube houses and visit the show home inside.",
    x: 47, y: 50, details: "Show cube open daily 10:00–18:00", lat: 51.9197, lng: 4.4858,
    sourceUrl: "https://www.kubuswoning.nl" },

  { id: "rot-f1", locationId: "rot", category: "Family",
    name: "Diergaarde Blijdorp Zoo",
    description: "Rotterdam's beloved zoo with over 1,000 animals, an ocean tunnel, and a safari train.",
    x: 23, y: 40, details: "Open daily 09:00–18:00", lat: 51.9278, lng: 4.4574,
    sourceUrl: "https://www.diergaardeblijdorp.nl" },
  { id: "rot-f2", locationId: "rot", category: "Family",
    name: "Plaswijckpark",
    description: "Cheerful family theme park with rides, a farm, and a historic wooden roller coaster.",
    x: 8, y: 21, details: "Open daily Apr–Oct 10:00–17:30", lat: 51.9433, lng: 4.4399,
    sourceUrl: "https://www.plaswijckpark.nl" },
  { id: "rot-f3", locationId: "rot", category: "Family",
    name: "SS Rotterdam Historic Ocean Liner",
    description: "Explore, dine, or sleep aboard the former flagship of the Holland America Line.",
    x: 43, y: 79, details: "Guided tours daily 11:00–17:00", lat: 51.8969, lng: 4.4820,
    sourceUrl: "https://www.ssrotterdam.nl" },

  { id: "rot-e1", locationId: "rot", category: "Entertainment",
    name: "Luxor Theatre Rotterdam",
    description: "Spectacular musical and dance productions in Rotterdam's flagship theatre.",
    x: 28, y: 55, details: "Check programme at luxortheater.nl", lat: 51.9157, lng: 4.4769,
    sourceUrl: "https://www.luxortheater.nl" },
  { id: "rot-e2", locationId: "rot", category: "Entertainment",
    name: "De Doelen Concert Hall",
    description: "World-class acoustics — home of the Rotterdam Philharmonic and top international soloists.",
    x: 30, y: 47, details: "Check programme at dedoelen.com", lat: 51.9221, lng: 4.4792,
    sourceUrl: "https://www.dedoelen.com" },
  { id: "rot-e3", locationId: "rot", category: "Entertainment",
    name: "Pathé Schouwburgplein",
    description: "10-screen multiplex at Rotterdam's cultural square — latest releases in comfort.",
    x: 32, y: 49, details: "Check times at pathe.nl", lat: 51.9205, lng: 4.4808,
    sourceUrl: "https://www.pathe.nl/bioscoop/rotterdam-schouwburgplein" },

  { id: "rot-o1", locationId: "rot", category: "Outdoors",
    name: "Kralingse Bos & Plas",
    description: "Rotterdam's green lung — rowing, sailing, cycling trails, and lakeside beach bars.",
    x: 79, y: 42, details: "Open 24/7, free entry", lat: 51.9261, lng: 4.5249,
    sourceUrl: "https://www.thisisrotterdam.com" },
  { id: "rot-o2", locationId: "rot", category: "Outdoors",
    name: "Euromast Park & Klimbos",
    description: "Landscaped park surrounding the Euromast with a zip line and treetop adventure course.",
    x: 31, y: 70, details: "Klimbos open Apr–Oct, weather permitting", lat: 51.9051, lng: 4.4680,
    sourceUrl: "https://www.euromast.nl" },
  { id: "rot-o3", locationId: "rot", category: "Outdoors",
    name: "Zuiderpark",
    description: "Large south Rotterdam park with sports fields, ponds, and the popular Zuiderterras.",
    x: 48, y: 85, details: "Open 24/7, free entry", lat: 51.8920, lng: 4.4870,
    sourceUrl: "https://www.rotterdam.nl/zuiderpark" },

  { id: "rot-mk1", locationId: "rot", category: "Markets",
    name: "Markthal Rotterdam",
    description: "Europe's first indoor food market under an astonishing arched mural — 100 food stalls.",
    x: 45, y: 50, details: "Mon–Thu 10:00–20:00, Fri–Sat until 21:00, Sun 12:00–18:00", lat: 51.9200, lng: 4.4840,
    sourceUrl: "https://www.markthal.nl" },
  { id: "rot-mk2", locationId: "rot", category: "Markets",
    name: "Fenix Food Factory",
    description: "Artisan food market in a repurposed warehouse on Katendrecht — craft beer and fresh oysters.",
    x: 34, y: 74, details: "Wed–Sun 10:00–20:00", lat: 51.9007, lng: 4.4703,
    sourceUrl: "https://www.fenixfoodfactory.nl" },
  { id: "rot-mk3", locationId: "rot", category: "Markets",
    name: "Delfshaven Makers Market",
    description: "Weekend market celebrating local makers and vintage finds in Rotterdam's only historic quarter.",
    x: 10, y: 62, details: "Saturday 10:00–17:00", lat: 51.9101, lng: 4.4425,
    sourceUrl: "https://www.thisisrotterdam.com" },

  // ── UTRECHT (bounds w:5.09 e:5.17 s:52.07 n:52.12) ───────────────────

  { id: "utr-m1", locationId: "utr", category: "Museums",
    name: "Centraal Museum Utrecht",
    description: "Utrecht's main art museum — de Stijl furniture, old masters, and a Dick Bruna wing.",
    x: 32, y: 74, details: "Open Tue–Sun 11:00–17:00", lat: 52.0829, lng: 5.1158,
    sourceUrl: "https://www.centraalmuseum.nl" },
  { id: "utr-m2", locationId: "utr", category: "Museums",
    name: "Nederlands Spoorwegmuseum",
    description: "Spectacular railway museum inside a cathedral-like 19th-century station — with real steam engines.",
    x: 54, y: 57, details: "Open Tue–Sun 10:00–17:00", lat: 52.0917, lng: 5.1328,
    sourceUrl: "https://www.spoorwegmuseum.nl" },
  { id: "utr-m3", locationId: "utr", category: "Museums",
    name: "Museum Speelklok",
    description: "Self-playing music machines from tiny music boxes to enormous fairground organs — magical and loud.",
    x: 41, y: 57, details: "Open Tue–Sun 10:00–17:00", lat: 52.0917, lng: 5.1230,
    sourceUrl: "https://www.museumspeelklok.nl" },
  { id: "utr-m4", locationId: "utr", category: "Museums",
    name: "Museum Catharijneconvent",
    description: "The Netherlands' finest collection of medieval religious art in a restored Gothic convent.",
    x: 33, y: 60, details: "Open Tue–Sun 10:00–17:00", lat: 52.0901, lng: 5.1162,
    sourceUrl: "https://www.catharijneconvent.nl" },
  { id: "utr-m5", locationId: "utr", category: "Museums",
    name: "Universiteitsmuseum Utrecht",
    description: "Science, curiosities, and nature — the University of Utrecht's extraordinary cabinet of wonders.",
    x: 43, y: 59, details: "Open Tue–Sun 11:00–17:00", lat: 52.0903, lng: 5.1240,
    sourceUrl: "https://www.uu.nl/universiteitsmuseum" },

  { id: "utr-t1", locationId: "utr", category: "Tours",
    name: "Dom Tower Climb",
    description: "Climb 465 steps to the top of the Netherlands' tallest church tower — views across the whole country.",
    x: 39, y: 59, details: "Guided tours daily from 10:00", lat: 52.0907, lng: 5.1214,
    sourceUrl: "https://www.domtoren.nl" },
  { id: "utr-t2", locationId: "utr", category: "Tours",
    name: "Utrecht Canal Boat Tour",
    description: "Cruise below street level through Utrecht's unique double-decker Oudegracht canal.",
    x: 33, y: 64, details: "Departs hourly from Stadhuisbrug", lat: 52.0882, lng: 5.1160,
    sourceUrl: "https://www.schuttevaer.nl" },
  { id: "utr-t3", locationId: "utr", category: "Tours",
    name: "Utrecht Free Walking Tour",
    description: "Tip-based 2-hour tour covering the Dom, the Oudegracht, and Utrecht's medieval past.",
    x: 26, y: 60, details: "Daily 10:00 & 14:00 from Centraal", lat: 52.0894, lng: 5.1106,
    sourceUrl: "https://www.guruwalk.com" },
  { id: "utr-t4", locationId: "utr", category: "Tours",
    name: "Vecht River Bike Tour",
    description: "Cycle north along the scenic Vecht river through castles, polder landscapes, and old manor houses.",
    x: 54, y: 52, details: "Self-guided or guided, departs from Centraal", lat: 52.0942, lng: 5.1318,
    sourceUrl: "https://visit-utrecht.com" },

  { id: "utr-f1", locationId: "utr", category: "Family",
    name: "Miffy Museum (Dick Bruna Huis)",
    description: "Enchanting museum dedicated to Miffy — the iconic bunny created by Utrecht's own Dick Bruna.",
    x: 30, y: 75, details: "Open Tue–Sun 10:00–17:00 (ages 0–6)", lat: 52.0827, lng: 5.1154,
    sourceUrl: "https://www.nijntjemuseum.nl" },
  { id: "utr-f2", locationId: "utr", category: "Family",
    name: "Klim-Op Indoor Climbing Utrecht",
    description: "Utrecht's biggest indoor climbing centre — bouldering and top-rope for all ages.",
    x: 41, y: 58, details: "Open daily 10:00–22:00", lat: 52.0908, lng: 5.1230,
    sourceUrl: "https://www.klimop-utrecht.nl" },
  { id: "utr-f3", locationId: "utr", category: "Family",
    name: "Kinderboerderij Rivierenwijk",
    description: "Free children's farm with goats, rabbits, and pigs in the heart of the city — always free entry.",
    x: 39, y: 93, details: "Open daily 10:00–17:00, free entry", lat: 52.0737, lng: 5.1218,
    sourceUrl: "https://www.kinderboerderijrivierenwijk.nl" },

  { id: "utr-e1", locationId: "utr", category: "Entertainment",
    name: "TivoliVredenburg",
    description: "Five rooms, five musical worlds — from jazz and classical to club nights and metal.",
    x: 35, y: 55, details: "Check programme at tivolivredenburg.nl", lat: 52.0925, lng: 5.1179,
    sourceUrl: "https://www.tivolivredenburg.nl" },
  { id: "utr-e2", locationId: "utr", category: "Entertainment",
    name: "Stadsschouwburg Utrecht",
    description: "Utrecht's main theatre for drama, dance, and opera in a stunning Art Nouveau building.",
    x: 39, y: 63, details: "Check programme at stadsschouwburg-utrecht.nl", lat: 52.0884, lng: 5.1214,
    sourceUrl: "https://www.stadsschouwburg-utrecht.nl" },
  { id: "utr-e3", locationId: "utr", category: "Entertainment",
    name: "Ekko Club & Café",
    description: "Intimate Utrecht institution for alternative music — indie, punk, folk, and everything in between.",
    x: 40, y: 62, details: "Check programme at ekko.nl", lat: 52.0892, lng: 5.1221,
    sourceUrl: "https://www.ekko.nl" },

  { id: "utr-o1", locationId: "utr", category: "Outdoors",
    name: "Wilhelminapark",
    description: "Elegant late-19th-century park with rose gardens, ponds, and a beloved open-air terrace café.",
    x: 51, y: 77, details: "Open 24/7, free entry", lat: 52.0815, lng: 5.1310,
    sourceUrl: "https://www.utrecht.nl" },
  { id: "utr-o2", locationId: "utr", category: "Outdoors",
    name: "Griftpark",
    description: "Popular city park with a lido, skate ramps, and a children's farm along the old Grift canal.",
    x: 35, y: 39, details: "Open 24/7, free; lido open summer", lat: 52.1005, lng: 5.1176,
    sourceUrl: "https://www.utrecht.nl" },
  { id: "utr-o3", locationId: "utr", category: "Outdoors",
    name: "Amelisweerd Forest",
    description: "Ancient country estate turned public forest — cycling and walking trails along the Kromme Rijn.",
    x: 69, y: 73, details: "Open 24/7, free entry", lat: 52.0833, lng: 5.1454,
    sourceUrl: "https://visit-utrecht.com" },

  { id: "utr-mk1", locationId: "utr", category: "Markets",
    name: "Vredenburg Market",
    description: "Utrecht's largest market at the Vredenburg square — fresh produce, flowers, and street food.",
    x: 34, y: 53, details: "Wed, Fri & Sat 08:00–17:00", lat: 52.0936, lng: 5.1175,
    sourceUrl: "https://www.vredenburgmarkt.nl" },
  { id: "utr-mk2", locationId: "utr", category: "Markets",
    name: "Oudegracht Wharves Market",
    description: "Saturday market in Utrecht's unique sunken wharves — local food, crafts, and live music.",
    x: 33, y: 64, details: "Saturday 10:00–17:00", lat: 52.0882, lng: 5.1160,
    sourceUrl: "https://visit-utrecht.com" },
  { id: "utr-mk3", locationId: "utr", category: "Markets",
    name: "Bruntenhof Organic Market",
    description: "Intimate Saturday organic market in a 17th-century almshouse courtyard — cheese, bread, honey.",
    x: 27, y: 58, details: "Saturday 08:00–13:00", lat: 52.0895, lng: 5.1118,
    sourceUrl: "https://visit-utrecht.com" },

  // ── THE HAGUE (bounds w:4.26 e:4.36 s:52.05 n:52.11) ─────────────────

  { id: "dhg-m1", locationId: "dhg", category: "Museums", name: "Mauritshuis",
    description: "Home to Vermeer's Girl with a Pearl Earring and Rembrandt's Anatomy Lesson.",
    x: 54, y: 52, details: "Open Tue–Sun 10:00–18:00", lat: 52.0798, lng: 4.3141,
    sourceUrl: "https://www.mauritshuis.nl" },
  { id: "dhg-m2", locationId: "dhg", category: "Museums", name: "Kunstmuseum Den Haag",
    description: "World's largest Mondrian collection in a stunning 1935 Art Deco building.",
    x: 30, y: 38, details: "Open Tue–Sun 10:00–17:00", lat: 52.0873, lng: 4.2896,
    sourceUrl: "https://www.kunstmuseum.nl" },
  { id: "dhg-m3", locationId: "dhg", category: "Museums", name: "Panorama Mesdag",
    description: "Step inside an 1881 circular painting of Scheveningen — the world's largest panorama.",
    x: 38, y: 43, details: "Open daily 10:00–17:00", lat: 52.0844, lng: 4.2977,
    sourceUrl: "https://www.panorama-mesdag.nl" },
  { id: "dhg-m4", locationId: "dhg", category: "Museums", name: "Escher in Het Paleis",
    description: "M.C. Escher's mind-bending prints displayed inside a former royal palace on Lange Voorhout.",
    x: 57, y: 40, details: "Open Tue–Sun 11:00–17:00", lat: 52.0863, lng: 4.3172,
    sourceUrl: "https://www.escherinhetpaleis.nl" },
  { id: "dhg-m5", locationId: "dhg", category: "Museums", name: "Louwman Museum",
    description: "The world's oldest private car collection — over 230 historic vehicles from 1886 onward.",
    x: 26, y: 88, details: "Open Tue–Sun 10:00–17:00", lat: 52.0573, lng: 4.2862,
    sourceUrl: "https://www.louwmanmuseum.nl" },

  { id: "dhg-t1", locationId: "dhg", category: "Tours", name: "Enter The Hague: Free Walking Tour",
    description: "Tip-based guided tour of The Hague's history, architecture, and royal highlights.",
    x: 53, y: 53, details: "Daily 10:30 & 14:00", lat: 52.0793, lng: 4.3130,
    sourceUrl: "https://www.enterthehague.com/the-hague-free-walking-tour" },
  { id: "dhg-t2", locationId: "dhg", category: "Tours", name: "seeTheHague Bike Tour",
    description: "Explore the city's best spots by bike with a knowledgeable local guide.",
    x: 41, y: 68, details: "Book in advance", lat: 52.0705, lng: 4.3007,
    sourceUrl: "https://seethehague.nl" },
  { id: "dhg-t3", locationId: "dhg", category: "Tours", name: "Street Art Tour: Binckhorst",
    description: "Guided tour of The Hague's emerging creative district — murals and urban art.",
    x: 51, y: 90, details: "Weekends, 13:00", lat: 52.0567, lng: 4.3311,
    sourceUrl: "https://www.enterthehague.com/street-art-tour-the-hague" },
  { id: "dhg-t4", locationId: "dhg", category: "Tours", name: "Escape the City Den Haag",
    description: "Solve the mystery of Hugo de Groot's escape in this outdoor historical city game.",
    x: 52, y: 55, details: "Available daily", lat: 52.0771, lng: 4.3121,
    sourceUrl: "https://www.dagjeweg.nl" },
  { id: "dhg-t5", locationId: "dhg", category: "Tours", name: "Vredespaleis Visitor Centre",
    description: "Visit the iconic seat of international justice — guided tours and an interactive visitor centre.",
    x: 31, y: 31, details: "Visitor centre open daily", lat: 52.0921, lng: 4.2921,
    sourceUrl: "https://www.vredespaleis.nl" },

  { id: "dhg-f1", locationId: "dhg", category: "Family", name: "Madurodam",
    description: "Explore a 1:25 scale miniature Netherlands — windmills, canals, and a working airport.",
    x: 45, y: 20, details: "Open daily 09:00–19:00", lat: 52.0978, lng: 4.3046,
    sourceUrl: "https://www.madurodam.nl" },
  { id: "dhg-f2", locationId: "dhg", category: "Family", name: "SEA LIFE Scheveningen",
    description: "Walk through an underwater ocean tunnel and discover hundreds of sea creatures.",
    x: 13, y: 5, details: "Open daily 10:00–19:00", lat: 52.1073, lng: 4.2734,
    sourceUrl: "https://www.visitsealife.com/scheveningen" },
  { id: "dhg-f3", locationId: "dhg", category: "Family", name: "Museon-Omniversum",
    description: "Hands-on science museum with a 360° dome cinema showing Earth and space films.",
    x: 32, y: 57, details: "Open daily 10:00–17:00", lat: 52.0762, lng: 4.2927,
    sourceUrl: "https://www.museon.nl" },
  { id: "dhg-f4", locationId: "dhg", category: "Family", name: "Zandkasteel Scheveningen",
    description: "Indoor beach playground for children — slides, sandpits, and splash pools.",
    x: 12, y: 12, details: "Open daily 10:00–18:00", lat: 52.1030, lng: 4.2720,
    sourceUrl: "https://www.zandkasteel.nl" },

  { id: "dhg-e1", locationId: "dhg", category: "Entertainment", name: "Escape Room Operation Exit",
    description: "Award-winning escape rooms rated ★4.9 by 1,294 Google reviewers — book ahead for weekends.",
    x: 52, y: 56, details: "Open daily 10:00–23:00", lat: 52.0771, lng: 4.3121,
    sourceUrl: "https://wannado.nl/e/escape-room-operation-exit-den-haag" },
  { id: "dhg-e2", locationId: "dhg", category: "Entertainment", name: "Amaze VR Den Haag",
    description: "Full-body VR experiences: horror, adventure, and multiplayer gaming in shared virtual worlds.",
    x: 51, y: 58, details: "Open Tue–Sun 11:00–22:00", lat: 52.0752, lng: 4.3119,
    sourceUrl: "https://wannado.nl/e/amaze-vr-den-haag" },
  { id: "dhg-e3", locationId: "dhg", category: "Entertainment", name: "Pathé Scheveningen",
    description: "Multiplex cinema on the Scheveningen seafront — latest releases with sea views.",
    x: 13, y: 11, details: "Check times online", lat: 52.1041, lng: 4.2736,
    sourceUrl: "https://www.pathe.nl" },
  { id: "dhg-e4", locationId: "dhg", category: "Entertainment", name: "Zuiderstrandtheater",
    description: "Striking theatre right on Scheveningen beach — a unique setting for live performances.",
    x: 13, y: 14, details: "See website for programme", lat: 52.1026, lng: 4.2743,
    sourceUrl: "https://www.zuiderstrandtheater.nl" },

  { id: "dhg-o1", locationId: "dhg", category: "Outdoors", name: "Scheveningen Beach & Boulevard",
    description: "11 km of sandy beach with beach bars, water sports, and unforgettable North Sea sunsets.",
    x: 13, y: 8, details: "Open 24/7", lat: 52.1059, lng: 4.2742,
    sourceUrl: "https://denhaag.com/en/things-to-do" },
  { id: "dhg-o2", locationId: "dhg", category: "Outdoors", name: "Westduinpark & Kijkduin",
    description: "Sandy dune nature reserve stretching to Kijkduin beach — ideal for hiking and cycling.",
    x: 5, y: 55, details: "Open 24/7", lat: 52.0769, lng: 4.2358,
    sourceUrl: "https://denhaag.com" },
  { id: "dhg-o3", locationId: "dhg", category: "Outdoors", name: "Haagse Bos",
    description: "Ancient royal forest on the city's edge — running trails, deer, and a hidden palace.",
    x: 83, y: 53, details: "Open daily, free entry", lat: 52.0780, lng: 4.3430,
    sourceUrl: "https://denhaag.com/en/things-to-do" },

  { id: "dhg-mk1", locationId: "dhg", category: "Markets", name: "Haagse Markt",
    description: "One of Europe's largest outdoor markets — fresh produce, street food, and world flavours.",
    x: 47, y: 76, details: "Mon, Wed, Fri & Sat 08:00–17:00", lat: 52.0653, lng: 4.3072,
    sourceUrl: "https://wannado.nl/wat-te-doen/den-haag" },
  { id: "dhg-mk2", locationId: "dhg", category: "Markets", name: "Lange Voorhout Antique Market",
    description: "Antique books, art, and curiosities under the historic linden trees of Lange Voorhout.",
    x: 49, y: 42, details: "Sunday 11:00–17:00", lat: 52.0848, lng: 4.3093,
    sourceUrl: "https://www.dagjeweg.nl" },

  // ── EINDHOVEN (bounds w:5.43 e:5.52 s:51.41 n:51.47) ─────────────────

  { id: "ein-m1", locationId: "ein", category: "Museums",
    name: "Philips Museum Eindhoven",
    description: "The story of Philips — from the first light bulb to the cassette tape — in the original factory.",
    x: 52, y: 51, details: "Open Tue–Sun 11:00–17:00", lat: 51.4393, lng: 5.4769,
    sourceUrl: "https://www.philips-museum.com" },
  { id: "ein-m2", locationId: "ein", category: "Museums",
    name: "Van Abbemuseum",
    description: "One of Europe's leading modern art museums — Picasso, Chagall, and a provocative permanent collection.",
    x: 47, y: 43, details: "Open Tue–Sun 11:00–17:00", lat: 51.4440, lng: 5.4720,
    sourceUrl: "https://www.vanabbemuseum.nl" },
  { id: "ein-m3", locationId: "ein", category: "Museums",
    name: "DAF Museum",
    description: "Fascinating collection of DAF trucks, vans, and the iconic Daffodil car — with a free ride!",
    x: 28, y: 52, details: "Open Tue–Sun 10:00–17:00", lat: 51.4390, lng: 5.4550,
    sourceUrl: "https://www.dafmuseum.nl" },

  { id: "ein-t1", locationId: "ein", category: "Tours",
    name: "GLOW Eindhoven Walking Route",
    description: "Year-round self-guided walk through GLOW's iconic light art installations across the city centre.",
    x: 44, y: 47, details: "Maps available at VVV Eindhoven", lat: 51.4416, lng: 5.4697,
    sourceUrl: "https://www.gloweindhoven.nl" },
  { id: "ein-t2", locationId: "ein", category: "Tours",
    name: "Strijp-S Industrial Heritage Tour",
    description: "Discover the former secret Philips campus — now a creative hub with studios, rooftop bars, and murals.",
    x: 21, y: 37, details: "Guided Sat 13:00 or self-guided daily", lat: 51.4478, lng: 5.4489,
    sourceUrl: "https://www.strijp-s.nl" },
  { id: "ein-t3", locationId: "ein", category: "Tours",
    name: "Eindhoven City Bike Tour",
    description: "Cycle from the Design District to the Dommel river and back — history, street art, and parks.",
    x: 53, y: 45, details: "Departs from Centraal Tue–Sun 10:00", lat: 51.4432, lng: 5.4780,
    sourceUrl: "https://www.thisiseindhoven.com" },

  { id: "ein-f1", locationId: "ein", category: "Family",
    name: "Evoluon Science Centre",
    description: "Science and technology adventures inside an iconic 1966 flying saucer — design, physics, and future.",
    x: 23, y: 32, details: "Open daily 10:00–17:00", lat: 51.4503, lng: 5.4507,
    sourceUrl: "https://www.evoluon.com" },
  { id: "ein-f2", locationId: "ein", category: "Family",
    name: "Klimbos Eindhoven",
    description: "Outdoor treetop adventure park with suspension bridges, zip lines, and climbing nets for all ages.",
    x: 32, y: 88, details: "Open Apr–Oct, weather permitting", lat: 51.4175, lng: 5.4590,
    sourceUrl: "https://www.klimboseindhoven.nl" },
  { id: "ein-f3", locationId: "ein", category: "Family",
    name: "Speelboerderij de Bosrand",
    description: "A children's farm meets adventure playground — petting animals, tractor rides, and outdoor play.",
    x: 28, y: 28, details: "Open Tue–Sun 10:00–17:00", lat: 51.4533, lng: 5.4550,
    sourceUrl: "https://www.thisiseindhoven.com" },

  { id: "ein-e1", locationId: "ein", category: "Entertainment",
    name: "Effenaar",
    description: "Eindhoven's leading music venue — indie, hip-hop, metal, and electronic under a brutalist roof.",
    x: 53, y: 58, details: "Check programme at effenaar.nl", lat: 51.4352, lng: 5.4773,
    sourceUrl: "https://www.effenaar.nl" },
  { id: "ein-e2", locationId: "ein", category: "Entertainment",
    name: "Parktheater Eindhoven",
    description: "Major regional theatre for drama, dance, and large-scale musicals next to Van Abbemuseum.",
    x: 47, y: 51, details: "Check programme at parktheater.nl", lat: 51.4397, lng: 5.4720,
    sourceUrl: "https://www.parktheater.nl" },
  { id: "ein-e3", locationId: "ein", category: "Entertainment",
    name: "Stratumseind Night Out",
    description: "The Netherlands' longest bar street — 50+ venues, craft beer, live music, and late-night energy.",
    x: 64, y: 65, details: "Bars open from 16:00, clubs until 05:00", lat: 51.4313, lng: 5.4872,
    sourceUrl: "https://www.stratumseind.nl" },

  { id: "ein-o1", locationId: "ein", category: "Outdoors",
    name: "Genneper Parken",
    description: "Eindhoven's largest park — meadows, ponds, a boating lake, and a popular open-air lido.",
    x: 33, y: 83, details: "Open 24/7; lido open summer", lat: 51.4200, lng: 5.4600,
    sourceUrl: "https://www.genneper-parken.nl" },
  { id: "ein-o2", locationId: "ein", category: "Outdoors",
    name: "Stadswandelpark & Dommel Walk",
    description: "A green ribbon along the Dommel river through the city — ideal for running, cycling, and picnics.",
    x: 57, y: 41, details: "Open 24/7, free entry", lat: 51.4456, lng: 5.4795,
    sourceUrl: "https://www.thisiseindhoven.com" },
  { id: "ein-o3", locationId: "ein", category: "Outdoors",
    name: "Dommel River Cycling Route",
    description: "Peaceful 30 km cycle from Eindhoven to 's-Hertogenbosch along the Dommel valley.",
    x: 47, y: 22, details: "Self-guided; departs north from Centraal", lat: 51.4570, lng: 5.4723,
    sourceUrl: "https://www.routeyou.com" },

  { id: "ein-mk1", locationId: "ein", category: "Markets",
    name: "Woenselse Markt",
    description: "One of the largest markets in North Brabant — fresh produce, tropical specialities, and street food.",
    x: 50, y: 6, details: "Mon, Wed & Sat 08:00–17:00", lat: 51.4663, lng: 5.4752,
    sourceUrl: "https://www.thisiseindhoven.com" },
  { id: "ein-mk2", locationId: "ein", category: "Markets",
    name: "Strijp-S Weekend Market",
    description: "Indie designers, vintage finds, and food trucks in the creative courtyard of Strijp-S.",
    x: 21, y: 37, details: "Sat & Sun 10:00–17:00", lat: 51.4478, lng: 5.4489,
    sourceUrl: "https://www.strijp-s.nl" },
  { id: "ein-mk3", locationId: "ein", category: "Markets",
    name: "Kazerne Design Market",
    description: "Monthly design and makers' market in the stunning Kazerne courtyard — jewellery, ceramics, and art.",
    x: 51, y: 48, details: "Monthly Sat 10:00–17:00; check dates online", lat: 51.4411, lng: 5.4762,
    sourceUrl: "https://www.kazerne.com" },
];

export const MARKERS: Marker[] = ALL_MARKERS.filter(m => m.locationId === 'dhg');
