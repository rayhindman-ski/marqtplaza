export type Category = 'Businesses' | 'Events' | 'Specials';

export interface Location {
  id: string;
  name: string;
  postcodes: string[];
  description: string;
  mapType: 'amsterdam' | 'rotterdam' | 'utrecht' | 'denhaag' | 'eindhoven';
  neighborhoods: string[];
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
}

export const LOCATIONS: Location[] = [
  { id: 'ams', name: 'Amsterdam', postcodes: ['1011', '1012', '1013', '1014'], description: 'The historic capital, rich in canals and culture.', mapType: 'amsterdam', neighborhoods: ['Jordaan', 'De Pijp', 'Oud-West'] },
  { id: 'rot', name: 'Rotterdam', postcodes: ['3011', '3012', '3013'], description: 'Modern architecture and the mighty Maas.', mapType: 'rotterdam', neighborhoods: ['Kop van Zuid', 'Kralingen', 'Delfshaven'] },
  { id: 'utr', name: 'Utrecht', postcodes: ['3511', '3512'], description: 'The beating heart of the Netherlands.', mapType: 'utrecht', neighborhoods: ['Wittevrouwen', 'Lombok', 'Oudwijk'] },
  { id: 'dhg', name: 'The Hague', postcodes: ['2511', '2512'], description: 'City of peace, justice, and the sea.', mapType: 'denhaag', neighborhoods: ['Scheveningen', 'Statenkwartier', 'Schilderswijk'] },
  { id: 'ein', name: 'Eindhoven', postcodes: ['5611', '5612'], description: 'The city of light and innovation.', mapType: 'eindhoven', neighborhoods: ['Strijp-S', 'Woensel', 'Stratum'] },
];

export const MARKERS: Marker[] = [
  { id: 'm1', locationId: 'ams', category: 'Businesses', name: 'De Kade Roastery', description: 'Specialty coffee roasted locally in small batches.', x: 40, y: 55, details: 'Open until 17:00' },
  { id: 'm2', locationId: 'ams', category: 'Businesses', name: 'Boutique Lokaal', description: 'Handcrafted goods from independent local artisans.', x: 65, y: 35, details: 'Open until 18:00' },
  { id: 'm3', locationId: 'ams', category: 'Events', name: 'Gracht Festival', description: 'Live classical music performance right on the canals.', x: 50, y: 50, details: 'Aug 12, 19:00' },
  { id: 'm4', locationId: 'ams', category: 'Events', name: 'Vondelpark Run', description: 'Weekly community 5k run followed by coffee.', x: 25, y: 75, details: 'Sunday, 09:00' },
  { id: 'm5', locationId: 'ams', category: 'Specials', name: 'Bakkerij Boter', description: '2 for 1 on all freshly baked croissants before noon.', x: 75, y: 45, details: 'Valid today' },
  { id: 'm6', locationId: 'ams', category: 'Specials', name: 'Café de Jaren', description: 'Happy hour on local draft beers and bitterballen.', x: 45, y: 65, details: '17:00 - 19:00' },
  
  { id: 'm7', locationId: 'rot', category: 'Businesses', name: 'Maas Design', description: 'Industrial furniture showroom featuring Rotterdam designers.', x: 30, y: 60, details: 'Open until 18:00' },
  { id: 'm8', locationId: 'rot', category: 'Events', name: 'Dakendagen', description: 'Rooftop discovery tours showing unseen city views.', x: 60, y: 40, details: 'June 4, 10:00' },
  { id: 'm9', locationId: 'rot', category: 'Specials', name: 'Markthal Bites', description: 'Free tasting platter when ordering two signature drinks.', x: 55, y: 55, details: 'Valid this week' },
  { id: 'm19', locationId: 'rot', category: 'Businesses', name: 'Kop van Zuid Roasters', description: 'Third-wave coffee bar overlooking the harbor.', x: 70, y: 30, details: 'Open until 16:00' },
  { id: 'm20', locationId: 'rot', category: 'Events', name: 'Erasmusbrug Run', description: 'Night run across the iconic Swan bridge.', x: 50, y: 50, details: 'Friday, 20:00' },

  { id: 'm10', locationId: 'utr', category: 'Businesses', name: 'Domstad Books', description: 'Rare finds and cozy reading nooks in a historic cellar.', x: 50, y: 45, details: 'Open until 20:00' },
  { id: 'm11', locationId: 'utr', category: 'Events', name: 'Oudegracht Market', description: 'Vintage and artisan goods along the sunken canal.', x: 45, y: 55, details: 'Saturday, 08:00' },
  { id: 'm12', locationId: 'utr', category: 'Specials', name: 'Bierlokaal', description: 'Tasting flight of 4 local microbrews for €10.', x: 60, y: 40, details: 'Valid evenings' },
  { id: 'm21', locationId: 'utr', category: 'Events', name: 'TivoliVredenburg Late', description: 'Intimate jazz sessions in the rooftop lounge.', x: 40, y: 60, details: 'Tonight, 22:00' },
  { id: 'm22', locationId: 'utr', category: 'Businesses', name: 'Kanaalzicht Cafe', description: 'Plant-based lunchroom with terrace seating.', x: 60, y: 70, details: 'Open until 16:00' },

  { id: 'm13', locationId: 'dhg', category: 'Businesses', name: 'Hofvijver Antiques', description: 'Curated royal finds and historical artifacts.', x: 50, y: 50, details: 'Open until 17:00' },
  { id: 'm14', locationId: 'dhg', category: 'Events', name: 'Beach Clean', description: 'Community coastal cleanup at Scheveningen beach.', x: 20, y: 20, details: 'Sunday, 10:00' },
  { id: 'm15', locationId: 'dhg', category: 'Specials', name: 'Zeezicht Fish', description: 'Fresh Hollandse Nieuwe herring with a discount.', x: 25, y: 25, details: 'Valid today' },
  { id: 'm23', locationId: 'dhg', category: 'Events', name: 'Mauritshuis Tour', description: 'Exclusive after-hours guided tour of masterpieces.', x: 55, y: 45, details: 'Thursday, 19:00' },
  { id: 'm24', locationId: 'dhg', category: 'Events', name: 'Lange Voorhout Market', description: 'Antique and book market under the linden trees.', x: 50, y: 60, details: 'Sunday, 11:00' },

  { id: 'm16', locationId: 'ein', category: 'Businesses', name: 'Strijp-S Tech Lab', description: 'Open workspace with 3D printing and prototyping tools.', x: 35, y: 45, details: '24/7 Access' },
  { id: 'm17', locationId: 'ein', category: 'Events', name: 'Glow Prep', description: 'Behind the scenes tour of the upcoming light festival.', x: 60, y: 60, details: 'Oct 15, 19:00' },
  { id: 'm18', locationId: 'ein', category: 'Specials', name: 'Philips Heritage', description: 'Half price entry to the historic museum.', x: 50, y: 40, details: 'Valid weekends' },
  { id: 'm25', locationId: 'ein', category: 'Events', name: 'Design Academy Show', description: 'Graduation exhibition from emerging designers.', x: 45, y: 50, details: 'Starts tomorrow' },
  { id: 'm26', locationId: 'ein', category: 'Businesses', name: 'Klokgebouw Coffee', description: 'Industrial coffee bar serving single-origin beans.', x: 30, y: 40, details: 'Open until 18:00' },
];