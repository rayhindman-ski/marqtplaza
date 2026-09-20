import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import {
  Baby,
  Coffee,
  Gamepad2,
  HandHeart,
  Landmark,
  MapPin as MapPinIcon,
  Route,
  ShoppingBag,
  Waves,
  X,
  Building2,
  Briefcase,
  Store,
  Cross,
  Utensils,
  Croissant,
  Martini,
  HeartHandshake,
  GraduationCap,
  Bus,
  Coins,
  Stethoscope,
  Palette,
  MonitorPlay,
  HeartPulse,
  Wrench,
  Car,
  Bed,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { type Marker as MarkerData, LOCATIONS, type Category, type BusinessCategory, type SocialMapCategory, type FoodType } from '../lib/data';
import { getMarkerCopy, translations, type Language } from '../lib/i18n';
import { NEIGHBORHOOD_BOUNDARIES, type BoundaryPoint, type NeighborhoodBoundary } from '@workspace/geo';

type MapCategory = Category;

const CATEGORY_COLORS: Record<MapCategory, string> = {
  Museums:       '#8b5cf6',
  Tours:         '#f36c21',
  Family:        '#ec4899',
  Entertainment: '#6366f1',
  Outdoors:      '#10b981',
  Markets:       '#f59e0b',
  Businesses:    '#0ea5e9',
  'Food & Drink': '#b45309',
  'Social map': '#0f766e',
};

const BUSINESS_CATEGORY_COLORS: Record<BusinessCategory, string> = {
  'Retail & Shopping': '#2563eb',
  'Food & Drink': '#b45309',
  'Health & Wellness': '#dc2626',
  'Beauty & Personal Care': '#db2777',
  'Professional Services': '#4f46e5',
  'Finance & Legal': '#0f766e',
  'Home & Repair': '#7c3aed',
  'Automotive & Mobility': '#475569',
  'Education & Childcare': '#0891b2',
  'Hospitality & Travel': '#c2410c',
  'Arts, Culture & Entertainment': '#9333ea',
  'Fitness & Sports': '#16a34a',
};

const FOOD_TYPE_COLORS: Record<FoodType, string> = {
  restaurant: '#c2410c',
  cafe: '#92400e',
  bar: '#7e22ce',
  bakery: '#d97706',
  takeaway: '#e11d48',
  other: '#64748b',
};

const SOCIAL_CATEGORY_COLORS: Record<SocialMapCategory, string> = {
  Geldzaken: '#047857',
  'Gezin en opvoeden': '#db2777',
  Gezondheid: '#dc2626',
  'Heilige plaatsen': '#7c3aed',
  "Hobby's en interesses": '#9333ea',
  Ondersteuning: '#ea580c',
  'Ontmoeten en samenleven': '#0f766e',
  'Sporten en bewegen': '#16a34a',
  'Taal en computer': '#2563eb',
  Vervoer: '#475569',
  'Werk en opleiding': '#4f46e5',
  'Wonen en huishouden': '#b45309',
  'Zorg voor een naaste': '#be123c',
};

function getSubcategoryIcon(marker: Pick<MarkerData, 'category' | 'businessCategory' | 'socialCategory' | 'foodType'>): LucideIcon {
  if (marker.category === 'Food & Drink' && marker.foodType) {
    const foodIcons: Record<FoodType, LucideIcon> = {
      restaurant: Utensils,
      cafe: Coffee,
      bar: Martini,
      bakery: Croissant,
      takeaway: ShoppingBag,
      other: Coffee,
    };
    return foodIcons[marker.foodType] ?? Coffee;
  }

  if (marker.category === 'Businesses' && marker.businessCategory) {
    const businessIcons: Record<BusinessCategory, LucideIcon> = {
      'Retail & Shopping': Store,
      'Food & Drink': Utensils,
      'Health & Wellness': HeartPulse,
      'Beauty & Personal Care': HeartPulse,
      'Professional Services': Briefcase,
      'Finance & Legal': Building2,
      'Home & Repair': Wrench,
      'Automotive & Mobility': Car,
      'Education & Childcare': GraduationCap,
      'Hospitality & Travel': Bed,
      'Arts, Culture & Entertainment': Palette,
      'Fitness & Sports': Activity,
    };
    return businessIcons[marker.businessCategory] ?? MapPinIcon;
  }

  if (marker.category === 'Social map' && marker.socialCategory) {
    const socialIcons: Record<SocialMapCategory, LucideIcon> = {
      'Geldzaken': Coins,
      'Gezin en opvoeden': Baby,
      'Gezondheid': Stethoscope,
      'Heilige plaatsen': Cross,
      "Hobby's en interesses": Palette,
      'Ondersteuning': HeartHandshake,
      'Ontmoeten en samenleven': HandHeart,
      'Sporten en bewegen': Activity,
      'Taal en computer': MonitorPlay,
      'Vervoer': Bus,
      'Werk en opleiding': Briefcase,
      'Wonen en huishouden': Building2,
      'Zorg voor een naaste': HandHeart,
    };
    return socialIcons[marker.socialCategory] ?? HandHeart;
  }

  return CATEGORY_ICONS[marker.category] ?? MapPinIcon;
}

const CATEGORY_ICONS: Record<MapCategory, LucideIcon> = {
  Museums: Landmark,
  Tours: Route,
  Family: Baby,
  Entertainment: Gamepad2,
  Outdoors: Waves,
  Markets: ShoppingBag,
  Businesses: MapPinIcon,
  'Food & Drink': Coffee,
  'Social map': HandHeart,
};

function getMarkerVisualKey(
  marker: Pick<MarkerData, 'category' | 'businessCategory' | 'socialCategory' | 'foodType'>,
) {
  if (marker.category === 'Food & Drink' && marker.foodType) return `${marker.category}:${marker.foodType}`;
  if (marker.category === 'Businesses' && marker.businessCategory) return `${marker.category}:${marker.businessCategory}`;
  if (marker.category === 'Social map' && marker.socialCategory) return `${marker.category}:${marker.socialCategory}`;
  return marker.category;
}

function getMarkerVisualLabel(
  marker: Pick<MarkerData, 'category' | 'businessCategory' | 'socialCategory' | 'foodType'>,
) {
  return marker.foodType ?? marker.businessCategory ?? marker.socialCategory ?? marker.category;
}

function getClusterVisual(points: MapPoint[]) {
  const counts = new Map<string, { count: number; marker: MapPoint }>();
  for (const point of points) {
    const key = getMarkerVisualKey(point);
    const current = counts.get(key);
    counts.set(key, { count: (current?.count ?? 0) + 1, marker: current?.marker ?? point });
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const dominantMarker = ranked[0]?.marker ?? points[0]!;
  const segments = ranked.map(({ count, marker }) => ({
    count,
    color: getMarkerColor(marker),
  }));
  let completed = 0;
  const background = segments.length <= 1
    ? getMarkerColor(dominantMarker)
    : `conic-gradient(${segments.map(({ count, color }) => {
        const start = (completed / points.length) * 100;
        completed += count;
        const end = (completed / points.length) * 100;
        return `${color} ${start}% ${end}%`;
      }).join(', ')})`;
  return {
    dominantMarker,
    isMixed: ranked.length > 1,
    label: getMarkerVisualLabel(dominantMarker),
    background,
    dominantColor: getMarkerColor(dominantMarker),
    colors: [...new Set(segments.map(({ color }) => color))].slice(0, 4),
  };
}

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.stroke', stylers: [{ visibility: 'off' }] },
  // Base-map place icons can look like Marqtplaza results. Hide them so every
  // visible place icon corresponds to a currently filtered listing marker.
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
const NEIGHBORHOOD_PULSE_DURATION_MS = 2_400;

const TILE_SIZE = 256;
const MIN_TILE_ZOOM = 10;
const MAX_TILE_ZOOM = 18;
const MAP_CLUSTER_RADIUS_PX = 56;
const CLUSTER_DRAG_THRESHOLD_PX = 6;
const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 4_000;
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const googleMapsBrowserKeyPattern = /^AIza[0-9A-Za-z_-]{35}$/;
const hasGoogleMapsApiKey = googleMapsBrowserKeyPattern.test(googleMapsApiKey ?? '');

function mapClassNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface GoogleMapViewProps {
  language: Language;
  locationId: string;
  selectedNeighborhoods: string[];
  showAllNeighborhoods?: boolean;
  showNeighborhoodLabels?: boolean;
  highlightedNeighborhood?: string | null;
  isDataLoading?: boolean;
  onNeighborhoodClick?: (name: string, options?: { additive?: boolean }) => void;
  onNeighborhoodHover?: (name: string | null) => void;
  markers: MarkerData[];
  selectedMarkerId: string | null;
  savedIds: Set<string>;
  onMarkerClick: (id: string) => void;
  onClusterMarkerClick?: (id: string) => void;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface TileViewport {
  center: LatLng;
  zoom: number;
}

type HtmlMarkerOverlay = google.maps.OverlayView & {
  setContent: (content: HTMLElement) => void;
  setPosition: (position: google.maps.LatLngLiteral) => void;
  setZIndex: (zIndex: number) => void;
};

function createHtmlMarkerOverlay(
  map: google.maps.Map,
  initialPosition: google.maps.LatLngLiteral,
  initialContent: HTMLElement,
  initialZIndex: number,
): HtmlMarkerOverlay {
  class MarkerOverlay extends google.maps.OverlayView {
    private content = initialContent;
    private position = initialPosition;
    private zIndex = initialZIndex;

    onAdd() {
      const panes = this.getPanes();
      if (!panes) return;
      panes.overlayMouseTarget.appendChild(this.content);
    }

    draw() {
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(this.position);
      if (!point) return;
      this.content.style.left = `${point.x}px`;
      this.content.style.top = `${point.y}px`;
      this.content.style.zIndex = String(this.zIndex);
    }

    onRemove() {
      this.content.remove();
    }

    setContent(content: HTMLElement) {
      if (this.content.parentElement) {
        this.content.replaceWith(content);
      }
      this.content = content;
      this.draw();
    }

    setPosition(position: google.maps.LatLngLiteral) {
      this.position = position;
      this.draw();
    }

    setZIndex(zIndex: number) {
      this.zIndex = zIndex;
      this.content.style.zIndex = String(zIndex);
    }
  }

  const overlay = new MarkerOverlay() as HtmlMarkerOverlay;
  overlay.setMap(map);
  return overlay;
}

function createNeighborhoodLabelElement(name: string): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('data-neighborhood-label', '');
  element.setAttribute('aria-label', `Selected neighborhood: ${name}`);
  element.textContent = name;
  element.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    'transform:translate(-50%,-50%)',
    'white-space:nowrap',
    'border:2px solid rgba(15,118,110,0.85)',
    'border-radius:999px',
    'background:rgba(255,255,255,0.95)',
    'padding:4px 10px',
    'box-shadow:0 3px 10px rgba(23,34,53,0.22)',
    'color:#134e4a',
    'font:900 11px/1.2 ui-sans-serif,system-ui,sans-serif',
    'pointer-events:none',
  ].join(';');
  return element;
}

const MAP_COPY = {
  nl: {
    unavailableNoResults: 'Kaarttegels zijn niet beschikbaar en er zijn geen ontdekkingen om te tonen.',
    coordinateMap: 'Kaart met activiteitlocaties',
    coordinateMapDescription: 'Kaarttegels zijn niet beschikbaar. De locaties zijn geplaatst met hun lengte- en breedtegraad.',
    interactiveMap: 'Interactieve activiteitenkaart',
    googleMap: 'Google-kaart met activiteiten',
    zoomIn: 'Inzoomen',
    zoomOut: 'Uitzoomen',
    contributors: '© OpenStreetMap-bijdragers',
  },
  en: {
    unavailableNoResults: 'Map tiles are unavailable and there are no discoveries to show.',
    coordinateMap: 'Activity coordinate map',
    coordinateMapDescription: 'Map tiles are unavailable. Locations are positioned using their latitude and longitude.',
    interactiveMap: 'Interactive activity map',
    googleMap: 'Google activity map',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    contributors: '© OpenStreetMap contributors',
  },
} as const;

function DataLoadingNotice({ isDataLoading }: { isDataLoading: boolean }) {
  if (!isDataLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="map-fetching-notice"
      className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-primary/30 bg-card/95 px-4 py-2 text-xs font-extrabold text-primary shadow-lg backdrop-blur-sm"
    >
      <span
        aria-hidden="true"
        className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary align-middle"
      />
      Fetching data please wait
    </div>
  );
}

type MapPoint = MarkerData;

function getCategoryIcon(marker: MapPoint) {
  return getSubcategoryIcon(marker);
}

function getMarkerColor(
  marker: Pick<MarkerData, 'category' | 'businessCategory' | 'socialCategory' | 'foodType'>,
) {
  if (marker.category === 'Food & Drink' && marker.foodType) {
    return FOOD_TYPE_COLORS[marker.foodType];
  }
  if (marker.category === 'Businesses' && marker.businessCategory) {
    return BUSINESS_CATEGORY_COLORS[marker.businessCategory];
  }
  if (marker.category === 'Social map' && marker.socialCategory) {
    return SOCIAL_CATEGORY_COLORS[marker.socialCategory];
  }
  return CATEGORY_COLORS[marker.category] ?? CATEGORY_COLORS.Businesses;
}

function MarkerPreview({
  marker,
  language,
}: {
  marker: Pick<MarkerData, 'id' | 'name' | 'category' | 'description' | 'details'>;
  language: Language;
}) {
  const copy = getMarkerCopy(marker, language);
  const t = translations[language];

  return (
    <div
      data-marker-preview
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border-2 border-border bg-card p-3 text-left shadow-2xl ring-2 ring-background/80"
    >
      <p className="truncate text-sm font-extrabold text-foreground">{marker.name}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
        {t.categories[marker.category]}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
      <p className="mt-2 text-[11px] font-bold text-secondary">{copy.details}</p>
    </div>
  );
}

function getCategoryIconMarkup(marker: Pick<MarkerData, 'category' | 'businessCategory' | 'socialCategory' | 'foodType'>) {
  // Use SVG path strings from Lucide matching our mapped icon choices.
  // These represent the specific path/circle elements for each semantically distinct icon.

  if (marker.category === 'Food & Drink' && marker.foodType) {
    const foodIcons: Record<FoodType, string> = {
      restaurant: '<path d="M3 2v7a3 3 0 0 0 6 0V2"/><path d="M6 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2Z"/><path d="M21 15v7"/>', // Utensils
      cafe: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>', // Coffee
      bar: '<path d="M8 22h8"/><path d="M12 15v7"/><path d="M12 15a8.03 8.03 0 0 0 8-8V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v2a8.03 8.03 0 0 0 8 8Z"/><path d="M4 5h16"/>', // Martini
      bakery: '<path d="m4.6 13.4-.6 6A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2.6l-.6-6"/><path d="M2.5 13a22.8 22.8 0 0 1 19 0"/><path d="M17 13a5.5 5.5 0 0 0-10 0"/><path d="M11 2a4 4 0 0 0-4 4"/><path d="M17 6a4 4 0 0 0-4-4"/>', // Croissant
      takeaway: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>', // ShoppingBag
      other: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>', // Coffee
    };
    return foodIcons[marker.foodType] ?? foodIcons.other;
  }

  if (marker.category === 'Businesses' && marker.businessCategory) {
    const businessIcons: Record<BusinessCategory, string> = {
      'Retail & Shopping': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>', // Store
      'Food & Drink': '<path d="M3 2v7a3 3 0 0 0 6 0V2"/><path d="M6 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2Z"/><path d="M21 15v7"/>', // Utensils
      'Health & Wellness': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>', // HeartPulse
      'Beauty & Personal Care': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>', // HeartPulse
      'Professional Services': '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>', // Briefcase
      'Finance & Legal': '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>', // Building2
      'Home & Repair': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', // Wrench
      'Automotive & Mobility': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>', // Car
      'Education & Childcare': '<path d="M21.42 10.922a2 2 0 0 1-.019 3.138l-8.5 7.107a2 2 0 0 1-2.541.001l-8.5-7.107a2 2 0 0 1-.019-3.138l8.5-7.107a2 2 0 0 1 2.541.001z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>', // GraduationCap
      'Hospitality & Travel': '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>', // Bed
      'Arts, Culture & Entertainment': '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>', // Palette
      'Fitness & Sports': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', // Activity
    };
    return businessIcons[marker.businessCategory] ?? '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />';
  }

  if (marker.category === 'Social map' && marker.socialCategory) {
    const socialIcons: Record<SocialMapCategory, string> = {
      'Geldzaken': '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>', // Coins
      'Gezin en opvoeden': '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M9 8h.01M15 8h.01"/>', // Baby
      'Gezondheid': '<path d="M11 2h2"/><path d="M2 9h20"/><path d="M6 14h4"/><path d="M6 18h4"/><path d="M16 14h2"/><path d="M16 18h2"/><rect width="18" height="20" x="3" y="2" rx="2"/>', // Stethoscope
      'Heilige plaatsen': '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/>', // Cross
      "Hobby's en interesses": '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>', // Palette
      'Ondersteuning': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/>', // HeartHandshake
      'Ontmoeten en samenleven': '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="m21.23 9.23-5.23-5.23"/><path d="m20.23 8.23-6.23-6.23"/><path d="M16 4v6"/><path d="M10 10h6"/>', // HandHeart
      'Sporten en bewegen': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', // Activity
      'Taal en computer': '<path d="m10 15 5-3-5-3v6Z"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4"/><path d="M8 21h8"/>', // MonitorPlay
      'Vervoer': '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>', // Bus
      'Werk en opleiding': '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>', // Briefcase
      'Wonen en huishouden': '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>', // Building2
      'Zorg voor een naaste': '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="m21.23 9.23-5.23-5.23"/><path d="m20.23 8.23-6.23-6.23"/><path d="M16 4v6"/><path d="M10 10h6"/>', // HandHeart
    };
    return socialIcons[marker.socialCategory] ?? socialIcons['Ontmoeten en samenleven'];
  }


  const markup: Record<MapCategory, string> = {
    Museums: '<path d="M3 21h18M5 21V10m14 11V10M3 10h18L12 3 3 10Zm4 4h2m2 0h2m2 0h2M7 18h2m2 0h2m2 0h2" />',
    Tours: '<circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="m8.5 17.5 7-11" />',
    Family: '<circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M9 8h.01M15 8h.01" />',
    Entertainment: '<path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1 4A3 3 0 0 1 18 19h-.2a3 3 0 0 1-2.1-.9L14 16h-4l-1.7 2.1a3 3 0 0 1-2.1.9H6a3 3 0 0 1-2.9-2.1l-1-4A4 4 0 0 1 6 8Z" /><path d="M8 12v3m-1.5-1.5h3M16 13h.01M19 13h.01" />',
    Outdoors: '<path d="M2 12c3.3-3 6.7-3 10 0s6.7 3 10 0M2 17c3.3-3 6.7-3 10 0s6.7 3 10 0" />',
    Markets: '<path d="M3 9h18l-1 12H4L3 9Zm2-5h14l2 5H3l2-5Zm4 0v5m6-5v5" />',
    Businesses: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />',
    'Food & Drink': '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" /><path d="M6 2v3m3-3v3m3-3v3" />',
    'Social map': '<path d="M7 11.5 10 14l7-7" /><path d="M12 21a9 9 0 1 0-9-9c0 5.1 4.4 8.6 9 9Z" /><path d="M8 8.5h.01M16 8.5h.01" />',
  };
  return markup[marker.category] ?? markup.Businesses;
}

function getLocation(locationId: string) {
  return LOCATIONS.find((item) => item.id === locationId);
}

type NeighborhoodArea = {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  boundary: NeighborhoodBoundary;
};

function getNeighborhoodAreas(locationId: string, neighborhoodNames: string[]): NeighborhoodArea[] {
  const location = getLocation(locationId);
  if (!location) return [];
  return neighborhoodNames
    .map((name) => {
      const area = location.neighborhoodCoords[name];
      const boundary = NEIGHBORHOOD_BOUNDARIES[name];
      return area && boundary ? { name, ...area, boundary } : null;
    })
    .filter((area): area is NeighborhoodArea => Boolean(area));
}

function getMapPoints(markers: MarkerData[]): MapPoint[] {
  return markers;
}

function latLngToWorld({ lat, lng }: LatLng, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function worldToLatLng(x: number, y: number, zoom: number): LatLng {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const mercatorY = Math.PI - (2 * Math.PI * y) / scale;

  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(mercatorY)),
    lng: ((longitude + 540) % 360) - 180,
  };
}

