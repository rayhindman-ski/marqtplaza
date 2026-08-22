import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { Baby, Gamepad2, Landmark, MapPin as MapPinIcon, Route, ShoppingBag, Waves, type LucideIcon } from 'lucide-react';
import { type Marker as MarkerData, LOCATIONS, type Category } from '../lib/data';

type MapCategory = Category | 'Businesses';

const CATEGORY_COLORS: Record<MapCategory, string> = {
  Museums:       '#8b5cf6',
  Tours:         '#f36c21',
  Family:        '#ec4899',
  Entertainment: '#6366f1',
  Outdoors:      '#10b981',
  Markets:       '#f59e0b',
  Businesses:    '#f36c21',
};

const CATEGORY_ICONS: Record<MapCategory, LucideIcon> = {
  Museums: Landmark,
  Tours: Route,
  Family: Baby,
  Entertainment: Gamepad2,
  Outdoors: Waves,
  Markets: ShoppingBag,
  Businesses: MapPinIcon,
};

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeede8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8e6c9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8e0d8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b3d4e8' }] },
];

const TILE_SIZE = 256;
const MIN_TILE_ZOOM = 10;
const MAX_TILE_ZOOM = 18;
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const googleMapsBrowserKeyPattern = /^AIza[0-9A-Za-z_-]{35}$/;
const hasGoogleMapsApiKey = googleMapsBrowserKeyPattern.test(googleMapsApiKey ?? '');

interface GoogleMapViewProps {
  locationId: string;
  selectedNeighborhood: string | null;
  markers: MarkerData[];
  selectedMarkerId: string | null;
  savedIds: Set<string>;
  onMarkerClick: (id: string) => void;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface TileViewport {
  center: LatLng;
  zoom: number;
}

type MapPoint = Omit<Pick<MarkerData, 'id' | 'name' | 'category' | 'lat' | 'lng'>, 'category'> & {
  category: MapCategory;
};

function getCategoryIcon(category: MapCategory) {
  return CATEGORY_ICONS[category] ?? MapPinIcon;
}

function getCategoryColor(category: MapCategory) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Businesses;
}

function getCategoryIconMarkup(category: MapCategory) {
  const markup: Record<MapCategory, string> = {
    Museums: '<path d="M3 21h18M5 21V10m14 11V10M3 10h18L12 3 3 10Zm4 4h2m2 0h2m2 0h2M7 18h2m2 0h2m2 0h2" />',
    Tours: '<circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="m8.5 17.5 7-11" />',
    Family: '<circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M9 8h.01M15 8h.01" />',
    Entertainment: '<path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1 4A3 3 0 0 1 18 19h-.2a3 3 0 0 1-2.1-.9L14 16h-4l-1.7 2.1a3 3 0 0 1-2.1.9H6a3 3 0 0 1-2.9-2.1l-1-4A4 4 0 0 1 6 8Z" /><path d="M8 12v3m-1.5-1.5h3M16 13h.01M19 13h.01" />',
    Outdoors: '<path d="M2 12c3.3-3 6.7-3 10 0s6.7 3 10 0M2 17c3.3-3 6.7-3 10 0s6.7 3 10 0" />',
    Markets: '<path d="M3 9h18l-1 12H4L3 9Zm2-5h14l2 5H3l2-5Zm4 0v5m6-5v5" />',
    Businesses: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />',
  };
  return markup[category] ?? markup.Businesses;
}

function getLocation(locationId: string) {
  return LOCATIONS.find((item) => item.id === locationId);
}

