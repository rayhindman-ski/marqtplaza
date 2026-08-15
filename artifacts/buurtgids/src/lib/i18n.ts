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
    neighborhoods: 'Buurten',
    neighborhoodLabel: 'Buurt',
    allNeighborhoods: 'Alle buurten',
    chooseNeighborhood: (city: string) => `Kies een buurt in ${city}`,
    exploreCity: (city: string) => `Ontdek ${city}`,
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
    // Saved places
    savedPlaces: 'Opgeslagen plekken',
    savedCount: (n: number) => `${n} opgeslagen`,
    savePlace: 'Sla op',
    saved: 'Opgeslagen',
    removeSaved: 'Verwijder',
    noSavedPlaces: 'Nog geen opgeslagen plekken',
    noSavedPlacesDescription:
      'Tik op het bladwijzerpictogram bij een bedrijf, evenement of aanbieding om het hier op te slaan.',
    exploreNeighbourhoods: 'Ontdek buurten',
    // Capture page
    capture: 'Vastleggen',
    captureTitle: 'Bedrijven vastleggen',
    captureSubtitle: 'Zoek bedrijven op en scan hun digitale aanwezigheid op evenementen en nieuws.',
    captureUrlLabel: 'Website URL',
    captureUrlPlaceholder: 'https://voorbeeld.nl',
    captureNameLabel: 'Bedrijfsnaam',
    captureNamePlaceholder: 'bijv. De Kade Roastery',
    captureZipLabel: 'Postcode',
    captureZipPlaceholder: 'bijv. 1011 AB',
    captureNeighbourhoodLabel: 'Buurt',
    captureNeighbourhoodPlaceholder: 'bijv. Jordaan',
    captureSearch: 'Zoeken',
    captureScan: 'Scannen',
    capturePersist: 'Opslaan',
    captureLocate: 'Locatie',
    captureBusinessesFound: (n: number) => `${n} bedrijf${n !== 1 ? 'en' : ''} gevonden`,
    captureNoBusinesses: 'Geen bedrijven gevonden. Pas je zoekopdracht aan.',
    captureScanToggle: 'Scan dit bedrijf',
    captureResultsTitle: 'Scanresultaten',
    captureNoResults: 'Voer een scan uit om resultaten te zien.',
    captureColType: 'Type',
    captureColTitle: 'Titel',
    captureColSource: 'Bron',
    captureColDate: 'Datum',
    capturePersistSuccess: (n: number) => `${n} resultaat${n !== 1 ? 'en' : ''} opgeslagen.`,
    capturePersistError: 'Opslaan mislukt. Probeer opnieuw.',
    captureSelectAll: 'Alles selecteren',
    captureDeselectAll: 'Deselecteren',
    captureTypeBadge: { news: 'Nieuws', event: 'Evenement', ad: 'Advertentie' } as Record<string, string>,
  },
  en: {
    languageLabel: 'Language',
    searchDescription: 'Discover the unseen corners of your neighbourhood without the noise.',
    placeholder: 'Enter city or postcode (e.g. Amsterdam, 1011)',
    explore: 'Explore',
    popularDestinations: 'Popular destinations',
    neighborhoods: 'Neighborhoods',
    neighborhoodLabel: 'Neighborhood',
    allNeighborhoods: 'All neighborhoods',
    chooseNeighborhood: (city: string) => `Choose a neighborhood in ${city}`,
    exploreCity: (city: string) => `Explore ${city}`,
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
    // Saved places
    savedPlaces: 'Saved Places',
    savedCount: (n: number) => `${n} saved`,
    savePlace: 'Save place',
    saved: 'Saved',
    removeSaved: 'Remove',
    noSavedPlaces: 'No saved places yet',
    noSavedPlacesDescription:
      'Tap the bookmark icon on any business, event, or special to save it here for later.',
    exploreNeighbourhoods: 'Explore Neighbourhoods',
    // Capture page
    capture: 'Capture',
    captureTitle: 'Capture Businesses',
    captureSubtitle: 'Search for businesses and scan their digital presence for events and news.',
    captureUrlLabel: 'Website URL',
    captureUrlPlaceholder: 'https://example.com',
    captureNameLabel: 'Business Name',
    captureNamePlaceholder: 'e.g. De Kade Roastery',
    captureZipLabel: 'Zip Code',
    captureZipPlaceholder: 'e.g. 1011 AB',
    captureNeighbourhoodLabel: 'Neighbourhood',
    captureNeighbourhoodPlaceholder: 'e.g. Jordaan',
    captureSearch: 'Search',
    captureScan: 'Scan',
    capturePersist: 'Save',
    captureLocate: 'Locate',
    captureBusinessesFound: (n: number) => `${n} business${n !== 1 ? 'es' : ''} found`,
    captureNoBusinesses: 'No businesses found. Try adjusting your search.',
    captureScanToggle: 'Scan this business',
    captureResultsTitle: 'Scan Results',
    captureNoResults: 'Run a scan to see results here.',
    captureColType: 'Type',
    captureColTitle: 'Title',
    captureColSource: 'Source',
    captureColDate: 'Date',
    capturePersistSuccess: (n: number) => `${n} result${n !== 1 ? 's' : ''} saved.`,
    capturePersistError: 'Failed to save. Please try again.',
    captureSelectAll: 'Select all',
    captureDeselectAll: 'Deselect all',
    captureTypeBadge: { news: 'News', event: 'Event', ad: 'Ad' } as Record<string, string>,
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
    description: 'Daktours met uitzicht op plekken die je normaal nooit ziet.',
    details: '4 jun, 10:00',
  },
  m9: {
    description: 'Gratis proeverij bij twee signature drankjes.',
    details: 'Geldig deze week',
  },
  m19: {
    description: 'Derdegolfkoffiebar met uitzicht op de haven.',
    details: 'Open tot 16:00',
  },
  m20: {
    description: 'Nachtloop over de iconische Zwanenbrug.',
    details: 'Vrijdag, 20:00',
  },
  m10: {
    description: 'Zeldzame vondsten en knus lezen in een historische kelder.',
    details: 'Open tot 20:00',
  },
  m11: {
    description: 'Vintage en artisanale producten langs de verzonken gracht.',
    details: 'Zaterdag, 08:00',
  },
  m12: {
    description: 'Proefvlucht van 4 lokale microbrouwerijen voor €10.',
    details: 'Geldig \'s avonds',
  },
  m21: {
    description: 'Intieme jazzsessies in het daklounge.',
    details: 'Vanavond, 22:00',
  },
  m22: {
    description: 'Plantaardig lunchrestaurant met terras.',
    details: 'Open tot 16:00',
  },
  m13: {
    description: 'Geselecteerde koninklijke vondsten en historische artefacten.',
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
