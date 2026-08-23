import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { Baby, Coffee, Gamepad2, Landmark, MapPin as MapPinIcon, Route, ShoppingBag, Waves, type LucideIcon } from 'lucide-react';
import { type Marker as MarkerData, LOCATIONS, type Category } from '../lib/data';
import { getMarkerCopy, translations, type Language } from '../lib/i18n';

type MapCategory = Category;

const CATEGORY_COLORS: Record<MapCategory, string> = {
  Museums:       '#8b5cf6',
  Tours:         '#f36c21',
  Family:        '#ec4899',
  Entertainment: '#6366f1',
  Outdoors:      '#10b981',
  Markets:       '#f59e0b',
  Businesses:    '#f36c21',
  'Food & Drink': '#b45309',
};

const CATEGORY_ICONS: Record<MapCategory, LucideIcon> = {
  Museums: Landmark,
  Tours: Route,
  Family: Baby,
  Entertainment: Gamepad2,
  Outdoors: Waves,
  Markets: ShoppingBag,
  Businesses: MapPinIcon,
  'Food & Drink': Coffee,
};

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.stroke', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
];
const MARQTPLAZA_MARKER_GRADIENT = 'linear-gradient(135deg, #11b8c5 0%, #168ca4 42%, #f36c21 100%)';

const TILE_SIZE = 256;
const MIN_TILE_ZOOM = 10;
const MAX_TILE_ZOOM = 18;
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const googleMapsBrowserKeyPattern = /^AIza[0-9A-Za-z_-]{35}$/;
const hasGoogleMapsApiKey = googleMapsBrowserKeyPattern.test(googleMapsApiKey ?? '');