type MapPointCluster = {
  id: string;
  points: MapPoint[];
  lat: number;
  lng: number;
  x: number;
  y: number;
};

function clusterMapPoints(
  points: MapPoint[],
  getPosition: (point: MapPoint) => { x: number; y: number },
  radius: number,
  selectedMarkerId: string | null = null,
): MapPointCluster[] {
  const clusters: MapPointCluster[] = [];
  // The selected listing is always rendered on its own so it can never be
  // hidden inside a count badge; cluster only the remaining points.
  const selectedPoint = selectedMarkerId
    ? points.find((point) => point.id === selectedMarkerId)
    : undefined;

  for (const point of points) {
    if (point === selectedPoint) continue;
    const position = getPosition(point);
    const cluster = clusters.find((candidate) => (
      Math.hypot(candidate.x - position.x, candidate.y - position.y) <= radius
    ));

    if (!cluster) {
      clusters.push({
        id: `cluster-${point.id}`,
        points: [point],
        lat: point.lat,
        lng: point.lng,
        x: position.x,
        y: position.y,
      });
      continue;
    }

    const nextCount = cluster.points.length + 1;
    cluster.points.push(point);
    cluster.lat = (cluster.lat * (nextCount - 1) + point.lat) / nextCount;
    cluster.lng = (cluster.lng * (nextCount - 1) + point.lng) / nextCount;
    cluster.x = (cluster.x * (nextCount - 1) + position.x) / nextCount;
    cluster.y = (cluster.y * (nextCount - 1) + position.y) / nextCount;
    cluster.id = `cluster-${cluster.points.map(({ id }) => id).sort().join('-')}`;
  }

  if (selectedPoint) {
    const position = getPosition(selectedPoint);
    clusters.push({
      id: `cluster-${selectedPoint.id}`,
      points: [selectedPoint],
      lat: selectedPoint.lat,
      lng: selectedPoint.lng,
      x: position.x,
      y: position.y,
    });
  }

  return clusters;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) => (
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      ));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Runs onActivate only for a stationary pointer release, so a map drag that
 *  starts or ends on a cluster badge does not zoom. */
