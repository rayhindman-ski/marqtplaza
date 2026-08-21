import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
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

type MapPoint = Pick<MarkerData, 'id' | 'name' | 'category' | 'lat' | 'lng'>;

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
        category: 'Businesses' as Category,
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
        const color = CATEGORY_COLORS[point.category];

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
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white font-black text-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35"
            style={{
              left,
              top,
              width: isSelected ? 40 : 34,
              height: isSelected ? 40 : 34,
              backgroundColor: color,
              boxShadow: isSelected ? `0 0 0 4px ${color}55, 0 2px 10px rgba(0,0,0,0.22)` : undefined,
            }}
            aria-label={`Show ${point.name} at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}${savedIds.has(point.id) ? ', saved' : ''}`}
          >
            <span className="text-[13px]">{CATEGORY_LETTERS[point.category]}</span>
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
      const color = CATEGORY_COLORS[marker.category];
      const element = document.createElement('div');
      const size = isSelected ? 40 : 34;
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
        'font-size:13px',
        'font-weight:800',
        'font-family:system-ui,sans-serif',
        `color:${isSelected ? '#fff' : color}`,
        'cursor:pointer',
      ].join(';');
      element.textContent = CATEGORY_LETTERS[marker.category];

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