interface GoogleMapViewProps {
  language: Language;
  locationId: string;
  selectedNeighborhoods: string[];
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

type HtmlMarkerOverlay = google.maps.OverlayView & {
  setContent: (content: HTMLElement) => void;
  setZIndex: (zIndex: number) => void;
};

function createHtmlMarkerOverlay(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  initialContent: HTMLElement,
  initialZIndex: number,
): HtmlMarkerOverlay {
  class MarkerOverlay extends google.maps.OverlayView {
    private content = initialContent;
    private zIndex = initialZIndex;

    onAdd() {
      const panes = this.getPanes();
      if (!panes) return;
      panes.overlayMouseTarget.appendChild(this.content);
    }

    draw() {
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(position);
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

    setZIndex(zIndex: number) {
      this.zIndex = zIndex;
      this.content.style.zIndex = String(zIndex);
    }
  }

  const overlay = new MarkerOverlay() as HtmlMarkerOverlay;
  overlay.setMap(map);
  return overlay;
}

type MapPoint = Pick<MarkerData, 'id' | 'name' | 'category' | 'description' | 'details' | 'lat' | 'lng'> & {
  category: MapCategory;
};

function getCategoryIcon(category: MapCategory) {
  return CATEGORY_ICONS[category] ?? MapPinIcon;
}

function getCategoryColor(category: MapCategory) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Businesses;
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

function getCategoryIconMarkup(category: MapCategory) {
  const markup: Record<MapCategory, string> = {
    Museums: '<path d="M3 21h18M5 21V10m14 11V10M3 10h18L12 3 3 10Zm4 4h2m2 0h2m2 0h2M7 18h2m2 0h2m2 0h2" />',
    Tours: '<circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="m8.5 17.5 7-11" />',
    Family: '<circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M9 8h.01M15 8h.01" />',
    Entertainment: '<path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1 4A3 3 0 0 1 18 19h-.2a3 3 0 0 1-2.1-.9L14 16h-4l-1.7 2.1a3 3 0 0 1-2.1.9H6a3 3 0 0 1-2.9-2.1l-1-4A4 4 0 0 1 6 8Z" /><path d="M8 12v3m-1.5-1.5h3M16 13h.01M19 13h.01" />',
    Outdoors: '<path d="M2 12c3.3-3 6.7-3 10 0s6.7 3 10 0M2 17c3.3-3 6.7-3 10 0s6.7 3 10 0" />',
    Markets: '<path d="M3 9h18l-1 12H4L3 9Zm2-5h14l2 5H3l2-5Zm4 0v5m6-5v5" />',
    Businesses: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />',
    'Food & Drink': '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" /><path d="M6 2v3m3-3v3m3-3v3" />',
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
        description: `Central map view for ${location.name}`,
        details: 'Explore nearby places',
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

function getNeighborhoodViewport(
  locationId: string,
  neighborhoodNames: string[],
  mapSize: { width: number; height: number },
): TileViewport {
  const location = getLocation(locationId) ?? LOCATIONS[0];
  const neighborhoods = neighborhoodNames
    .map((name) => location.neighborhoodCoords[name])
    .filter((area): area is { lat: number; lng: number; zoom: number } => Boolean(area));

  if (neighborhoods.length === 0) {
    return getInitialViewport(locationId);
  }
  if (neighborhoods.length === 1) {
    return {
      center: { lat: neighborhoods[0].lat, lng: neighborhoods[0].lng },
      zoom: Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, neighborhoods[0].zoom)),
    };
  }

  const latitudes = neighborhoods.map((area) => area.lat);
  const longitudes = neighborhoods.map((area) => area.lng);
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

function CoordinateMapFallback({
  language,
  locationId,
  markers,
  selectedMarkerId,
  onMarkerClick,
}: Pick<
  GoogleMapViewProps,
  'language' | 'locationId' | 'markers' | 'selectedMarkerId' | 'onMarkerClick'
>) {
  const points = getMapPoints(locationId, markers);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

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

        const className = "marqtplaza-map-marker relative flex items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35";
        const style = {
          width: isSelected ? 48 : 38,
          height: isSelected ? 48 : 38,
          boxShadow: isSelected ? `0 0 0 5px ${color}44, 0 8px 18px -6px rgba(23,34,53,0.5)` : undefined,
        };
        const ariaLabel = `Show ${point.name} at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
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
              data-event-id={point.id}
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
    if (!location) return;
    setViewport(getNeighborhoodViewport(locationId, selectedNeighborhoods, size));
  }, [locationId, selectedNeighborhoods, size.height, size.width]);

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
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
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

        const className = "marqtplaza-map-marker relative flex items-center justify-center rounded-full font-black text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/35";
        const style = {
          width: isSelected ? 50 : 43,
          height: isSelected ? 50 : 43,
          boxShadow: isSelected ? `0 0 0 5px ${color}44, 0 8px 18px -6px rgba(23,34,53,0.5)` : undefined,
        };
        const ariaLabel = `Open ${point.name} at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}${savedIds.has(point.id) ? ', saved' : ''}`;
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
  language,
  locationId,
  selectedNeighborhoods,
  markers,
  selectedMarkerId,
  savedIds,
  onMarkerClick,
  onUnavailable,
}: GoogleMapViewProps & { onUnavailable: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, HtmlMarkerOverlay>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const location = getLocation(locationId);

  const buildMarkerEl = useCallback(
    (marker: MarkerData, isSelected: boolean, isSaved: boolean): HTMLElement => {
      const color = getCategoryColor(marker.category);
      const copy = getMarkerCopy(marker, language);
      const t = translations[language];
      const wrapper = document.createElement('div');
      wrapper.style.cssText = [
        'position:relative',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'width:1px',
        'height:1px',
        'transform:translate(-50%,-50%)',
        `z-index:${isSelected ? 100 : 1}`,
      ].join(';');
      const element = document.createElement('button');
      const size = isSelected ? 54 : 46;
      element.className = 'marqtplaza-map-marker';
      element.style.cssText = [
        'position:relative',
        'z-index:1',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${size}px`,
        `height:${size}px`,
        'border-radius:50%',
        `background:${MARQTPLAZA_MARKER_GRADIENT}`,
        'border:3px solid rgba(255,255,255,0.96)',
        `box-shadow:${isSelected ? `0 0 0 5px ${color}44, 0 8px 18px -6px rgba(23,34,53,0.5)` : '0 7px 16px -5px rgba(23,34,53,0.42), 0 0 0 2px rgba(17,184,197,0.22), inset 0 1px 0 rgba(255,255,255,0.48)'}`,
        'color:#fff',
        'cursor:pointer',
        'text-decoration:none',
        'padding:0',
      ].join(';');
      element.setAttribute('type', 'button');
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
    [language, onMarkerClick],
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

    (importLibrary('maps') as Promise<google.maps.MapsLibrary>)
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
    const neighborhoods = selectedNeighborhoods
      .map((name) => location.neighborhoodCoords[name])
      .filter((area): area is { lat: number; lng: number; zoom: number } => Boolean(area));
    if (neighborhoods.length === 0) {
      mapRef.current.panTo({ lat: location.lat, lng: location.lng });
      mapRef.current.setZoom(location.zoom);
    } else if (neighborhoods.length === 1) {
      mapRef.current.panTo(neighborhoods[0]);
      mapRef.current.setZoom(neighborhoods[0].zoom);
    } else {
      const bounds = new google.maps.LatLngBounds();
      neighborhoods.forEach((area) => bounds.extend(area));
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [location, mapReady, selectedNeighborhoods]);

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

    const newIds = new Set(markers.map((marker) => marker.id));
    for (const [id, mapMarker] of markersRef.current) {
      if (!newIds.has(id)) {
        mapMarker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    for (const marker of markers) {
      if (marker.lat == null || marker.lng == null) continue;
      const isSelected = selectedMarkerId === marker.id;
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        const content = buildMarkerEl(marker, isSelected, savedIds.has(marker.id));
        attachPreviewPriority(existing, content, isSelected);
        existing.setContent(content);
        existing.setZIndex(isSelected ? 100 : 1);
        continue;
      }

      const content = buildMarkerEl(marker, isSelected, savedIds.has(marker.id));
      const mapMarker = createHtmlMarkerOverlay(
        mapRef.current,
        { lat: marker.lat, lng: marker.lng },
        content,
        isSelected ? 100 : 1,
      );
      attachPreviewPriority(mapMarker, content, isSelected);
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
      mapMarker.setMap(null);
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