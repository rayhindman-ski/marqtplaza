import type { Location, Marker } from './data';

export type Language = 'nl' | 'en';

export const LANGUAGE_OPTIONS: Array<{ value: Language; label: string }> = [
  { value: 'nl', label: 'Nederlands' },
  { value: 'en', label: 'English' },
];

export const translations = {
  nl: {
    languageLabel: 'Taal',
    searchDescription: 'Ontdek de verborgen plekken in jouw buurt, zonder ruis.',
    placeholder: 'Voer stad of postcode in (bijv. Amsterdam, 1011)',
    explore: 'Ontdek',
    popularDestinations: 'Populaire bestemmingen',
    emptySearch: 'Vul een stad of postcode in.',
    locationNotFound:
      'Locatie niet gevonden. Probeer Amsterdam, Rotterdam, Utrecht, Den Haag of Eindhoven.',
    categories: {
      Businesses: 'Bedrijven',
      Events: 'Evenementen',
      Specials: 'Aanbiedingen',
    },
    backToSearch: 'Terug naar zoeken',
    discoveriesNearby: (count: number) =>
      `${count} ${count === 1 ? 'ontdekking' : 'ontdekkingen'} in de buurt`,
    selectMarker: (name: string) => `Selecteer ${name}`,
    noDiscoveries: 'Geen ontdekkingen gevonden',
    noDiscoveriesDescription:
      'Zet meer categorieën aan om te zien wat er hier in de buurt gebeurt.',
    backToMap: 'Terug naar kaart',
    showList: 'Toon lijst',
    showMap: 'Toon kaart',
    pageNotFound: 'Pagina niet gevonden',
    navCategories: [
      { id: 'news', label: 'Nieuws' },
      { id: 'things-to-do', label: 'Doen' },
      { id: 'locals', label: 'Buurtgenoten' },
      { id: 'food-drink', label: 'Eten en drinken' },
      { id: 'shopping', label: 'Winkelen' },
    ],
  },
  en: {
    languageLabel: 'Language',
    searchDescription: 'Discover the unseen corners of your neighbourhood without the noise.',
    placeholder: 'Enter city or postcode (e.g. Amsterdam, 1011)',
    explore: 'Explore',
    popularDestinations: 'Popular destinations',
    emptySearch: 'Please enter a city or postcode.',
    locationNotFound:
      'Location not found. Try Amsterdam, Rotterdam, Utrecht, The Hague, or Eindhoven.',
    categories: {
      Businesses: 'Businesses',
      Events: 'Events',
      Specials: 'Specials',
    },
    backToSearch: 'Back to search',
    discoveriesNearby: (count: number) =>
      `${count} ${count === 1 ? 'discovery' : 'discoveries'} nearby`,
    selectMarker: (name: string) => `Select ${name}`,
    noDiscoveries: 'No discoveries found',
    noDiscoveriesDescription:
      "Try enabling more categories to see what's happening around here.",
    backToMap: 'Back to Map',
    showList: 'Show List',
    showMap: 'Show Map',
    pageNotFound: 'Page not found',
    navCategories: [
      { id: 'news', label: 'News' },
      { id: 'things-to-do', label: 'Things to do' },
      { id: 'locals', label: 'Locals' },
      { id: 'food-drink', label: 'Food & drink' },
      { id: 'shopping', label: 'Shopping' },
    ],
  },
} as const;

const dutchLocationNames: Record<string, string> = {
  dhg: 'Den Haag',
};

const dutchMarkerCopy: Record<
  string,
  { description: string; details: string }
> = {
  m1: {
    description: 'Specialtykoffie, lokaal gebrand in kleine batches.',
    details: 'Open tot 17:00',
  },
  m2: {
    description: 'Handgemaakte producten van onafhankelijke lokale makers.',
    details: 'Open tot 18:00',
  },
  m3: {
    description: 'Live klassiek concert aan de grachten.',
    details: '12 aug, 19:00',
  },
  m4: {
    description: 'Wekelijkse 5 km-loop met de buurt, gevolgd door koffie.',
    details: 'Zondag, 09:00',
  },
  m5: {
    description: 'Twee voor de prijs van één op verse croissants vóór 12:00.',
    details: 'Vandaag geldig',
  },
  m6: {
    description: 'Borreluur met lokaal bier en bitterballen.',
    details: '17:00 - 19:00',
  },
  m7: {
    description: 'Meubelshowroom met ontwerpen van Rotterdamse makers.',
    details: 'Open tot 18:00',
  },
  m8: {
    description: 'Ontdekkingstours over daken met uitzicht op de stad.',
    details: '4 jun, 10:00',
  },
  m9: {
    description: 'Gratis borrelplank bij twee signature drankjes.',
    details: 'Deze week geldig',
  },
  m19: {
    description: 'Third-wave koffiebar met uitzicht over de haven.',
    details: 'Open tot 16:00',
  },
  m20: {
    description: 'Avondloop over de iconische Zwaanbrug.',
    details: 'Vrijdag, 20:00',
  },
  m10: {
    description: 'Zeldzame vondsten en knusse leeshoeken in een historische kelder.',
    details: 'Open tot 20:00',
  },
  m11: {
    description: 'Vintage en ambachtelijke producten langs de werf.',
    details: 'Zaterdag, 08:00',
  },
  m12: {
    description: 'Proeverij van vier lokale microbrouwsels voor €10.',
    details: 'Geldig in de avond',
  },
  m21: {
    description: 'Intieme jazzsessies in de lounge op het dak.',
    details: 'Vanavond, 22:00',
  },
  m22: {
    description: 'Plantaardige lunchroom met terras.',
    details: 'Open tot 16:00',
  },
  m13: {
    description: 'Geselecteerde koninklijke vondsten en historische objecten.',
    details: 'Open tot 17:00',
  },
  m14: {
    description: 'Samen maken we het strand van Scheveningen schoon.',
    details: 'Zondag, 10:00',
  },
  m15: {
    description: 'Verse Hollandse Nieuwe met korting.',
    details: 'Vandaag geldig',
  },
  m23: {
    description: 'Exclusieve rondleiding buiten openingstijd langs meesterwerken.',
    details: 'Donderdag, 19:00',
  },
  m24: {
    description: 'Antiek- en boekenmarkt onder de lindebomen.',
    details: 'Zondag, 11:00',
  },
  m16: {
    description: 'Open werkplaats met 3D-printers en prototypingtools.',
    details: '24/7 toegang',
  },
  m17: {
    description: 'Kijk achter de schermen bij het komende lichtfestival.',
    details: '15 okt, 19:00',
  },
  m18: {
    description: 'Entree voor de helft van de prijs bij het historische museum.',
    details: 'In het weekend geldig',
  },
  m25: {
    description: 'Afstudeertentoonstelling van opkomende ontwerpers.',
    details: 'Start morgen',
  },
  m26: {
    description: 'Industriële koffiebar met single-origin bonen.',
    details: 'Open tot 18:00',
  },
};

export function getLocationName(location: Location, language: Language) {
  return language === 'nl'
    ? dutchLocationNames[location.id] ?? location.name
    : location.name;
}

export function getMarkerCopy(marker: Marker, language: Language) {
  return language === 'nl'
    ? dutchMarkerCopy[marker.id] ?? marker
    : marker;
}