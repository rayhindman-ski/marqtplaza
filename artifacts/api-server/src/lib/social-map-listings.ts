export const SOCIAL_MAP_SNAPSHOT_DATE = "2026-08-23";

export const SOCIAL_MAP_SOURCE_NOTE =
  "Gecureerde selectie uit Sociale Kaart Den Haag, Haags Steunsysteem en geverifieerde organisatiepagina's. Dit is geen volledige sociale kaart.";

export type SocialMapCategory =
  | "Geldzaken"
  | "Gezin en opvoeden"
  | "Gezondheid"
  | "Hobby's en interesses"
  | "Ondersteuning"
  | "Ontmoeten en samenleven"
  | "Sporten en bewegen"
  | "Taal en computer"
  | "Vervoer"
  | "Werk en opleiding"
  | "Wonen en huishouden"
  | "Zorg voor een naaste";

export type SocialMapListing = {
  id: string;
  name: string;
  socialCategory: SocialMapCategory;
  description: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  officialUrl: string;
  sourcePageUrl: string;
  sourceName: "Sociale Kaart Den Haag" | "Haags Steunsysteem" | "Geverifieerde organisatiepagina";
};

const SOCIAL_MAP_DEN_HAAG = "https://socialekaartdenhaag.nl/";
const HAAGS_STEUNSYSTEEM = "https://haagssteunsysteem.nl/praktische-informatie/sociale-kaart/";

/**
 * A bounded, editorial inventory. Every item has a public physical location,
 * an official destination URL and a named source family; it is intentionally
 * not assembled from an open-ended crawler.
 */