function attachStationaryActivation(element: HTMLElement, onActivate: () => void) {
  let down: { x: number; y: number } | null = null;
  let dragged = false;
  element.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
    dragged = false;
    event.stopPropagation();
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', (event) => {
    if (!down) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLUSTER_DRAG_THRESHOLD_PX) {
      dragged = true;
    }
  });
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasDragged = dragged;
    down = null;
    dragged = false;
    if (wasDragged) return;
    onActivate();
  });
}

function ClusterSummaryMarker({
  cluster,
  style,
  onClick,
}: {
  cluster: MapPointCluster;
  style: React.CSSProperties;
  onClick?: () => void;
}) {
  const count = cluster.points.length;
  const size = count >= 100 ? 62 : count >= 10 ? 56 : 50;
  const isInteractive = Boolean(onClick);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const label = isInteractive
    ? `${count} listings in this area. Show listings and zoom in.`
    : `${count} listings in this area`;
  const visual = getClusterVisual(cluster.points);
  const ClusterIcon = getSubcategoryIcon(visual.dominantMarker);
  const accessibleLabel = visual.isMixed
    ? `${label} Mostly ${visual.label}, with other categories.`
    : `${label} ${visual.label}.`;

  return (
    <div
      key={cluster.id}
      data-map-cluster
      data-cluster-colors={visual.colors.join(',')}
      role={isInteractive ? 'button' : 'img'}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={accessibleLabel}
      title={visual.isMixed ? `${count} listings · mostly ${visual.label}` : `${count} ${visual.label} listings`}
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
      style={style}
      onPointerDown={(event) => {
        downRef.current = { x: event.clientX, y: event.clientY };
        draggedRef.current = false;
        if (isInteractive) {
          // Keep the map from starting a pan (and capturing the pointer, which
          // would swallow our click); the badge tracks its own movement.
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        const down = downRef.current;
        if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLUSTER_DRAG_THRESHOLD_PX) {
          draggedRef.current = true;
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        const wasDragged = draggedRef.current;
        downRef.current = null;
        draggedRef.current = false;
        if (!wasDragged) onClick?.();
      }}
      onKeyDown={(event) => {
        if (isInteractive && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <span
        className="flex flex-col items-center justify-center rounded-full border-[3px] border-white font-black leading-none text-white"
        style={{
          width: size,
          height: size,
          background: visual.background,
          boxShadow: `0 7px 16px -5px rgba(23,34,53,0.5), 0 0 0 2px ${visual.dominantColor}4d`,
        }}
      >
        <ClusterIcon className="mb-0.5 h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        <span className={count >= 100 ? 'text-xs' : 'text-sm'}>{count}</span>
      </span>
      {visual.isMixed && (
        <span
          className="absolute -right-1 -top-1 grid h-[18px] w-[18px] grid-cols-2 gap-0.5 rounded-full bg-white p-1 shadow-sm ring-1 ring-border"
          aria-hidden="true"
        >
          {visual.colors.map((dotColor) => (
            <span key={dotColor} className="rounded-full" style={{ background: dotColor }} />
          ))}
        </span>
      )}
    </div>
  );
}

function createHtmlClusterElement(
  cluster: MapPointCluster,
  onClick: () => void,
): HTMLElement {
  const count = cluster.points.length;
  const size = count >= 100 ? 62 : count >= 10 ? 56 : 50;
  const visual = getClusterVisual(cluster.points);
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('data-map-cluster', '');
  button.setAttribute('data-cluster-colors', visual.colors.join(','));
  button.setAttribute(
    'aria-label',
    `${count} listings in this area. ${visual.isMixed ? `Mostly ${visual.label}, with other categories.` : `${visual.label}.`} Show listings and zoom in.`,
  );
  button.title = visual.isMixed ? `${count} listings · mostly ${visual.label}` : `${count} ${visual.label} listings`;
  button.style.cssText = [
    'position:absolute',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'transform:translate(-50%,-50%)',
    `width:${size}px`,
    `height:${size}px`,
    'border:3px solid #fff',
    'border-radius:50%',
    `background:${visual.background}`,
    `box-shadow:0 7px 16px -5px rgba(23,34,53,0.5),0 0 0 2px ${visual.dominantColor}4d`,
    'color:#fff',
    'font:900 14px/1 ui-sans-serif,system-ui,sans-serif',
    'cursor:pointer',
    'padding:0',
  ].join(';');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '14');
  icon.setAttribute('height', '14');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2.5');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.style.marginBottom = '2px';
  icon.innerHTML = getCategoryIconMarkup(visual.dominantMarker);
  const countLabel = document.createElement('span');
  countLabel.textContent = String(count);
  countLabel.style.fontSize = count >= 100 ? '12px' : '14px';
  button.append(icon, countLabel);

  if (visual.isMixed) {
    const mixBadge = document.createElement('span');
    mixBadge.style.cssText = [
      'position:absolute',
      'top:-4px',
      'right:-4px',
      'width:18px',
      'height:18px',
      'border-radius:50%',
      'background:#fff',
      'border:1px solid hsl(var(--border))',
      'box-shadow:0 1px 2px rgba(0,0,0,0.1)',
      'display:flex',
      'flex-wrap:wrap',
      'align-items:center',
      'justify-content:center',
      'gap:2px',
      'padding:4px',
    ].join(';');
    for (const dotColor of visual.colors) {
      const dot = document.createElement('span');
      dot.style.cssText = `width:3px;height:3px;border-radius:50%;background:${dotColor};`;
      mixBadge.appendChild(dot);
    }
    button.appendChild(mixBadge);
  }

  attachStationaryActivation(button, onClick);
  return button;
}

function getInitialViewport(locationId: string): TileViewport {
  const location = getLocation(locationId) ?? LOCATIONS[0];
  return {
    center: { lat: location.lat, lng: location.lng },
    zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, location.zoom)),
  };
}

function getNeighborhoodViewport(
  locationId: string,
  neighborhoodNames: string[],
  mapSize: { width: number; height: number },
): TileViewport {
  const neighborhoods = getNeighborhoodAreas(locationId, neighborhoodNames);

  if (neighborhoods.length === 0) {
    return getInitialViewport(locationId);
  }

  const boundaryPoints = neighborhoods.flatMap((area) => area.boundary.flat());
  const latitudes = boundaryPoints.map(([lat]) => lat);
  const longitudes = boundaryPoints.map(([, lng]) => lng);
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
  const availableWidth = Math.max(240, mapSize.width - 96);
  const availableHeight = Math.max(220, mapSize.height - 128);
  const widthZoom = Math.log2((availableWidth * 360) / (TILE_SIZE * Math.max(longitudeSpan, 0.002)));
  const heightZoom = Math.log2((availableHeight * 170) / (TILE_SIZE * Math.max(latitudeSpan, 0.002)));

  return {
    center: {
      lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    },
    zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, Math.floor(Math.min(widthZoom, heightZoom)))),
  };
}

