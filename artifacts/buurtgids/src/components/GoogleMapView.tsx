import { useEffect, useRef, useState, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { type Marker as MarkerData, LOCATIONS, type Category } from '../lib/data';

const CATEGORY_COLORS: Record<Category, string> = {
  Businesses: '#f36c21',
  Events: '#6366f1',
  Specials: '#10b981',
};

const CATEGORY_LETTERS: Record<Category, string> = {
  Businesses: 'B',
  Events: 'E',
  Specials: 'S',
};

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeede8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8e6c9' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#5a9368' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8e0d8' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b3d4e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

// Initialise the Maps JS API once for the lifetime of the page
let apiOptionsSet = false;
function ensureApiOptions() {
  if (!apiOptionsSet) {
    setOptions({
      key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
      v: 'weekly',
    });
    apiOptionsSet = true;
  }
}

interface GoogleMapViewProps {
  locationId: string;
  selectedNeighborhood: string | null;
  markers: MarkerData[];
  selectedMarkerId: string | null;
  savedIds: Set<string>;
  onMarkerClick: (id: string) => void;
}

export function GoogleMapView({
  locationId,
  selectedNeighborhood,
  markers,
  selectedMarkerId,
  savedIds,
  onMarkerClick,
}: GoogleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const gmMarkersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const initializedRef = useRef(false);
  // Flip to true once the map instance is ready so dependent effects can re-run
  const [mapReady, setMapReady] = useState(false);

  const location = LOCATIONS.find(l => l.id === locationId);

  const buildMarkerEl = useCallback(
    (marker: MarkerData, isSelected: boolean, isSaved: boolean): HTMLElement => {
      const color = CATEGORY_COLORS[marker.category];
      const letter = CATEGORY_LETTERS[marker.category];
      const size = isSelected ? '40px' : '34px';

      const el = document.createElement('div');
      el.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${size}`,
        `height:${size}`,
        'border-radius:50%',
        `background:${isSelected ? color : '#ffffff'}`,
        `border:2.5px solid ${color}`,
        'box-shadow:0 2px 10px rgba(0,0,0,0.22)',
        'font-size:13px',
        'font-weight:800',
        'font-family:system-ui,sans-serif',
        `color:${isSelected ? '#fff' : color}`,
        'cursor:pointer',
        'position:relative',
        'transition:width 0.2s,height 0.2s',
        isSelected ? `outline:3px solid ${color}55` : '',
      ].join(';');
      el.textContent = letter;

      if (isSaved) {
        const badge = document.createElement('div');
        badge.style.cssText = [
          'position:absolute',
          'top:-4px',
          'right:-4px',
          'width:12px',
          'height:12px',
          'border-radius:50%',
          `background:${color}`,
          'border:2px solid #fff',
        ].join(';');
        el.appendChild(badge);
      }

      return el;
    },
    [],
  );

  // ── Initialise map (runs once) ──────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current || !containerRef.current || !location) return;
    initializedRef.current = true;

    ensureApiOptions();

    Promise.all([
      importLibrary('maps') as Promise<google.maps.MapsLibrary>,
      importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
    ]).then(([{ Map }]) => {
      if (!containerRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: location.lat, lng: location.lng },
        zoom: location.zoom,
        mapId: 'DEMO_MAP_ID',
        styles: MAP_STYLES,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapRef.current = map;
      setMapReady(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pan / zoom when city or neighbourhood changes ────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !location) return;

    if (selectedNeighborhood && location.neighborhoodCoords[selectedNeighborhood]) {
      const coords = location.neighborhoodCoords[selectedNeighborhood];
      mapRef.current.panTo({ lat: coords.lat, lng: coords.lng });
      mapRef.current.setZoom(coords.zoom);
    } else {
      mapRef.current.panTo({ lat: location.lat, lng: location.lng });
      mapRef.current.setZoom(location.zoom);
    }
  }, [mapReady, location, selectedNeighborhood]);

  // ── Sync listing markers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    const existingIds = new Set(gmMarkersRef.current.keys());
    const newIds = new Set(markers.map(m => m.id));

    // Remove stale markers
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        const gm = gmMarkersRef.current.get(id);
        if (gm) gm.map = null;
        gmMarkersRef.current.delete(id);
      }
    }

    // Add / update markers (marker library already loaded above)
    for (const marker of markers) {
      if (marker.lat == null || marker.lng == null) continue;

      const isSelected = selectedMarkerId === marker.id;
      const isSaved = savedIds.has(marker.id);
      const existing = gmMarkersRef.current.get(marker.id);

      if (existing) {
        existing.content = buildMarkerEl(marker, isSelected, isSaved);
        existing.zIndex = isSelected ? 100 : 1;
      } else {
        const el = buildMarkerEl(marker, isSelected, isSaved);
        const gm = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: marker.lat, lng: marker.lng },
          content: el,
          title: marker.name,
          zIndex: isSelected ? 100 : 1,
        });
        gm.addListener('click', () => onMarkerClick(marker.id));
        gmMarkersRef.current.set(marker.id, gm);
      }
    }
  }, [mapReady, markers, selectedMarkerId, savedIds, buildMarkerEl, onMarkerClick]);

  // ── Pan to selected marker ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedMarkerId) return;
    const marker = markers.find(m => m.id === selectedMarkerId);
    if (marker?.lat != null && marker?.lng != null) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
    }
  }, [mapReady, selectedMarkerId, markers]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const gm of gmMarkersRef.current.values()) {
        gm.map = null;
      }
      gmMarkersRef.current.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0"
      aria-label="Google Map"
    />
  );
}