export const SOCIAL_MAP_LISTINGS: readonly SocialMapListing[] = [
  {
    id: "social-taalhuis-den-haag",
    name: "Taalhuis Den Haag",
    socialCategory: "Taal en computer",
    description: "Informatie en advies over taalcursussen, zelfstudie, inburgering en oefenen met Nederlands.",
    address: "Spui 68, 2511 BT Den Haag",
    neighborhood: "Centrum",
    lat: 52.07804,
    lng: 4.31734,
    officialUrl: "https://taalhuisdenhaag.nl/",
    sourcePageUrl: "https://socialekaartdenhaag.nl/organisaties/taalhuis-den-haag/",
    sourceName: "Sociale Kaart Den Haag",
  },
  {
    id: "social-kompassie",
    name: "Kompassie",
    socialCategory: "Gezondheid",
    description: "Zelfregiecentrum voor mentale gezondheid met praktische en emotionele ondersteuning door ervaringsdeskundigen.",
    address: "Laan 20, 2512 GN Den Haag",
    neighborhood: "Centrum",
    lat: 52.07564,
    lng: 4.30783,
    officialUrl: "https://kompassie.nl/",
    sourcePageUrl: "https://socialekaartdenhaag.nl/organisaties/kompassie/",
    sourceName: "Sociale Kaart Den Haag",
  },
  {
    id: "social-de-mussen",
    name: "De Mussen",
    socialCategory: "Gezin en opvoeden",
    description: "Huis van de buurt in de Schilderswijk met activiteiten, ondersteuning en programma's voor kinderen, jongeren en ouders.",
    address: "Hoefkade 602, 2526 BN Den Haag",
    neighborhood: "Schilderswijk",
    lat: 52.06618,
    lng: 4.31515,
    officialUrl: "https://www.demussen.nl/",
    sourcePageUrl: SOCIAL_MAP_DEN_HAAG,
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-pep-den-haag",
    name: "PEP Den Haag",
    socialCategory: "Ondersteuning",
    description: "Ondersteunt vrijwilligers, bewonersinitiatieven en maatschappelijke organisaties in Den Haag.",
    address: "Riviervismarkt 2, 2513 AM Den Haag",
    neighborhood: "Centrum",
    lat: 52.07785,
    lng: 4.30617,
    officialUrl: "https://pepdenhaag.nl/",
    sourcePageUrl: "https://pepdenhaag.nl/contact/",
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-volksuniversiteit",
    name: "Volksuniversiteit Den Haag",
    socialCategory: "Werk en opleiding",
    description: "Cursussen, workshops en lezingen, waaronder Nederlands voor anderstaligen en taalvaardigheid.",
    address: "Zuidlarenstraat 57, 2545 VP Den Haag",
    neighborhood: "Morgenstond",
    lat: 52.04547,
    lng: 4.29435,
    officialUrl: "https://www.volksuniversiteitdenhaag.nl/",
    sourcePageUrl: "https://socialekaartdenhaag.nl/organisaties/volksuniversiteit-den-haag/",
    sourceName: "Sociale Kaart Den Haag",
  },
  {
    id: "social-leger-des-heils-haaglanden",
    name: "Leger des Heils Haaglanden",
    socialCategory: "Ontmoeten en samenleven",
    description: "Buurtlocatie met buurthuiskamer, koffie-inloop, samen eten en een kledingwinkel.",
    address: "Ambachtsgaarde 198, 2542 EX Den Haag",
    neighborhood: "Bouwlust en Vrederust",
    lat: 52.04048,
    lng: 4.27925,
    officialUrl: "https://www.legerdesheils.nl/locatie/haaglanden",
    sourcePageUrl: SOCIAL_MAP_DEN_HAAG,
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-haags-ontmoeten-trefpunt",
    name: "Haags Ontmoeten — Het Trefpunt",
    socialCategory: "Hobby's en interesses",
    description: "Ontmoetingsruimte en activiteiten in Duindorp, met een inloop voor vragen over werk, wonen, zorg en welzijn.",
    address: "Tesselsestraat 71, 2583 JN Den Haag",
    neighborhood: "Duindorp",
    lat: 52.09671,
    lng: 4.26867,
    officialUrl: "https://welzijnscheveningen.nl/locatie/het-trefpunt",
    sourcePageUrl: "https://haagsontmoeten.nl/locaties/",
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-haags-ontmoeten-mallemok",
    name: "Haags Ontmoeten — De Mallemok",
    socialCategory: "Ontmoeten en samenleven",
    description: "Laagdrempelige ontmoetingsplek in het Havenkwartier voor hulp, advies, activiteiten en verbinding.",
    address: "Westduinweg 38, 2583 EK Den Haag",
    neighborhood: "Scheveningen",
    lat: 52.09543,
    lng: 4.28176,
    officialUrl: "https://welzijnscheveningen.nl/locatie/de-mallemok",
    sourcePageUrl: "https://haagsontmoeten.nl/locaties/",
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-sociaal-raadslieden",
    name: "Sociaal Raadslieden Den Haag",
    socialCategory: "Geldzaken",
    description: "Gratis en vertrouwelijk advies over onder meer belastingen, uitkeringen, toeslagen, werk en wonen.",
    address: "Spui 70, 2511 BT Den Haag",
    neighborhood: "Centrum",
    lat: 52.0775,
    lng: 4.31737,
    officialUrl: "https://www.denhaag.nl/nl/geld-en-schulden/sociaal-raadslieden-hulp-bij-wetten-en-regels/",
    sourcePageUrl: SOCIAL_MAP_DEN_HAAG,
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-sportcampus-zuiderpark",
    name: "Sportcampus Zuiderpark",
    socialCategory: "Sporten en bewegen",
    description: "Publieke sportlocatie in het Zuiderpark met ruimte voor sport en bewegen.",
    address: "Mr. P. Droogleever Fortuynweg 22, 2533 SR Den Haag",
    neighborhood: "Moerwijk",
    lat: 52.05272,
    lng: 4.31348,
    officialUrl: "https://sportcampuszuiderpark.nl/nl/",
    sourcePageUrl: HAAGS_STEUNSYSTEEM,
    sourceName: "Haags Steunsysteem",
  },
  {
    id: "social-mantelzorg-den-haag",
    name: "Mantelzorgondersteuning Den Haag",
    socialCategory: "Zorg voor een naaste",
    description: "Informatie, advies en ondersteuning voor mantelzorgers in Den Haag via PEP Den Haag.",
    address: "Riviervismarkt 2, 2513 AM Den Haag",
    neighborhood: "Centrum",
    lat: 52.07785,
    lng: 4.30617,
    officialUrl: "https://pepdenhaag.nl/mantelzorg/",
    sourcePageUrl: HAAGS_STEUNSYSTEEM,
    sourceName: "Haags Steunsysteem",
  },
  {
    id: "social-automaatje-den-haag",
    name: "ANWB AutoMaatje Den Haag",
    socialCategory: "Vervoer",
    description: "Vrijwilligersvervoer voor inwoners die minder mobiel zijn en niet zelfstandig of met het openbaar vervoer kunnen reizen.",
    address: "Riviervismarkt 2, 2513 AM Den Haag",
    neighborhood: "Centrum",
    lat: 52.07785,
    lng: 4.30617,
    officialUrl: "https://www.anwb.nl/lidmaatschap/maatschappelijk/anwb-automaatje",
    sourcePageUrl: HAAGS_STEUNSYSTEEM,
    sourceName: "Haags Steunsysteem",
  },
  {
    id: "social-haags-gemeentearchief",
    name: "Haags Gemeentearchief",
    socialCategory: "Hobby's en interesses",
    description: "Studiezaal in het stadhuis waar bezoekers archieven, boeken, artikelen en tijdschriften kunnen inzien.",
    address: "Spui 70, 2511 BT Den Haag",
    neighborhood: "Centrum",
    lat: 52.0775,
    lng: 4.31737,
    officialUrl: "https://haagsgemeentearchief.nl/studiezaal/langskomen-en-inzien",
    sourcePageUrl: "https://haagsgemeentearchief.nl/contact",
    sourceName: "Geverifieerde organisatiepagina",
  },
  {
    id: "social-kessler-perspektief",
    name: "KesslerPerspektief",
    socialCategory: "Wonen en huishouden",
    description: "Hulp, opvang en begeleiding voor sociaal kwetsbare mensen, onder meer bij dakloosheid en wonen.",
    address: "Zoutmanstraat 75, 2518 GR Den Haag",
    neighborhood: "Zeeheldenkwartier",
    lat: 52.08315,
    lng: 4.29609,
    officialUrl: "https://kesslerperspektief.nl/onze-locaties/",
    sourcePageUrl: SOCIAL_MAP_DEN_HAAG,
    sourceName: "Geverifieerde organisatiepagina",
  },
] as const;