function getMarkerViewport(
  locationId: string,
  markers: MarkerData[],
  mapSize: { width: number; height: number },
): TileViewport {
  if (markers.length === 0) return getInitialViewport(locationId);
  if (markers.length === 1) {
    return {
      center: { lat: markers[0].lat, lng: markers[0].lng },
      zoom: 15,
    };
  }

  const latitudes = markers.map((marker) => marker.lat);
  const longitudes = markers.map((marker) => marker.lng);
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
  const availableWidth = Math.max(240, mapSize.width - 96);
  const availableHeight = Math.max(220, mapSize.height - 128);
  const widthZoom = Math.log2((availableWidth * 360) / (TILE_SIZE * Math.max(longitudeSpan, 0.002)));
  const heightZoom = Math.log2((availableHeight * 170) / (TILE_SIZE * Math.max(latitudeSpan, 0.002)));

  return {
    center: {
      lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    },
    zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, Math.floor(Math.min(widthZoom, heightZoom)))),
  };
}

function getBoundaryPoints(areas: NeighborhoodArea[]): LatLng[] {
  return areas.flatMap((area) => area.boundary.flat().map(([lat, lng]) => ({ lat, lng })));
}

function projectCoordinatePoint(
  point: BoundaryPoint,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  return {
    x: ((point[1] - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100,
    y: ((bounds.maxLat - point[0]) / (bounds.maxLat - bounds.minLat)) * 100,
  };
}

function getViewportSignature(markers: MarkerData[], neighborhoods: string[]): string {
  const markerPart = markers.map((marker) => `${marker.id}:${marker.lat}:${marker.lng}`).join('|');
  return `${neighborhoods.join(',')}#${markerPart}`;
}

function shouldShowNeighborhoodLabel(
  name: string,
  options: {
    showNeighborhoodLabels: boolean;
    showAllNeighborhoods: boolean;
    selectedNeighborhoods: string[];
    highlightedNeighborhood: string | null;
  },
): boolean {
  if (options.highlightedNeighborhood === name) return true;
  if (!options.showNeighborhoodLabels) return false;
  return !options.showAllNeighborhoods || options.selectedNeighborhoods.includes(name);
}

function isNeighborhoodSelected(
  name: string,
  selectedNeighborhoods: string[],
  highlightedNeighborhood: string | null,
): boolean {
  return highlightedNeighborhood === name || selectedNeighborhoods.includes(name);
}

function handleNeighborhoodKeyDown(
  event: React.KeyboardEvent<SVGPolygonElement>,
  name: string,
  onNeighborhoodClick?: (name: string, options?: { additive?: boolean }) => void,
) {
  if (onNeighborhoodClick && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    onNeighborhoodClick(name, { additive: event.shiftKey });
  }
}

function CoordinateMapFallback({
  language,
  locationId,
  selectedNeighborhoods,
  showAllNeighborhoods = false,
  showNeighborhoodLabels = true,
  highlightedNeighborhood = null,
  isDataLoading = false,
  onNeighborhoodClick,
  onNeighborhoodHover,
  markers,
  selectedMarkerId,
  onMarkerClick,
  onClusterClick,
}: Pick<
  GoogleMapViewProps,
  | 'language'
  | 'locationId'
  | 'selectedNeighborhoods'
  | 'showAllNeighborhoods'
  | 'showNeighborhoodLabels'
  | 'highlightedNeighborhood'
   | 'isDataLoading'
  | 'onNeighborhoodClick'
   | 'onNeighborhoodHover'
  | 'markers'
  | 'selectedMarkerId'
  | 'onMarkerClick'
> & { onClusterClick?: (cluster: MapPointCluster) => void }) {
  const points = getMapPoints(markers);
  const displayedNeighborhoods = showAllNeighborhoods
    ? (getLocation(locationId)?.neighborhoods ?? selectedNeighborhoods)
    : selectedNeighborhoods;
  const neighborhoodAreas = getNeighborhoodAreas(locationId, displayedNeighborhoods);
  const mapCopy = MAP_COPY[language];
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>();

  if (points.length === 0 && neighborhoodAreas.length === 0) {
    return (
      <div
        className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,_#e8f0e9_0%,_#f7f4ed_46%,_#dceaf0_100%)] p-6 text-center"
        aria-label={mapCopy.coordinateMap}
      >
        <p className="max-w-xs text-sm font-semibold text-muted-foreground">
          {mapCopy.unavailableNoResults}
        </p>
      </div>
    );
  }

  const selectedPoint = points.find((point) => point.id === selectedMarkerId);
  // The camera follows the selected neighborhoods; context boundaries are drawn
  // but must not widen the viewport to the whole city.
  const viewportAreas = selectedNeighborhoods.length > 0
    ? getNeighborhoodAreas(locationId, selectedNeighborhoods)
    : neighborhoodAreas;
  const neighborhoodCoordinates = getBoundaryPoints(viewportAreas);
  const mapCoordinates = selectedPoint
    ? [
        { lat: selectedPoint.lat - 0.012, lng: selectedPoint.lng - 0.018 },
        { lat: selectedPoint.lat + 0.012, lng: selectedPoint.lng + 0.018 },
      ]
    : [
        ...points.map((point) => ({ lat: point.lat, lng: point.lng })),
        ...neighborhoodCoordinates,
      ];
  const latitudes = mapCoordinates.map((coordinate) => coordinate.lat);
  const longitudes = mapCoordinates.map((coordinate) => coordinate.lng);
  const latitudePadding = Math.max(0.006, (Math.max(...latitudes) - Math.min(...latitudes)) * 0.25);
  const longitudePadding = Math.max(0.009, (Math.max(...longitudes) - Math.min(...longitudes)) * 0.25);
  const minLat = Math.min(...latitudes) - latitudePadding;
  const maxLat = Math.max(...latitudes) + latitudePadding;
  const minLng = Math.min(...longitudes) - longitudePadding;
  const maxLng = Math.max(...longitudes) + longitudePadding;
  const bounds = { minLat, maxLat, minLng, maxLng };
  // Cluster in CSS pixels (percent × measured size) so grouping matches the
  // other providers regardless of the container's aspect ratio. Until the
  // container is measured, assume a square so the first paint is stable.
  const pixelWidth = containerSize.width || 100;
  const pixelHeight = containerSize.height || 100;
  const pointClusters = clusterMapPoints(
    points,
    (point) => ({
      x: ((point.lng - minLng) / (maxLng - minLng)) * pixelWidth,
      y: ((maxLat - point.lat) / (maxLat - minLat)) * pixelHeight,
    }),
    MAP_CLUSTER_RADIUS_PX,
    selectedMarkerId,
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,_#e8f0e9_0%,_#f7f4ed_46%,_#dceaf0_100%)]"
      aria-label={mapCopy.coordinateMap}
    >
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(72,105,93,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(72,105,93,0.14)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute left-5 top-5 z-10 max-w-xs rounded-xl border border-border/70 bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
        <p className="text-xs font-extrabold text-foreground">{mapCopy.coordinateMap}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {mapCopy.coordinateMapDescription}
        </p>
      </div>
      {neighborhoodAreas.map((area) => {
        const center = projectCoordinatePoint([area.lat, area.lng], bounds);
        const isSelected = isNeighborhoodSelected(area.name, selectedNeighborhoods, highlightedNeighborhood);
        return (
          <div key={`neighborhood-${area.name}`} className="absolute inset-0">
            <svg
              className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden={!onNeighborhoodClick && !onNeighborhoodHover}
            >
              {area.boundary.map((ring, ringIndex) => (
                <polygon
                  key={`${area.name}-${ringIndex}`}
                  data-neighborhood-boundary
                  role={onNeighborhoodClick || onNeighborhoodHover ? 'button' : undefined}
                  tabIndex={onNeighborhoodClick || onNeighborhoodHover ? 0 : undefined}
                  aria-label={onNeighborhoodClick ? `Select neighborhood: ${area.name}` : `Neighborhood: ${area.name}`}
                  points={ring.map((point) => {
                    const projected = projectCoordinatePoint(point, bounds);
                    return `${projected.x},${projected.y}`;
                  }).join(' ')}
                  onClick={(event) => onNeighborhoodClick?.(area.name, { additive: event.shiftKey })}
                   onMouseEnter={() => onNeighborhoodHover?.(area.name)}
                   onMouseLeave={() => onNeighborhoodHover?.(null)}
                   onFocus={() => onNeighborhoodHover?.(area.name)}
                   onBlur={() => onNeighborhoodHover?.(null)}
                  onKeyDown={(event) => handleNeighborhoodKeyDown(event, area.name, onNeighborhoodClick)}
                  className={mapClassNames(
                    (onNeighborhoodClick || onNeighborhoodHover) && "pointer-events-auto cursor-pointer focus-visible:outline-none",
                    isSelected
                      ? "fill-primary/20 stroke-primary"
                      : "fill-teal-400/10 stroke-teal-700/20",
                  )}
                  style={{
                    strokeWidth: isSelected ? 0.8 : 0.35,
                    strokeOpacity: isSelected ? 1 : 0.2,
                     fillOpacity: isSelected ? 0.2 : 0.1,
                     animation: isDataLoading && isSelected
                       ? `buurtplaza-neighborhood-pulse ${NEIGHBORHOOD_PULSE_DURATION_MS}ms ease-in-out infinite`
                       : undefined,
                     transition: 'stroke 180ms ease, stroke-opacity 180ms ease, fill-opacity 180ms ease',
                    vectorEffect: 'non-scaling-stroke',
                  }}
                    data-neighborhood-loading={isDataLoading && isSelected ? 'true' : undefined}
                />
              ))}
            </svg>
            {shouldShowNeighborhoodLabel(area.name, { showNeighborhoodLabels, showAllNeighborhoods, selectedNeighborhoods, highlightedNeighborhood }) && (
              <span
                data-neighborhood-label
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-2 border-teal-700/85 bg-white/95 px-2.5 py-1 text-[11px] font-black text-teal-900 shadow-md"
                style={{ left: `${center.x}%`, top: `${center.y}%` }}
              >
                {area.name}
              </span>
            )}
          </div>
        );
      })}
      <DataLoadingNotice isDataLoading={isDataLoading} />
      {pointClusters.map((cluster) => {
        const point = cluster.points[0]!;
        if (cluster.points.length > 1) {
          return (
            <ClusterSummaryMarker
              key={cluster.id}
              cluster={cluster}
              style={{
                left: `${(cluster.x / pixelWidth) * 100}%`,
                top: `${(cluster.y / pixelHeight) * 100}%`,
              }}
              onClick={() => onClusterClick?.(cluster)}
            />
          );
        }

        const left = ((point.lng - minLng) / (maxLng - minLng)) * 100;
        const top = ((maxLat - point.lat) / (maxLat - minLat)) * 100;
        const isSelected = point.id === selectedMarkerId;
        const isMuted = Boolean(selectedMarkerId) && !isSelected;
        const color = getMarkerColor(point);
        const Icon = getCategoryIcon(point);

        const className = "marqtplaza-map-marker relative flex items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35";
        const style: React.CSSProperties = {
          width: isSelected ? 48 : isMuted ? 28 : 38,
          height: isSelected ? 48 : isMuted ? 28 : 38,
          minWidth: isSelected ? 48 : isMuted ? 28 : 38,
          minHeight: isSelected ? 48 : isMuted ? 28 : 38,
          aspectRatio: '1 / 1',
          boxSizing: 'border-box',
          flex: '0 0 auto',
          overflow: 'hidden',
          boxShadow: isSelected ? `0 0 0 5px ${color}44, 0 8px 18px -6px rgba(23,34,53,0.5)` : undefined,
          opacity: isMuted ? 0.28 : 1,
          filter: isMuted ? 'saturate(0.35)' : undefined,
        };
        const icon = <Icon className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden="true" />;

        const previewId = `marker-preview-${point.id}`;
        return (
          <div
            key={point.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${
              hoveredMarkerId === point.id ? 'z-50' : isSelected ? 'z-20' : 'z-10'
            }`}
            style={{
              left: `${Math.max(5, Math.min(95, left))}%`,
              top: `${Math.max(10, Math.min(92, top))}%`,
            }}
          >
            <button
              type="button"
              data-map-pin
              data-event-id={point.id}
              data-marker-color={color}
              onClick={() => onMarkerClick(point.id)}
              onMouseEnter={() => setHoveredMarkerId(point.id)}
              onMouseLeave={() => setHoveredMarkerId(null)}
              onFocus={() => setHoveredMarkerId(point.id)}
              onBlur={() => setHoveredMarkerId(null)}
              className={className.replace(' -translate-x-1/2 -translate-y-1/2', '')}
              style={style}
              aria-describedby={hoveredMarkerId === point.id ? previewId : undefined}
              aria-label={translations[language].openMarker(point.name)}
            >
              {icon}
            </button>
            {hoveredMarkerId === point.id && (
              <div id={previewId}>
                <MarkerPreview marker={point} language={language} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TileMapView({
  language,
  locationId,
  selectedNeighborhoods,
  showAllNeighborhoods = false,
  showNeighborhoodLabels = true,
  highlightedNeighborhood = null,
  isDataLoading = false,
  onNeighborhoodClick,
  onNeighborhoodHover,
  markers,
  selectedMarkerId,
  savedIds,
  onMarkerClick,
  onUnavailable,
  onClusterClick,
}: GoogleMapViewProps & { onUnavailable: () => void; onClusterClick?: (cluster: MapPointCluster) => void; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: TileViewport;
  } | null>(null);
  const tileHealthRef = useRef({
    key: '',
    expected: 0,
    loaded: 0,
    failed: 0,
  });
  const fallbackStartedRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<TileViewport>(() => getInitialViewport(locationId));
  const mapCopy = MAP_COPY[language];

  const reportUnavailable = useCallback(() => {
    if (!fallbackStartedRef.current) {
      fallbackStartedRef.current = true;
      onUnavailable();
    }
  }, [onUnavailable]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setViewport(getInitialViewport(locationId));
  }, [locationId]);

  // Only refit the camera when the content actually changes; parent re-renders
  // (e.g. hover state) that pass equivalent props must never reset user zoom.
  const viewportSignature = getViewportSignature(markers, selectedNeighborhoods);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const selectedNeighborhoodsRef = useRef(selectedNeighborhoods);
  selectedNeighborhoodsRef.current = selectedNeighborhoods;

  useEffect(() => {
    const selected = selectedNeighborhoodsRef.current;
    const viewportNeighborhoods = showAllNeighborhoods && selected.length === 0
      ? (getLocation(locationId)?.neighborhoods ?? selected)
      : selected;
    setViewport(
      viewportNeighborhoods.length > 0
        ? getNeighborhoodViewport(locationId, viewportNeighborhoods, size)
        : getMarkerViewport(locationId, markersRef.current, size),
    );
  }, [locationId, viewportSignature, showAllNeighborhoods, size.height, size.width]);

  useEffect(() => {
    const marker = markersRef.current.find((item) => item.id === selectedMarkerId);
    if (marker?.lat != null && marker.lng != null) {
      setViewport((current) => ({
        ...current,
        center: { lat: marker.lat, lng: marker.lng },
      }));
    }
  }, [selectedMarkerId]);

  const tiles = useMemo(() => {
    if (size.width === 0 || size.height === 0) return [];

    const center = latLngToWorld(viewport.center, viewport.zoom);
    const left = center.x - size.width / 2;
    const top = center.y - size.height / 2;
    const mapWidthInTiles = 2 ** viewport.zoom;
    const startX = Math.floor(left / TILE_SIZE);
    const startY = Math.floor(top / TILE_SIZE);
    const endX = Math.floor((left + size.width) / TILE_SIZE);
    const endY = Math.floor((top + size.height) / TILE_SIZE);
    const tileList: Array<{ key: string; x: number; y: number; left: number; top: number }> = [];

    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= mapWidthInTiles) continue;
      for (let x = startX; x <= endX; x += 1) {
        const wrappedX = ((x % mapWidthInTiles) + mapWidthInTiles) % mapWidthInTiles;
        tileList.push({
          key: `${viewport.zoom}-${x}-${y}`,
          x: wrappedX,
          y,
          left: x * TILE_SIZE - left,
          top: y * TILE_SIZE - top,
        });
      }
    }

    return tileList;
  }, [size, viewport]);

  const tileSetKey = useMemo(
    () => tiles.map((tile) => tile.key).join('|'),
    [tiles],
  );

  useEffect(() => {
    if (!tileSetKey) return;

    tileHealthRef.current = {
      key: tileSetKey,
      expected: tiles.length,
      loaded: 0,
      failed: 0,
    };
    const timer = window.setTimeout(() => {
      const tileHealth = tileHealthRef.current;
      if (tileHealth.key === tileSetKey && tileHealth.loaded === 0) {
        reportUnavailable();
      }
    }, 12_000);

    return () => window.clearTimeout(timer);
  }, [reportUnavailable, tileSetKey, tiles.length]);

  const recordTileLoad = useCallback((tileKey: string) => {
    const tileHealth = tileHealthRef.current;
    if (tileHealth.key === tileSetKey && tileSetKey.includes(tileKey)) {
      tileHealth.loaded += 1;
    }
  }, [tileSetKey]);

  const recordTileFailure = useCallback((tileKey: string) => {
    const tileHealth = tileHealthRef.current;
    if (tileHealth.key !== tileSetKey || !tileSetKey.includes(tileKey)) return;

    tileHealth.failed += 1;
    if (tileHealth.loaded === 0 && tileHealth.failed >= tileHealth.expected) {
      reportUnavailable();
    }
  }, [reportUnavailable, tileSetKey]);

  const points = getMapPoints(markers);
  const displayedNeighborhoods = showAllNeighborhoods
    ? (getLocation(locationId)?.neighborhoods ?? selectedNeighborhoods)
    : selectedNeighborhoods;
  const neighborhoodAreas = getNeighborhoodAreas(locationId, displayedNeighborhoods);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const center = latLngToWorld(viewport.center, viewport.zoom);
  const mapLeft = center.x - size.width / 2;
  const mapTop = center.y - size.height / 2;
  const pointClusters = clusterMapPoints(
    points,
    (point) => {
      const world = latLngToWorld({ lat: point.lat, lng: point.lng }, viewport.zoom);
      return { x: world.x - mapLeft, y: world.y - mapTop };
    },
    MAP_CLUSTER_RADIUS_PX,
    selectedMarkerId,
  );

  const changeZoom = (amount: number) => {
    setViewport((current) => ({
      ...current,
      zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, current.zoom + amount)),
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const startCenter = latLngToWorld(drag.viewport.center, drag.viewport.zoom);
    setViewport({
      center: worldToLatLng(
        startCenter.x - (event.clientX - drag.startX),
        startCenter.y - (event.clientY - drag.startY),
        drag.viewport.zoom,
      ),
      zoom: drag.viewport.zoom,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const zoomToCluster = (cluster: MapPointCluster) => {
    setViewport((current) => ({
      center: { lat: cluster.lat, lng: cluster.lng },
      zoom: Math.min(MAX_TILE_ZOOM, current.zoom + 2),
    }));
    onClusterClick?.(cluster);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 cursor-grab overflow-hidden bg-[#e9efea] select-none active:cursor-grabbing"
      aria-label={mapCopy.interactiveMap}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={(event) => {
        event.preventDefault();
        changeZoom(event.deltaY < 0 ? 1 : -1);
      }}
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={`https://tile.openstreetmap.org/${viewport.zoom}/${tile.x}/${tile.y}.png`}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
          onLoad={() => recordTileLoad(tile.key)}
          onError={() => recordTileFailure(tile.key)}
        />
      ))}

      {size.width > 0 && size.height > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
           aria-hidden={!onNeighborhoodClick && !onNeighborhoodHover}
        >
          {neighborhoodAreas.flatMap((area) => {
            const isSelected = isNeighborhoodSelected(area.name, selectedNeighborhoods, highlightedNeighborhood);
            return area.boundary.map((ring, ringIndex) => (
            <polygon
              key={`${area.name}-${ringIndex}`}
              data-neighborhood-boundary
              role={onNeighborhoodClick || onNeighborhoodHover ? 'button' : undefined}
              tabIndex={onNeighborhoodClick || onNeighborhoodHover ? 0 : undefined}
              aria-label={onNeighborhoodClick ? `Select neighborhood: ${area.name}` : `Neighborhood: ${area.name}`}
              points={ring.map(([lat, lng]) => {
                const world = latLngToWorld({ lat, lng }, viewport.zoom);
                return `${world.x - mapLeft},${world.y - mapTop}`;
              }).join(' ')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => onNeighborhoodClick?.(area.name, { additive: event.shiftKey })}
              onMouseEnter={() => onNeighborhoodHover?.(area.name)}
              onMouseLeave={() => onNeighborhoodHover?.(null)}
              onFocus={() => onNeighborhoodHover?.(area.name)}
              onBlur={() => onNeighborhoodHover?.(null)}
              onKeyDown={(event) => handleNeighborhoodKeyDown(event, area.name, onNeighborhoodClick)}
              className={mapClassNames(
                (onNeighborhoodClick || onNeighborhoodHover) && "pointer-events-auto cursor-pointer focus-visible:outline-none",
                isSelected
                  ? "fill-primary/20 stroke-primary"
                  : "fill-teal-400/10 stroke-teal-700/20",
              )}
              style={{
                strokeWidth: isSelected ? 5 : 2.5,
                strokeOpacity: isSelected ? 1 : 0.2,
                 fillOpacity: isSelected ? 0.2 : 0.1,
                 animation: isDataLoading && isSelected
                 ? `buurtplaza-neighborhood-pulse ${NEIGHBORHOOD_PULSE_DURATION_MS}ms ease-in-out infinite`
                   : undefined,
                 transition: 'stroke 180ms ease, stroke-opacity 180ms ease, fill-opacity 180ms ease',
                vectorEffect: 'non-scaling-stroke',
              }}
               data-neighborhood-loading={isDataLoading && isSelected ? 'true' : undefined}
            />
            ));
          })}
        </svg>
      )}
      <DataLoadingNotice isDataLoading={isDataLoading} />
      {neighborhoodAreas.map((area) => {
        if (!shouldShowNeighborhoodLabel(area.name, { showNeighborhoodLabels, showAllNeighborhoods, selectedNeighborhoods, highlightedNeighborhood })) return null;
        const world = latLngToWorld(area, viewport.zoom);
        return (
          <span
            key={`neighborhood-label-${area.name}`}
            data-neighborhood-label
            className={mapClassNames(
              "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-2 px-2.5 py-1 text-[11px] font-black shadow-md",
              highlightedNeighborhood === area.name
                ? "border-primary bg-card text-primary shadow-lg"
                : "border-teal-700/85 bg-white/95 text-teal-900",
            )}
            style={{ left: world.x - mapLeft, top: world.y - mapTop }}
          >
            {area.name}
          </span>
        );
      })}

      {pointClusters.map((cluster) => {
        const point = cluster.points[0]!;
        if (cluster.points.length > 1) {
          return (
            <ClusterSummaryMarker
              key={cluster.id}
              cluster={cluster}
              style={{ left: cluster.x, top: cluster.y }}
              onClick={() => zoomToCluster(cluster)}
            />
          );
        }

        const world = latLngToWorld({ lat: point.lat, lng: point.lng }, viewport.zoom);
        const left = world.x - mapLeft;
        const top = world.y - mapTop;
        const isSelected = point.id === selectedMarkerId;
        const isMuted = Boolean(selectedMarkerId) && !isSelected;
        const color = getMarkerColor(point);
        const Icon = getCategoryIcon(point);

        const className = "marqtplaza-map-marker relative flex items-center justify-center rounded-full font-black text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35";
        const style: React.CSSProperties = {
          width: isSelected ? 50 : isMuted ? 30 : 43,
          height: isSelected ? 50 : isMuted ? 30 : 43,
          minWidth: isSelected ? 50 : isMuted ? 30 : 43,
          minHeight: isSelected ? 50 : isMuted ? 30 : 43,
          aspectRatio: '1 / 1',
          boxSizing: 'border-box',
          flex: '0 0 auto',
          overflow: 'hidden',
          background: color, // Map specific color to base provider marker
          boxShadow: isSelected ? `0 0 0 5px ${color}44, 0 8px 18px -6px rgba(23,34,53,0.5)` : `0 7px 16px -5px rgba(23,34,53,0.42), 0 0 0 2px ${color}4d, inset 0 1px 0 rgba(255,255,255,0.48)`,
          opacity: isMuted ? 0.28 : 1,
          filter: isMuted ? 'saturate(0.35)' : undefined,
        };
        const icon = (
          <>
            <Icon className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden="true" />
            {savedIds.has(point.id) && (
              <span
                className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white"
                style={{ backgroundColor: '#f36c21' }}
              />
            )}
          </>
        );

        const previewId = `marker-preview-${point.id}`;
        return (
          <div
            key={point.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${
              hoveredMarkerId === point.id ? 'z-50' : isSelected ? 'z-20' : 'z-10'
            }`}
            style={{ left, top }}
          >
            <button
              type="button"
              data-map-pin
              data-event-id={point.id}
              data-marker-color={color}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onMarkerClick(point.id);
              }}
              onMouseEnter={() => setHoveredMarkerId(point.id)}
              onMouseLeave={() => setHoveredMarkerId(null)}
              onFocus={() => setHoveredMarkerId(point.id)}
              onBlur={() => setHoveredMarkerId(null)}
              className={className.replace(' -translate-x-1/2 -translate-y-1/2', '')}
              style={style}
              aria-describedby={hoveredMarkerId === point.id ? previewId : undefined}
              aria-label={translations[language].openMarker(point.name)}
            >
              {icon}
            </button>
            {hoveredMarkerId === point.id && (
              <div id={previewId}>
                <MarkerPreview marker={point} language={language} />
              </div>
            )}
          </div>
        );
      })}

      <div className="absolute bottom-3 left-3 z-20 flex overflow-hidden rounded-lg border border-border/80 bg-card shadow-md">
        <button
          type="button"
          aria-label={mapCopy.zoomIn}
          className="grid h-9 w-9 place-items-center border-r border-border text-lg font-bold text-foreground hover:bg-muted"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        <button
          type="button"
          aria-label={mapCopy.zoomOut}
          className="grid h-9 w-9 place-items-center text-lg font-bold text-foreground hover:bg-muted"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => changeZoom(-1)}
        >
          −
        </button>
      </div>
      <a
        className="absolute bottom-2 right-3 z-20 rounded bg-card/85 px-1.5 py-0.5 text-[10px] text-muted-foreground underline decoration-transparent transition-colors hover:decoration-current"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {mapCopy.contributors}
      </a>
    </div>
  );
}

let apiOptionsSet = false;

function GoogleMapCanvas({
  language,
  locationId,
  selectedNeighborhoods,
  showAllNeighborhoods = false,
  showNeighborhoodLabels = true,
  highlightedNeighborhood = null,
  isDataLoading = false,
  onNeighborhoodClick,
  onNeighborhoodHover,
  markers,
  selectedMarkerId,
  savedIds,
  onMarkerClick,
  onUnavailable,
  onClusterClick,
}: GoogleMapViewProps & { onUnavailable: () => void; onClusterClick?: (cluster: MapPointCluster) => void; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, HtmlMarkerOverlay>>(new Map());
  const neighborhoodOverlaysRef = useRef<Map<string, {
    polygon: google.maps.Polygon;
    label?: HtmlMarkerOverlay;
  }>>(new Map());
  const location = getLocation(locationId);
  const [mapReady, setMapReady] = useState(false);
  const [mapZoom, setMapZoom] = useState(() => location?.zoom ?? 12);
  // Polygon listeners are bound once per overlay; route them through refs so
  // they always call the latest React callbacks instead of a stale closure.
  const neighborhoodClickRef = useRef(onNeighborhoodClick);
  const neighborhoodHoverRef = useRef(onNeighborhoodHover);
  neighborhoodClickRef.current = onNeighborhoodClick;
  neighborhoodHoverRef.current = onNeighborhoodHover;

  const buildMarkerEl = useCallback(
    (marker: MarkerData, isSelected: boolean, isSaved: boolean): HTMLElement => {
      const color = getMarkerColor(marker);
      const copy = getMarkerCopy(marker, language);
      const t = translations[language];
      const wrapper = document.createElement('div');
      const isMuted = Boolean(selectedMarkerId) && !isSelected;
      wrapper.style.cssText = [
        // Google OverlayView writes the projected coordinate to this wrapper's
        // left/top values. It must be removed from normal flow; relative
        // positioning turns those coordinates into per-element offsets and
        // makes correctly filtered pins appear outside their polygon.
        'position:absolute',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'width:1px',
        'height:1px',
        'transform:translate(-50%,-50%)',
        `z-index:${isSelected ? 100 : 1}`,
      ].join(';');
      const element = document.createElement('button');
      const size = isSelected ? 54 : isMuted ? 32 : 46;
      element.className = 'marqtplaza-map-marker';
      element.style.cssText = [
        'position:relative',
        'z-index:1',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${size}px`,
        `height:${size}px`,
         `min-width:${size}px`,
         `min-height:${size}px`,
         'aspect-ratio:1 / 1',
         'box-sizing:border-box',
         'flex:0 0 auto',
         'overflow:hidden',
         'border-radius:50%',
        `background:${color}`,
        'border:3px solid rgba(255,255,255,0.96)',
         `box-shadow:${isSelected ? `0 0 0 5px ${color}44, 0 8px 18px -6px rgba(23,34,53,0.5)` : `0 7px 16px -5px rgba(23,34,53,0.42), 0 0 0 2px ${color}4d, inset 0 1px 0 rgba(255,255,255,0.48)`}`,
        `opacity:${isMuted ? 0.28 : 1}`,
        `filter:${isMuted ? 'saturate(0.35)' : 'none'}`,
        'transition:width 180ms ease,height 180ms ease,opacity 180ms ease,filter 180ms ease',
        'color:#fff',
        'cursor:pointer',
        'text-decoration:none',
        'padding:0',
      ].join(';');
      element.setAttribute('type', 'button');
      element.setAttribute('data-map-pin', '');
      element.setAttribute('data-event-id', marker.id);
      element.setAttribute('data-marker-color', color);
      element.setAttribute('aria-label', t.openMarker(marker.name));
      element.addEventListener('click', () => onMarkerClick(marker.id));
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('width', '20');
      icon.setAttribute('height', '20');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
       icon.style.color = '#fff';
      icon.innerHTML = getCategoryIconMarkup(marker);
      element.appendChild(icon);

      if (isSaved) {
        const badge = document.createElement('span');
        badge.style.cssText = [
          'position:absolute',
          'top:-4px',
          'right:-4px',
          'width:12px',
          'height:12px',
          'border-radius:50%',
          'background:#f36c21',
          'border:2px solid #fff',
        ].join(';');
        element.appendChild(badge);
      }

      const previewId = `marker-preview-${marker.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const preview = document.createElement('div');
      preview.id = previewId;
      preview.setAttribute('data-marker-preview', '');
      preview.setAttribute('role', 'tooltip');
      preview.style.cssText = [
        'position:absolute',
        'top:calc(100% + 10px)',
        'left:50%',
        'z-index:3',
        'width:224px',
        'transform:translateX(-50%)',
        'border:1px solid hsl(var(--border) / 0.8)',
        'border-radius:12px',
        'background:hsl(var(--card))',
        'padding:12px',
        'text-align:left',
        'box-shadow:0 12px 28px rgba(0,0,0,0.18)',
        'font-family:inherit',
        'pointer-events:none',
        'opacity:0',
        'visibility:hidden',
        'transition:opacity 160ms ease, visibility 160ms ease',
      ].join(';');
      const title = document.createElement('p');
      title.textContent = marker.name;
      title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:800;color:hsl(var(--foreground));';
      const category = document.createElement('p');
      category.textContent = t.categories[marker.category];
      category.style.cssText = 'margin-top:2px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:hsl(var(--primary));';
      const description = document.createElement('p');
      description.textContent = copy.description;
      description.style.cssText = 'display:-webkit-box;overflow:hidden;margin-top:4px;font-size:12px;line-height:1.45;color:hsl(var(--muted-foreground));-webkit-box-orient:vertical;-webkit-line-clamp:2;';
      const details = document.createElement('p');
      details.textContent = copy.details;
      details.style.cssText = 'margin-top:8px;font-size:11px;font-weight:700;color:hsl(var(--secondary));';
      preview.append(title, category, description, details);
      wrapper.append(element, preview);

      const showPreview = () => {
        preview.style.opacity = '1';
        preview.style.visibility = 'visible';
        element.setAttribute('aria-describedby', previewId);
        wrapper.style.zIndex = '1000';
        wrapper.dispatchEvent(new CustomEvent('marker-preview-visibility', { detail: { visible: true } }));
      };
      const hidePreview = () => {
        preview.style.opacity = '0';
        preview.style.visibility = 'hidden';
        element.removeAttribute('aria-describedby');
        wrapper.style.zIndex = isSelected ? '100' : '1';
        wrapper.dispatchEvent(new CustomEvent('marker-preview-visibility', { detail: { visible: false } }));
      };
      element.addEventListener('mouseenter', showPreview);
      element.addEventListener('mouseleave', hidePreview);
      element.addEventListener('focus', showPreview);
      element.addEventListener('blur', hidePreview);

      return wrapper;
    },
    [language, onMarkerClick, selectedMarkerId],
  );

  const buildClusterEl = useCallback(
    (cluster: MapPointCluster): HTMLElement => {
      return createHtmlClusterElement(cluster, () => {
        const map = mapRef.current;
        if (!map) return;
        map.panTo({ lat: cluster.lat, lng: cluster.lng });
        map.setZoom(Math.min(18, (map.getZoom() ?? mapZoom) + 2));
        onClusterClick?.(cluster);
      });
    },
    [mapZoom, onClusterClick],
  );

  useEffect(() => {
    if (!location || !containerRef.current) {
      onUnavailable();
      return;
    }

    const mapsWindow = window as typeof window & { gm_authFailure?: () => void };
    const previousAuthFailure = mapsWindow.gm_authFailure;
    let disposed = false;

    mapsWindow.gm_authFailure = onUnavailable;
    if (!apiOptionsSet) {
      setOptions({ key: googleMapsApiKey!, v: 'weekly' });
      apiOptionsSet = true;
    }

    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    const mapsLibrary = importLibrary('maps') as Promise<google.maps.MapsLibrary>;
    const loadTimedOut = new Promise<never>((_, reject) => {
      loadTimeout = setTimeout(
        () => reject(new Error('Google Maps did not load before the fallback timeout.')),
        GOOGLE_MAPS_LOAD_TIMEOUT_MS,
      );
    });

    Promise.race([mapsLibrary, loadTimedOut])
      .then(({ Map: GoogleMap }) => {
        if (disposed || !containerRef.current) return;
        mapRef.current = new GoogleMap(containerRef.current, {
          center: { lat: location.lat, lng: location.lng },
          zoom: location.zoom,
          styles: MAP_STYLES,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setMapZoom(location.zoom);
        setMapReady(true);
      })
      .catch(onUnavailable)
      .finally(() => {
        if (loadTimeout) clearTimeout(loadTimeout);
      });

    return () => {
      disposed = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      mapsWindow.gm_authFailure = previousAuthFailure;
    };
  }, [location, onUnavailable]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const zoomListener = mapRef.current.addListener('zoom_changed', () => {
      setMapZoom(mapRef.current?.getZoom() ?? location?.zoom ?? 12);
    });
    return () => zoomListener.remove();
  }, [location?.zoom, mapReady]);

  // Only refit the camera when the content actually changes; parent re-renders
  // (e.g. hover state) that pass equivalent props must never reset user zoom.
  const viewportSignature = getViewportSignature(markers, selectedNeighborhoods);
  const viewportMarkersRef = useRef(markers);
  viewportMarkersRef.current = markers;
  const viewportNeighborhoodsRef = useRef(selectedNeighborhoods);
  viewportNeighborhoodsRef.current = selectedNeighborhoods;

  useEffect(() => {
    if (!mapReady || !mapRef.current || !location) return;
    const markers = viewportMarkersRef.current;
    const selectedNeighborhoods = viewportNeighborhoodsRef.current;
    const neighborhoods = getNeighborhoodAreas(
      locationId,
      showAllNeighborhoods && selectedNeighborhoods.length === 0
        ? (location.neighborhoods ?? selectedNeighborhoods)
        : selectedNeighborhoods,
    );
    if (neighborhoods.length === 0 && markers.length === 1) {
      mapRef.current.panTo({ lat: markers[0].lat, lng: markers[0].lng });
      mapRef.current.setZoom(15);
    } else if (neighborhoods.length === 0 && markers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((marker) => bounds.extend({ lat: marker.lat, lng: marker.lng }));
      mapRef.current.fitBounds(bounds, 64);
    } else if (neighborhoods.length === 0) {
      mapRef.current.panTo({ lat: location.lat, lng: location.lng });
      mapRef.current.setZoom(location.zoom);
    } else if (neighborhoods.length === 1) {
      const bounds = new google.maps.LatLngBounds();
      neighborhoods[0].boundary.flat().forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      mapRef.current.fitBounds(bounds, 64);
    } else {
      const bounds = new google.maps.LatLngBounds();
      neighborhoods.forEach((area) => {
        area.boundary.flat().forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      });
      mapRef.current.fitBounds(bounds, 64);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- content tracked via viewportSignature
  }, [location, locationId, mapReady, viewportSignature, showAllNeighborhoods]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !location) return;

    const areas = getNeighborhoodAreas(
      locationId,
      showAllNeighborhoods ? (location.neighborhoods ?? selectedNeighborhoods) : selectedNeighborhoods,
    );
    const activeNames = new Set(areas.map((area) => area.name));

    for (const [name, overlay] of neighborhoodOverlaysRef.current) {
      if (activeNames.has(name)) continue;
      overlay.polygon.setMap(null);
      overlay.label?.setMap(null);
      neighborhoodOverlaysRef.current.delete(name);
    }

    for (const area of areas) {
      const isSelected = isNeighborhoodSelected(area.name, selectedNeighborhoods, highlightedNeighborhood);
      const existing = neighborhoodOverlaysRef.current.get(area.name);
      if (existing) {
        const paths = area.boundary.map((ring) => ring.map(([lat, lng]) => ({ lat, lng })));
        existing.polygon.setPaths(paths);
        existing.polygon.setOptions({
          strokeColor: isSelected ? '#f36c21' : '#0f766e',
          strokeOpacity: isSelected ? 1 : 0.2,
          strokeWeight: isSelected ? 5 : 3,
          fillColor: isSelected ? '#f36c21' : '#2dd4bf',
          fillOpacity: isSelected ? 0.2 : 0.1,
        });
        const labelVisible = shouldShowNeighborhoodLabel(area.name, { showNeighborhoodLabels, showAllNeighborhoods, selectedNeighborhoods, highlightedNeighborhood });
        if (labelVisible && existing.label) {
          existing.label.setPosition({ lat: area.lat, lng: area.lng });
          existing.label.setContent(createNeighborhoodLabelElement(area.name));
        } else if (labelVisible && !existing.label) {
          existing.label = createHtmlMarkerOverlay(
            mapRef.current,
            { lat: area.lat, lng: area.lng },
            createNeighborhoodLabelElement(area.name),
            5,
          );
        } else if (!labelVisible && existing.label) {
          existing.label.setMap(null);
          existing.label = undefined;
        }
        continue;
      }

      const polygon = new google.maps.Polygon({
        map: mapRef.current,
        paths: area.boundary.map((ring) => ring.map(([lat, lng]) => ({ lat, lng }))),
        strokeColor: isSelected ? '#f36c21' : '#0f766e',
        strokeOpacity: isSelected ? 1 : 0.2,
        strokeWeight: isSelected ? 5 : 3,
        fillColor: isSelected ? '#f36c21' : '#2dd4bf',
        fillOpacity: isSelected ? 0.2 : 0.1,
         clickable: Boolean(onNeighborhoodClick || onNeighborhoodHover),
        zIndex: 1,
      });
      if (onNeighborhoodClick) {
        polygon.addListener('click', (event: google.maps.PolyMouseEvent) => {
          const domEvent = event.domEvent as MouseEvent | undefined;
          neighborhoodClickRef.current?.(area.name, { additive: domEvent?.shiftKey === true });
        });
      }
      if (onNeighborhoodHover) {
        polygon.addListener('mouseover', () => neighborhoodHoverRef.current?.(area.name));
        polygon.addListener('mouseout', () => neighborhoodHoverRef.current?.(null));
      }
      const label = shouldShowNeighborhoodLabel(area.name, { showNeighborhoodLabels, showAllNeighborhoods, selectedNeighborhoods, highlightedNeighborhood })
        ? createHtmlMarkerOverlay(
            mapRef.current,
            { lat: area.lat, lng: area.lng },
            createNeighborhoodLabelElement(area.name),
            5,
          )
        : undefined;
      neighborhoodOverlaysRef.current.set(area.name, { polygon, ...(label ? { label } : {}) });
    }
   }, [
     location,
     locationId,
     highlightedNeighborhood,
      isDataLoading,
     mapReady,
     onNeighborhoodClick,
      onNeighborhoodHover,
     selectedNeighborhoods,
      showAllNeighborhoods,
      showNeighborhoodLabels,
   ]);

  // Google polygons are canvas-rendered, so CSS animation cannot change their
  // fill. Pulse the selected boundary directly while the filtered request is
  // in flight, then restore the normal selected opacity on cleanup.
  useEffect(() => {
    if (!mapReady || !highlightedNeighborhood || !isDataLoading) return;

    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const overlay = neighborhoodOverlaysRef.current.get(highlightedNeighborhood);
      if (overlay) {
        const phase = (Math.sin(((now - startedAt) / NEIGHBORHOOD_PULSE_DURATION_MS) * Math.PI * 2) + 1) / 2;
        overlay.polygon.setOptions({ fillOpacity: 0.2 + phase * 0.22 });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      const overlay = neighborhoodOverlaysRef.current.get(highlightedNeighborhood);
      overlay?.polygon.setOptions({ fillOpacity: 0.2 });
    };
  }, [highlightedNeighborhood, isDataLoading, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const attachPreviewPriority = (
      mapMarker: HtmlMarkerOverlay,
      content: HTMLElement,
      isSelected: boolean,
    ) => {
      const handlePreviewVisibility = (event: Event) => {
        const visible = (event as CustomEvent<{ visible: boolean }>).detail?.visible;
        mapMarker.setZIndex(visible ? 1000 : isSelected ? 100 : 1);
      };
      content.addEventListener('marker-preview-visibility', handlePreviewVisibility);
    };

    const pointClusters = clusterMapPoints(
      markers,
      (marker) => {
        const world = latLngToWorld({ lat: marker.lat, lng: marker.lng }, mapZoom);
        return { x: world.x, y: world.y };
      },
      MAP_CLUSTER_RADIUS_PX,
      selectedMarkerId,
    );
    const newIds = new Set(pointClusters.map((cluster) => cluster.id));
    for (const [id, mapMarker] of markersRef.current) {
      if (!newIds.has(id)) {
        mapMarker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    for (const cluster of pointClusters) {
      const marker = cluster.points[0]!;
      const isCluster = cluster.points.length > 1;
      const overlayId = cluster.id;
      const existing = markersRef.current.get(overlayId);
      if (existing) {
        if (isCluster) {
          existing.setPosition({ lat: cluster.lat, lng: cluster.lng });
          existing.setContent(buildClusterEl(cluster));
          existing.setZIndex(50);
          continue;
        }

        const isSelected = selectedMarkerId === marker.id;
        const content = buildMarkerEl(marker, isSelected, savedIds.has(marker.id));
        attachPreviewPriority(existing, content, isSelected);
        existing.setPosition({ lat: marker.lat, lng: marker.lng });
        existing.setContent(content);
        existing.setZIndex(isSelected ? 100 : 1);
        continue;
      }

      const content = isCluster
        ? buildClusterEl(cluster)
        : buildMarkerEl(marker, selectedMarkerId === marker.id, savedIds.has(marker.id));
      const mapMarker = createHtmlMarkerOverlay(
        mapRef.current,
        { lat: isCluster ? cluster.lat : marker.lat, lng: isCluster ? cluster.lng : marker.lng },
        content,
        isCluster ? 50 : selectedMarkerId === marker.id ? 100 : 1,
      );
      if (!isCluster) {
        attachPreviewPriority(mapMarker, content, selectedMarkerId === marker.id);
      }
      markersRef.current.set(overlayId, mapMarker);
    }
  }, [buildClusterEl, buildMarkerEl, mapReady, mapZoom, markers, onMarkerClick, savedIds, selectedMarkerId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedMarkerId) return;
    const marker = viewportMarkersRef.current.find((item) => item.id === selectedMarkerId);
    if (marker?.lat != null && marker.lng != null) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
    }
  }, [mapReady, selectedMarkerId]);

  useEffect(() => () => {
    for (const mapMarker of markersRef.current.values()) {
      mapMarker.setMap(null);
    }
    markersRef.current.clear();
    for (const overlay of neighborhoodOverlaysRef.current.values()) {
      overlay.polygon.setMap(null);
      overlay.label?.setMap(null);
    }
    neighborhoodOverlaysRef.current.clear();
  }, []);

  return (
    <div className="absolute inset-0 z-0">
      <div ref={containerRef} className="absolute inset-0" aria-label={MAP_COPY[language].googleMap} />
      <DataLoadingNotice isDataLoading={isDataLoading} />
    </div>
  );
}

type MapProvider = 'google' | 'tiles' | 'fallback';

export function GoogleMapView(props: GoogleMapViewProps) {
  const [provider, setProvider] = useState<MapProvider>(
    hasGoogleMapsApiKey ? 'google' : 'tiles',
  );
  const useTileMap = useCallback(() => setProvider('tiles'), []);
  const useCoordinateFallback = useCallback(() => setProvider('fallback'), []);
  const [openedCluster, setOpenedCluster] = useState<MapPointCluster | null>(null);

  // Close the overlay if the selected marker changes (e.g. they picked one)
  useEffect(() => {
    if (props.selectedMarkerId) {
      setOpenedCluster(null);
    }
  }, [props.selectedMarkerId]);

  let content;
  if (
    props.markers.length === 0
    && props.selectedNeighborhoods.length === 0
    && !props.showAllNeighborhoods
  ) {
    content = (
      <div
        className="absolute inset-0 grid place-items-center bg-muted/40 p-6 text-center"
        role="status"
        aria-label={MAP_COPY[props.language].interactiveMap}
      >
        <div className="max-w-xs">
          <p className="text-sm font-extrabold text-foreground">
            {translations[props.language].noDiscoveries}
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {translations[props.language].noDiscoveriesDescription}
          </p>
        </div>
      </div>
    );
  } else if (provider === 'fallback') {
    content = <CoordinateMapFallback {...props} onClusterClick={setOpenedCluster} />;
  } else if (provider === 'tiles') {
    content = <TileMapView {...props} onUnavailable={useCoordinateFallback} onClusterClick={setOpenedCluster} />;
  } else {
    content = <GoogleMapCanvas {...props} onUnavailable={useTileMap} onClusterClick={setOpenedCluster} />;
  }

  return (
    <div className="relative w-full h-full">
      {content}
      {openedCluster && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-background/20 backdrop-blur-sm">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border flex flex-col max-h-full">
            <div className="p-3 border-b flex items-center justify-between bg-muted/30 rounded-t-2xl shrink-0">
              <h3 className="font-bold text-sm px-1">
                {openedCluster.points.length} {props.language === 'nl' ? 'resultaten hier' : 'results here'}
              </h3>
              <button
                type="button"
                onClick={() => setOpenedCluster(null)}
                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                aria-label={props.language === 'nl' ? 'Sluiten' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 overflow-y-auto min-h-0 space-y-1">
              {openedCluster.points.map(point => {
                const Icon = getCategoryIcon(point);
                return (
                  <button
                    key={point.id}
                    type="button"
                    data-cluster-result-id={point.id}
                    onClick={() => {
                      (props.onClusterMarkerClick ?? props.onMarkerClick)(point.id);
                      setOpenedCluster(null);
                    }}
                    className="w-full text-left p-3 rounded-xl hover:bg-muted/50 transition-colors flex gap-3 items-start group"
                  >
                    <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{point.name}</div>
                      <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mt-0.5">
                        {translations[props.language].categories[point.category]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}