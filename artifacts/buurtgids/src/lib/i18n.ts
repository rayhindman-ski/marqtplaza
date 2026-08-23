import type { BusinessCategory, Category, ListingSource, Location, Marker, SocialMapCategory } from './data';

export type Language = 'nl' | 'en';

export const LANGUAGE_OPTIONS: Array<{ value: Language; label: string }> = [
  { value: 'nl', label: 'Nederlands' },
  { value: 'en', label: 'English' },
];

export const translations = {
  nl: {
    languageLabel: 'Taal',
    searchDescription: 'Zoek lokaal in Den Haag en ontdek verborgen plekken in jouw buurt.',
    placeholder: 'Zoek lokaal in Den Haag (bijv. 2511 AB)',
    explore: 'Ontdek',
    popularDestinations: 'Populaire bestemmingen',
    popularNeighborhoods: 'Populaire buurten',
    neighborhoods: 'Buurten',
    neighborhoodLabel: 'Buurt',
    postcodeFilterLabel: 'Postcode',
    postcodeFilterPlaceholder: 'Filter op postcode, bijv. 2511',
    allNeighborhoods: 'Alle buurten',
    selectAllNeighborhoods: 'Selecteer alles',
    clearNeighborhoodSelection: 'Deselecteer alles',
    neighborhoodsSelected: (count: number) => `${count} ${count === 1 ? 'buurt' : 'buurten'} geselecteerd`,
    chooseNeighborhood: (city: string) => `Kies een buurt in ${city}`,
    emptySearch: 'Vul een stad of Haagse postcode in.',
    locationNotFound:
      'Locatie niet gevonden. Probeer Den Haag of een Haagse postcode, zoals 2511 AB.',
    categories: {
      Museums: 'Musea',
      Tours: 'Rondleidingen',
      Family: 'Gezin & Kinderen',
      Entertainment: 'Entertainment',
      Outdoors: 'Buiten & Sport',
      Markets: 'Markten & Food',
      Businesses: 'Bedrijven',
      'Food & Drink': 'Horeca',
      'Social map': 'Sociale kaart',
    },
    topLevelCategories: 'Hoofdcategorieën',
    subcategories: 'Subcategorieën',
    businessCategories: {
      'Retail & Shopping': 'Winkelen & retail',
      'Food & Drink': 'Horeca',
      'Health & Wellness': 'Gezondheid & welzijn',
      'Beauty & Personal Care': 'Beauty & persoonlijke verzorging',
      'Professional Services': 'Professionele diensten',
      'Finance & Legal': 'Financiën & juridisch',
      'Home & Repair': 'Wonen & reparatie',
      'Automotive & Mobility': 'Auto & mobiliteit',
      'Education & Childcare': 'Onderwijs & kinderopvang',
      'Hospitality & Travel': 'Gastvrijheid & reizen',
      'Arts, Culture & Entertainment': 'Kunst, cultuur & entertainment',
      'Fitness & Sports': 'Fitness & sport',
    },
    socialMapCategories: {
      Geldzaken: 'Geldzaken',
      'Gezin en opvoeden': 'Gezin en opvoeden',
      Gezondheid: 'Gezondheid',
      "Hobby's en interesses": "Hobby's en interesses",
      Ondersteuning: 'Ondersteuning',
      'Ontmoeten en samenleven': 'Ontmoeten en samenleven',
      'Sporten en bewegen': 'Sporten en bewegen',
      'Taal en computer': 'Taal en computer',
      Vervoer: 'Vervoer',
      'Werk en opleiding': 'Werk en opleiding',
      'Wonen en huishouden': 'Wonen en huishouden',
      'Zorg voor een naaste': 'Zorg voor een naaste',
    },
    listingSources: {
      google_maps: 'Google Maps',
      openstreetmap: 'OpenStreetMap',
      curated: 'Samengesteld',
      source_scan: 'Bronscan',
    },
    backToSearch: 'Terug naar zoeken',
    discoveriesNearby: (count: number) =>
      `${count} ${count === 1 ? 'ontdekking' : 'ontdekkingen'} in de buurt`,
    selectMarker: (name: string) => `Selecteer ${name}`,
    openMarker: (name: string) => `Open ${name} in een nieuw tabblad`,
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
      { id: 'locals', label: 'Bedrijven' },
      { id: 'food-drink', label: 'Horeca' },
      { id: 'social-map', label: 'Sociale kaart' },
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
    // Live data
    loadingListings: 'Live gegevens ophalen…',
    listingsError: 'Kon live gegevens niet laden',
    retryButton: 'Opnieuw proberen',
    liveDataBadge: 'Live',
    curatedDataBadge: 'Samengesteld',
    dataUnavailable: 'Live data tijdelijk niet beschikbaar – gecureerde vermeldingen worden weergegeven',
    listingsCoverageNote: 'Brede selectie uit Google Places en OpenStreetMap; geen volledige bedrijvengids.',
    socialMapCoverageNote: 'Gecureerde Haagse selectie uit Sociale Kaart Den Haag, Haags Steunsysteem en officiële organisatiepagina’s; geen volledige sociale kaart.',
    socialMapSnapshot: (date: string) => `Bronnen en locaties gecontroleerd op ${date}.`,
    officialWebsite: 'Officiële website',
    sourcePage: 'Bronpagina',
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
    searchDescription: 'Search locally in The Hague and discover hidden places in your neighbourhood.',
    placeholder: 'Search locally in The Hague (e.g. 2511 AB)',
    explore: 'Explore',
    popularDestinations: 'Popular destinations',
    popularNeighborhoods: 'Popular neighborhoods',
    neighborhoods: 'Neighborhoods',
    neighborhoodLabel: 'Neighborhood',
    postcodeFilterLabel: 'Postcode',
    postcodeFilterPlaceholder: 'Filter by postcode, e.g. 2511',
    allNeighborhoods: 'All neighborhoods',
    selectAllNeighborhoods: 'Select all',
    clearNeighborhoodSelection: 'Deselect all',
    neighborhoodsSelected: (count: number) => `${count} ${count === 1 ? 'neighborhood' : 'neighborhoods'} selected`,
    chooseNeighborhood: (city: string) => `Choose a neighborhood in ${city}`,
    emptySearch: 'Please enter a city or Hague postcode.',
    locationNotFound:
      'Location not found. Try The Hague or a Hague postcode, such as 2511 AB.',
    categories: {
      Museums: 'Museums',
      Tours: 'Tours',
      Family: 'Family & Kids',
      Entertainment: 'Entertainment',
      Outdoors: 'Outdoors',
      Markets: 'Food & Markets',
      Businesses: 'Businesses',
      'Food & Drink': 'Food & drink',
      'Social map': 'Social map',
    },
    topLevelCategories: 'Top-level categories',
    subcategories: 'Subcategories',
    businessCategories: {
      'Retail & Shopping': 'Retail & shopping',
      'Food & Drink': 'Food & drink',
      'Health & Wellness': 'Health & wellness',
      'Beauty & Personal Care': 'Beauty & personal care',
      'Professional Services': 'Professional services',
      'Finance & Legal': 'Finance & legal',
      'Home & Repair': 'Home & repair',
      'Automotive & Mobility': 'Automotive & mobility',
      'Education & Childcare': 'Education & childcare',
      'Hospitality & Travel': 'Hospitality & travel',
      'Arts, Culture & Entertainment': 'Arts, culture & entertainment',
      'Fitness & Sports': 'Fitness & sports',
    },
    socialMapCategories: {
      Geldzaken: 'Money matters',
      'Gezin en opvoeden': 'Family & parenting',
      Gezondheid: 'Health',
      "Hobby's en interesses": 'Hobbies & interests',
      Ondersteuning: 'Support',
      'Ontmoeten en samenleven': 'Meeting & community',
      'Sporten en bewegen': 'Sports & exercise',
      'Taal en computer': 'Language & digital skills',
      Vervoer: 'Transport',
      'Werk en opleiding': 'Work & education',
      'Wonen en huishouden': 'Housing & household',
      'Zorg voor een naaste': 'Caring for someone close',
    },
    listingSources: {
      google_maps: 'Google Maps',
      openstreetmap: 'OpenStreetMap',
      curated: 'Curated',
      source_scan: 'Source scan',
    },
    backToSearch: 'Back to search',
    discoveriesNearby: (count: number) =>
      `${count} ${count === 1 ? 'discovery' : 'discoveries'} nearby`,
    selectMarker: (name: string) => `Select ${name}`,
    openMarker: (name: string) => `Open ${name} in a new tab`,
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
      { id: 'locals', label: 'Businesses' },
      { id: 'food-drink', label: 'Food & drink' },
      { id: 'social-map', label: 'Social map' },
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
    // Live data
    loadingListings: 'Fetching live data…',
    listingsError: 'Could not load live listings',
    retryButton: 'Try again',
    liveDataBadge: 'Live',
    curatedDataBadge: 'Curated',
    dataUnavailable: 'Live data temporarily unavailable – showing curated listings',
    listingsCoverageNote: 'Broad selection from Google Places and OpenStreetMap; not a complete business directory.',
    socialMapCoverageNote: 'Curated Hague selection from Sociale Kaart Den Haag, Haags Steunsysteem and official organization pages; not a complete social map.',
    socialMapSnapshot: (date: string) => `Sources and locations checked on ${date}.`,
    officialWebsite: 'Official website',
    sourcePage: 'Source page',
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

export function getBusinessCategoryName(category: BusinessCategory, language: Language): string {
  return translations[language].businessCategories[category];
}

export function getSocialMapCategoryName(category: SocialMapCategory, language: Language): string {
  return translations[language].socialMapCategories[category];
}

export function getListingSourceName(source: ListingSource, language: Language): string {
  return translations[language].listingSources[source];
}

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
  // ── Den Haag ──────────────────────────────────────────────────────────────
  'dhg-m1': {
    description: 'Thuisbasis van Vermeers Meisje met de Parel en Rembrandts De Anatomische Les.',
    details: 'Open di–zo 10:00–18:00',
  },
  'dhg-m2': {
    description: 'Grootste Mondriaancollectie ter wereld in een schitterend art-decogebouw uit 1935.',
    details: 'Open di–zo 10:00–17:00',
  },
  'dhg-m3': {
    description: 'Stap in een schilderij uit 1881 van Scheveningen — het grootste ronde panorama ter wereld.',
    details: 'Dagelijks open 10:00–17:00',
  },
  'dhg-m4': {
    description: 'M.C. Eschers verbluffende grafiek in een voormalig koninklijk paleis aan het Lange Voorhout.',
    details: 'Open di–zo 11:00–17:00',
  },
  'dhg-m5': {
    description: 'Oudste privécollectie klassieke auto\'s ter wereld — meer dan 230 voertuigen vanaf 1886.',
    details: 'Open di–zo 10:00–17:00',
  },
  'dhg-t1': {
    description: 'Gratis rondleiding op fooi langs de geschiedenis, architectuur en koninklijke hoogtepunten van Den Haag.',
    details: 'Dagelijks 10:30 & 14:00',
  },
  'dhg-t2': {
    description: 'Ontdek de mooiste plekken van de stad per fiets met een ervaren lokale gids.',
    details: 'Vooraf boeken',
  },
  'dhg-t3': {
    description: 'Rondleiding door de opkomende creatieve wijk Binckhorst — murals en urban art.',
    details: 'Weekend, 13:00',
  },
  'dhg-t4': {
    description: 'Los het mysterie op van de ontsnapping van Hugo de Groot in dit buiten historisch stadsspel.',
    details: 'Dagelijks beschikbaar',
  },
  'dhg-t5': {
    description: 'Bezoek de iconische zetel van internationale gerechtigheid — rondleidingen en een interactief bezoekerscentrum.',
    details: 'Bezoekerscentrum dagelijks open',
  },
  'dhg-f1': {
    description: 'Verken een miniatuur Nederland op schaal 1:25 — molens, grachten en een werkend vliegveld.',
    details: 'Dagelijks open 09:00–19:00',
  },
  'dhg-f2': {
    description: 'Loop door een onderwateroceaantunnel en ontdek honderden zeewezens.',
    details: 'Dagelijks open 10:00–19:00',
  },
  'dhg-f3': {
    description: 'Hands-on wetenschapsmuseum met een 360° koepelbioscoop voor films over aarde en ruimte.',
    details: 'Dagelijks open 10:00–17:00',
  },
  'dhg-f4': {
    description: 'Overdekte strandtuin voor kinderen — glijbanen, zandbakken en planspeelbassins.',
    details: 'Dagelijks open 10:00–18:00',
  },
  'dhg-e1': {
    description: 'Bekroonde escape rooms met ★4,9 op Google door 1.294 bezoekers — boek vooruit in het weekend.',
    details: 'Dagelijks open 10:00–23:00',
  },
  'dhg-e2': {
    description: 'Meeslepende VR-ervaringen: horror, avontuur en multiplayer gaming in gedeelde virtuele werelden.',
    details: 'Open di–zo 11:00–22:00',
  },
  'dhg-e3': {
    description: 'Bioscoop aan de Scheveningse boulevard — de nieuwste films met zeezicht.',
    details: 'Tijden online bekijken',
  },
  'dhg-e4': {
    description: 'Opvallend theater direct op het strand van Scheveningen — een unieke plek voor live voorstellingen.',
    details: 'Zie website voor programma',
  },
  'dhg-o1': {
    description: '11 km zandstrand met strandtenten, watersport en onvergetelijke zonsondergangen boven de Noordzee.',
    details: '24/7 open',
  },
  'dhg-o2': {
    description: 'Zandduinnatuurreservaat tot aan het strand van Kijkduin — ideaal voor wandelen en fietsen.',
    details: '24/7 open',
  },
  'dhg-o3': {
    description: 'Oud koninklijk bos aan de rand van de stad — hardlooppaadjes, reeën en een verborgen paleis.',
    details: 'Dagelijks open, gratis toegang',
  },
  'dhg-mk1': {
    description: 'Een van de grootste buitenmarkten van Europa — verse producten, streetfood en wereldse smaken.',
    details: 'Ma, wo, vr & za 08:00–17:00',
  },
  'dhg-mk2': {
    description: 'Antieke boeken, kunst en curiosa onder de historische lindebomen van het Lange Voorhout.',
    details: 'Zondag 11:00–17:00',
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

export function getMarkerCopy(
  marker: Pick<Marker, 'id' | 'description' | 'details'>,
  language: Language,
) {
  return language === 'nl'
    ? dutchMarkerCopy[marker.id] ?? marker
    : marker;
}