function getMapPoints(locationId: string, markers: MarkerData[]): MapPoint[] {
  if (markers.length > 0) return markers;

  const location = getLocation(locationId);
  return location
    ? [{
        id: 'city-centre',
        name: location.name,
        category: 'Businesses',
        lat: location.lat,
        lng: location.lng,
      }]
    : [];
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

function getInitialViewport(locationId: string): TileViewport {
  const location = getLocation(locationId) ?? LOCATIONS[0];
  return {
    center: { lat: location.lat, lng: location.lng },
    zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, location.zoom)),
  };
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
  const points = getMapPoints(locationId, markers);

  if (points.length === 0) {
    return (
      <div
        className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,_#e8f0e9_0%,_#f7f4ed_46%,_#dceaf0_100%)] p-6 text-center"
        aria-label="Activity coordinate map"
      >
        <p className="max-w-xs text-sm font-semibold text-muted-foreground">
          Live map tiles are unavailable and there are no activity coordinates to display.
        </p>
      </div>
    );
  }

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
        const color = getCategoryColor(point.category);
        const Icon = getCategoryIcon(point.category);

        return (
          <button
            key={point.id}
            type="button"
            onClick={() => onMarkerClick(point.id)}
            className="absolute z-10 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35"
            style={{
              left: `${Math.max(5, Math.min(95, left))}%`,
              top: `${Math.max(10, Math.min(92, top))}%`,
               width: isSelected ? 48 : 38,
               height: isSelected ? 48 : 38,
              backgroundColor: color,
            }}
            aria-label={`Show ${point.name} at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
          >
            <Icon className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function TileMapView({
  locationId,
  selectedNeighborhood,
  markers,
  selectedMarkerId,
  savedIds,
  onMarkerClick,
  onUnavailable,
}: GoogleMapViewProps & { onUnavailable: () => void }) {
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

  useEffect(() => {
    const location = getLocation(locationId);
    if (!location || !selectedNeighborhood) return;

    const neighborhood = location.neighborhoodCoords[selectedNeighborhood];
    if (neighborhood) {
      setViewport({
        center: { lat: neighborhood.lat, lng: neighborhood.lng },
        zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, neighborhood.zoom)),
      });
    }
  }, [locationId, selectedNeighborhood]);

  useEffect(() => {
    const marker = markers.find((item) => item.id === selectedMarkerId);
    if (marker?.lat != null && marker.lng != null) {
      setViewport((current) => ({
        ...current,
        center: { lat: marker.lat, lng: marker.lng },
      }));
    }
  }, [markers, selectedMarkerId]);

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

  const points = getMapPoints(locationId, markers);
  const center = latLngToWorld(viewport.center, viewport.zoom);
  const mapLeft = center.x - size.width / 2;
  const mapTop = center.y - size.height / 2;

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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 cursor-grab overflow-hidden bg-[#e9efea] select-none active:cursor-grabbing"
      aria-label="Interactive activity map"
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

      {points.map((point) => {
        const world = latLngToWorld({ lat: point.lat, lng: point.lng }, viewport.zoom);
        const left = world.x - mapLeft;
        const top = world.y - mapTop;
        const isSelected = point.id === selectedMarkerId;
        const color = getCategoryColor(point.category);
        const Icon = getCategoryIcon(point.category);

        return (
          <button
            key={point.id}
            type="button"
            data-map-pin
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onMarkerClick(point.id);
            }}
             className="absolute z-10 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white font-black text-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35"
            style={{
              left,
              top,
               width: isSelected ? 50 : 43,
               height: isSelected ? 50 : 43,
              backgroundColor: color,
              boxShadow: isSelected ? `0 0 0 4px ${color}55, 0 2px 10px rgba(0,0,0,0.22)` : undefined,
            }}
            aria-label={`Show ${point.name} at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}${savedIds.has(point.id) ? ', saved' : ''}`}
          >
             <Icon className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden="true" />
            {savedIds.has(point.id) && (
              <span
                className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white"
                style={{ backgroundColor: color }}
              />
            )}
          </button>
        );
      })}

      <div className="absolute bottom-3 left-3 z-20 flex overflow-hidden rounded-lg border border-border/80 bg-card shadow-md">
        <button
          type="button"
          aria-label="Zoom in"
          className="grid h-9 w-9 place-items-center border-r border-border text-lg font-bold text-foreground hover:bg-muted"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
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
        © OpenStreetMap contributors
      </a>
    </div>
  );
}

let apiOptionsSet = false;

function GoogleMapCanvas({
  locationId,
  selectedNeighborhood,
  markers,
  selectedMarkerId,
  savedIds,
  onMarkerClick,
  onUnavailable,
}: GoogleMapViewProps & { onUnavailable: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerLibraryRef = useRef<google.maps.MarkerLibrary | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const location = getLocation(locationId);

  const buildMarkerEl = useCallback(
    (marker: MarkerData, isSelected: boolean, isSaved: boolean): HTMLElement => {
      const color = getCategoryColor(marker.category);
      const element = document.createElement('div');
      const size = isSelected ? 50 : 43;
      element.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${size}px`,
        `height:${size}px`,
        'border-radius:50%',
        `background:${isSelected ? color : '#ffffff'}`,
        `border:2.5px solid ${color}`,
        'box-shadow:0 2px 10px rgba(0,0,0,0.22)',
        `color:${isSelected ? '#fff' : color}`,
        'cursor:pointer',
      ].join(';');
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
      icon.style.color = isSelected ? '#fff' : color;
      icon.innerHTML = getCategoryIconMarkup(marker.category);
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
          `background:${color}`,
          'border:2px solid #fff',
        ].join(';');
        element.appendChild(badge);
      }
      return element;
    },
    [],
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

    Promise.all([
      importLibrary('maps') as Promise<google.maps.MapsLibrary>,
      importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
    ])
      .then(([{ Map: GoogleMap }, markerLibrary]) => {
        if (disposed || !containerRef.current) return;
        mapRef.current = new GoogleMap(containerRef.current, {
          center: { lat: location.lat, lng: location.lng },
          zoom: location.zoom,
          mapId: 'DEMO_MAP_ID',
          styles: MAP_STYLES,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        markerLibraryRef.current = markerLibrary;
        setMapReady(true);
      })
      .catch(onUnavailable);

    return () => {
      disposed = true;
      mapsWindow.gm_authFailure = previousAuthFailure;
    };
  }, [location, onUnavailable]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !location) return;
    const neighborhood = selectedNeighborhood
      ? location.neighborhoodCoords[selectedNeighborhood]
      : undefined;
    mapRef.current.panTo(neighborhood ?? { lat: location.lat, lng: location.lng });
    mapRef.current.setZoom(neighborhood?.zoom ?? location.zoom);
  }, [location, mapReady, selectedNeighborhood]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerLibraryRef.current) return;

    const newIds = new Set(markers.map((marker) => marker.id));
    for (const [id, mapMarker] of markersRef.current) {
      if (!newIds.has(id)) {
        mapMarker.map = null;
        markersRef.current.delete(id);
      }
    }

    for (const marker of markers) {
      if (marker.lat == null || marker.lng == null) continue;
      const isSelected = selectedMarkerId === marker.id;
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.content = buildMarkerEl(marker, isSelected, savedIds.has(marker.id));
        existing.zIndex = isSelected ? 100 : 1;
        continue;
      }

      const mapMarker = new markerLibraryRef.current.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: marker.lat, lng: marker.lng },
        content: buildMarkerEl(marker, isSelected, savedIds.has(marker.id)),
        title: marker.name,
        zIndex: isSelected ? 100 : 1,
      });
      mapMarker.addListener('click', () => onMarkerClick(marker.id));
      markersRef.current.set(marker.id, mapMarker);
    }
  }, [buildMarkerEl, mapReady, markers, onMarkerClick, savedIds, selectedMarkerId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedMarkerId) return;
    const marker = markers.find((item) => item.id === selectedMarkerId);
    if (marker?.lat != null && marker.lng != null) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
    }
  }, [mapReady, markers, selectedMarkerId]);

  useEffect(() => () => {
    for (const mapMarker of markersRef.current.values()) {
      mapMarker.map = null;
    }
    markersRef.current.clear();
  }, []);

  return <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Google Map" />;
}

type MapProvider = 'google' | 'tiles' | 'fallback';

export function GoogleMapView(props: GoogleMapViewProps) {
  const [provider, setProvider] = useState<MapProvider>(
    hasGoogleMapsApiKey ? 'google' : 'tiles',
  );
  const useTileMap = useCallback(() => setProvider('tiles'), []);
  const useCoordinateFallback = useCallback(() => setProvider('fallback'), []);

  if (provider === 'fallback') {
    return <CoordinateMapFallback {...props} />;
  }

  if (provider === 'tiles') {
    return <TileMapView {...props} onUnavailable={useCoordinateFallback} />;
  }

  return <GoogleMapCanvas {...props} onUnavailable={useTileMap} />;
}