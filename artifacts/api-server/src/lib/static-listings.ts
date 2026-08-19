// Static curated listings used as fallback when the live data provider is unavailable.
// These mirror the sample data in artifacts/buurtgids/src/lib/data.ts so both the
// web app (for its SavedView) and the API server share the same fallback shape.

export interface StaticMarker {
  id: string;
  locationId: string;
  category: "Businesses" | "Events" | "Specials";
  name: string;
  description: string;
  x: number;
  y: number;
  details: string;
  lat: number;
  lng: number;
}

export const MARKERS: StaticMarker[] = [
  // Amsterdam
  { id: "m1", locationId: "ams", category: "Businesses", name: "De Kade Roastery", description: "Specialty coffee roasted locally in small batches.", x: 40, y: 55, details: "Open until 17:00", lat: 52.3748, lng: 4.8820 },
  { id: "m2", locationId: "ams", category: "Businesses", name: "Boutique Lokaal", description: "Handcrafted goods from independent local artisans.", x: 65, y: 35, details: "Open until 18:00", lat: 52.3660, lng: 4.9030 },
  { id: "m3", locationId: "ams", category: "Events", name: "Gracht Festival", description: "Live classical music performance right on the canals.", x: 50, y: 50, details: "Aug 12, 19:00", lat: 52.3700, lng: 4.8980 },
  { id: "m4", locationId: "ams", category: "Events", name: "Vondelpark Run", description: "Weekly community 5k run followed by coffee.", x: 25, y: 75, details: "Sunday, 09:00", lat: 52.3580, lng: 4.8681 },
  { id: "m5", locationId: "ams", category: "Specials", name: "Bakkerij Boter", description: "2 for 1 on all freshly baked croissants before noon.", x: 75, y: 45, details: "Valid today", lat: 52.3724, lng: 4.9110 },
  { id: "m6", locationId: "ams", category: "Specials", name: "Café de Jaren", description: "Happy hour on local draft beers and bitterballen.", x: 45, y: 65, details: "17:00 - 19:00", lat: 52.3681, lng: 4.8960 },

  // Rotterdam
  { id: "m7", locationId: "rot", category: "Businesses", name: "Maas Design", description: "Industrial furniture showroom featuring Rotterdam designers.", x: 30, y: 60, details: "Open until 18:00", lat: 51.9101, lng: 4.4820 },
  { id: "m8", locationId: "rot", category: "Events", name: "Dakendagen", description: "Rooftop discovery tours showing unseen city views.", x: 60, y: 40, details: "June 4, 10:00", lat: 51.9244, lng: 4.4777 },
  { id: "m9", locationId: "rot", category: "Specials", name: "Markthal Bites", description: "Free tasting platter when ordering two signature drinks.", x: 55, y: 55, details: "Valid this week", lat: 51.9200, lng: 4.4840 },
  { id: "m19", locationId: "rot", category: "Businesses", name: "Kop van Zuid Roasters", description: "Third-wave coffee bar overlooking the harbor.", x: 70, y: 30, details: "Open until 16:00", lat: 51.9055, lng: 4.4833 },
  { id: "m20", locationId: "rot", category: "Events", name: "Erasmusbrug Run", description: "Night run across the iconic Swan bridge.", x: 50, y: 50, details: "Friday, 20:00", lat: 51.9118, lng: 4.4845 },
  { id: "m27", locationId: "rot", category: "Events", name: "Kralingen Culture Walk", description: "A self-guided route through local parks, galleries, and cafés.", x: 82, y: 24, details: "Available daily", lat: 51.9231, lng: 4.5249 },
  { id: "m28", locationId: "rot", category: "Events", name: "Delfshaven Makers Market", description: "Weekend market celebrating local makers and vintage finds.", x: 12, y: 62, details: "Saturday, 10:00", lat: 51.9101, lng: 4.4425 },

  // Utrecht
  { id: "m10", locationId: "utr", category: "Businesses", name: "Domstad Books", description: "Rare finds and cozy reading nooks in a historic cellar.", x: 50, y: 45, details: "Open until 20:00", lat: 52.0907, lng: 5.1214 },
  { id: "m11", locationId: "utr", category: "Events", name: "Oudegracht Market", description: "Vintage and artisan goods along the sunken canal.", x: 45, y: 55, details: "Saturday, 08:00", lat: 52.0882, lng: 5.1160 },
  { id: "m12", locationId: "utr", category: "Specials", name: "Bierlokaal", description: "Tasting flight of 4 local microbrews for €10.", x: 60, y: 40, details: "Valid evenings", lat: 52.0942, lng: 5.1318 },
  { id: "m21", locationId: "utr", category: "Events", name: "TivoliVredenburg Late", description: "Intimate jazz sessions in the rooftop lounge.", x: 40, y: 60, details: "Tonight, 22:00", lat: 52.0925, lng: 5.1179 },
  { id: "m22", locationId: "utr", category: "Businesses", name: "Kanaalzicht Cafe", description: "Plant-based lunchroom with terrace seating.", x: 60, y: 70, details: "Open until 16:00", lat: 52.0876, lng: 5.1011 },

  // The Hague
  { id: "m13", locationId: "dhg", category: "Businesses", name: "Hofvijver Antiques", description: "Curated royal finds and historical artifacts.", x: 50, y: 50, details: "Open until 17:00", lat: 52.0797, lng: 4.3125 },
  { id: "m14", locationId: "dhg", category: "Events", name: "Beach Clean", description: "Community coastal cleanup at Scheveningen beach.", x: 20, y: 20, details: "Sunday, 10:00", lat: 52.1059, lng: 4.2742 },
  { id: "m15", locationId: "dhg", category: "Specials", name: "Zeezicht Fish", description: "Fresh Hollandse Nieuwe herring with a discount.", x: 25, y: 25, details: "Valid today", lat: 52.1040, lng: 4.2780 },
  { id: "m23", locationId: "dhg", category: "Events", name: "Mauritshuis Tour", description: "Exclusive after-hours guided tour of masterpieces.", x: 55, y: 45, details: "Thursday, 19:00", lat: 52.0802, lng: 4.3135 },
  { id: "m24", locationId: "dhg", category: "Events", name: "Lange Voorhout Market", description: "Antique and book market under the linden trees.", x: 50, y: 60, details: "Sunday, 11:00", lat: 52.0848, lng: 4.3093 },

  // Eindhoven
  { id: "m16", locationId: "ein", category: "Businesses", name: "Strijp-S Tech Lab", description: "Open workspace with 3D printing and prototyping tools.", x: 35, y: 45, details: "24/7 Access", lat: 51.4478, lng: 5.4489 },
  { id: "m17", locationId: "ein", category: "Events", name: "Glow Prep", description: "Behind the scenes tour of the upcoming light festival.", x: 60, y: 60, details: "Oct 15, 19:00", lat: 51.4416, lng: 5.4697 },
  { id: "m18", locationId: "ein", category: "Specials", name: "Philips Heritage", description: "Half price entry to the historic museum.", x: 50, y: 40, details: "Valid weekends", lat: 51.4400, lng: 5.4760 },
  { id: "m25", locationId: "ein", category: "Events", name: "Design Academy Show", description: "Graduation exhibition from emerging designers.", x: 45, y: 50, details: "Starts tomorrow", lat: 51.4430, lng: 5.4730 },
  { id: "m26", locationId: "ein", category: "Businesses", name: "Klokgebouw Coffee", description: "Industrial coffee bar serving single-origin beans.", x: 30, y: 40, details: "Open until 18:00", lat: 51.4480, lng: 5.4510 },
  { id: "m29", locationId: "ein", category: "Events", name: "Woensel Food & Music Night", description: "An evening of local food stalls and live neighbourhood music.", x: 62, y: 20, details: "Friday, 18:00", lat: 51.4663, lng: 5.4752 },
];
