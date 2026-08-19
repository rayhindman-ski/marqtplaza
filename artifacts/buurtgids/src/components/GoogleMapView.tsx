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

function CoordinateMapFallback({
  locationId,
  markers,
  selectedMarkerId,
  onMarkerClick,
}: Pick<
  GoogleMapViewProps,
  'locationId' | 'markers' | 'selectedMarkerId' | 'onMarkerClick'
>) {
  const location = LOCATIONS.find((item) => item.id === locationId);
  const points = markers.length > 0 ? markers : location ? [{
    id: 'city-centre',
    name: location.name,
    category: 'Businesses' as Category,
    lat: location.lat,
    lng: location.lng,
  }] : [];
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const latitudePadding = Math.max(0.006, (Math.max(...latitudes) - Math.min(...latitudes)) * 0.25);
  const longitudePadding = Math.max(0.009, (Math.max(...longitudes) - Math.min(...longitudes)) * 0.25);
  const minLat = Math.min(...latitudes) - latitudePadding;
  const maxLat = Math.max(...latitudes) + latitudePadding;
  const minLng = Math.min(...longitudes) - longitudePadding;
  const maxLng = Math.max(...longitudes) + longitudePadding;

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,_#e8f0e9_0%,_#f7f4ed_46%,_#dceaf0_100%)]"
      aria-label="Activity coordinate map"
    >
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(72,105,93,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(72,105,93,0.14)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute left-5 top-5 z-10 max-w-xs rounded-xl border border-border/70 bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
        <p className="text-xs font-extrabold text-foreground">Activity coordinate map</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Live map tiles are unavailable. Activity pins use their latitude and longitude.
        </p>
      </div>
      {points.map((point) => {
        const left = ((point.lng - minLng) / (maxLng - minLng)) * 100;
        const top = ((maxLat - point.lat) / (maxLat - minLat)) * 100;
        const isSelected = point.id === selectedMarkerId;
        const color = CATEGORY_COLORS[point.category];

        return (
          <button
            key={point.id}
            type="button"
            onClick={() => onMarkerClick(point.id)}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35"
            style={{
              left: `${Math.max(5, Math.min(95, left))}%`,
              top: `${Math.max(10, Math.min(92, top))}%`,
              width: isSelected ? 38 : 30,
              height: isSelected ? 38 : 30,
              backgroundColor: color,
            }}
            aria-label={`Show ${point.name} at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
          >
            <span className="text-[10px] font-black text-white">{CATEGORY_LETTERS[point.category]}</span>
          </button>
        );
      })}
    </div>
  );
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
  const markerLibraryRef = useRef<google.maps.MarkerLibrary | null>(null);
  const initializedRef = useRef(false);
  // Flip to true once the map instance is ready so dependent effects can re-run
  const [mapReady, setMapReady] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);

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

  useEffect(() => {
    const mapsWindow = window as typeof window & { gm_authFailure?: () => void };
    const previousAuthFailure = mapsWindow.gm_authFailure;
    mapsWindow.gm_authFailure = () => {
      setMapUnavailable(true);
    };
    return () => {
      mapsWindow.gm_authFailure = previousAuthFailure;
    };
  }, []);

  // ── Initialise map (runs once) ──────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current || !containerRef.current || !location || mapUnavailable) return;
    initializedRef.current = true;

    ensureApiOptions();

    Promise.all([
      importLibrary('maps') as Promise<google.maps.MapsLibrary>,
      importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
    ]).then(([{ Map }, markerLibrary]) => {
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
      markerLibraryRef.current = markerLibrary;
      setMapReady(true);
    }).catch(() => {
      setMapUnavailable(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUnavailable]);

  // ── Pan / zoom when city or neighbourhood changes ────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !location || mapUnavailable) return;

    if (selectedNeighborhood && location.neighborhoodCoords[selectedNeighborhood]) {
      const coords = location.neighborhoodCoords[selectedNeighborhood];
      mapRef.current.panTo({ lat: coords.lat, lng: coords.lng });
      mapRef.current.setZoom(coords.zoom);
    } else {
      mapRef.current.panTo({ lat: location.lat, lng: location.lng });
      mapRef.current.setZoom(location.zoom);
    }
  }, [mapReady, location, selectedNeighborhood, mapUnavailable]);

  // ── Sync listing markers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerLibraryRef.current || mapUnavailable) return;
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
        const gm = new markerLibraryRef.current.AdvancedMarkerElement({
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
  }, [mapReady, markers, selectedMarkerId, savedIds, buildMarkerEl, onMarkerClick, mapUnavailable]);

  // ── Pan to selected marker ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedMarkerId || mapUnavailable) return;
    const marker = markers.find(m => m.id === selectedMarkerId);
    if (marker?.lat != null && marker?.lng != null) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
    }
  }, [mapReady, selectedMarkerId, markers, mapUnavailable]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const gm of gmMarkersRef.current.values()) {
        gm.map = null;
      }
      gmMarkersRef.current.clear();
    };
  }, []);

  if (mapUnavailable) {
    return (
      <CoordinateMapFallback
        locationId={locationId}
        markers={markers}
        selectedMarkerId={selectedMarkerId}
        onMarkerClick={onMarkerClick}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0"
      aria-label="Google Map"
    />
  );
}
