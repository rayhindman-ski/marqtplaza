import type { Language } from './i18n';
import type { Marker } from './data';

export type DiscoveryQuickFilter =
  | 'today'
  | 'week'
  | 'nearby'
  | 'free'
  | 'family'
  | 'indoor'
  | 'open-now';

export type RouteMode = 'driving' | 'bicycling' | 'walking' | 'transit';

export type GeographicPoint = { lat: number; lng: number };

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameCalendarDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatEventTiming(
  startsAt: string | null | undefined,
  language: Language,
  now = new Date(),
): string | null {
  const start = validDate(startsAt);
  if (!start) return null;

  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startsAt ?? '');
  const diffMs = start.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  const locale = language === 'nl' ? 'nl-NL' : 'en-GB';
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);

  if (isAllDay) {
    if (sameCalendarDay(start, now)) return language === 'nl' ? 'Vandaag' : 'Today';
    if (sameCalendarDay(start, addDays(now, 1))) return language === 'nl' ? 'Morgen' : 'Tomorrow';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(start);
  }

  if (diffMs <= 0 && diffMs > -2 * 60 * 60 * 1000) {
    return language === 'nl' ? 'Nu bezig' : 'Happening now';
  }
  if (diffMinutes > 0 && diffMinutes < 60) {
    return language === 'nl'
      ? `Start over ${diffMinutes} min`
      : `Starts in ${diffMinutes} min`;
  }
  if (diffMinutes >= 60 && diffMinutes < 24 * 60) {
    const hours = Math.floor(diffMinutes / 60);
    const roundedHours = diffMinutes % 60 >= 30 ? hours + 0.5 : hours;
    return language === 'nl'
      ? `Start over ${String(roundedHours).replace('.', ',')} uur`
      : `Starts in ${roundedHours} ${roundedHours === 1 ? 'hour' : 'hours'}`;
  }

  if (sameCalendarDay(start, now)) {
    return language === 'nl' ? `Vandaag om ${time}` : `Today at ${time}`;
  }
  if (sameCalendarDay(start, addDays(now, 1))) {
    return language === 'nl' ? `Morgen om ${time}` : `Tomorrow at ${time}`;
  }
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(start);
  return `${date} · ${time}`;
}

export function isEventInDateWindow(
  startsAt: string | null | undefined,
  window: 'today' | 'week',
  now = new Date(),
): boolean {
  const start = validDate(startsAt);
  if (!start) return false;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = addDays(dayStart, window === 'today' ? 1 : 7);
  return start >= dayStart && start < dayEnd;
}

export function distanceKm(from: GeographicPoint, to: GeographicPoint): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.lat))
      * Math.cos(toRadians(to.lat))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isEvent(marker: Marker): boolean {
  return ['Museums', 'Tours', 'Family', 'Entertainment', 'Outdoors', 'Markets'].includes(marker.category);
}

function isFamilyFriendly(marker: Marker): boolean {
  return marker.category === 'Family'
    || marker.activityKind === 'family'
    || /\b(family|families|children|kids|kinderen|gezinnen)\b/i.test(marker.audience ?? '');
}

export function matchesDiscoveryQuickFilters(
  marker: Marker,
  filters: ReadonlySet<DiscoveryQuickFilter>,
  options: {
    now?: Date;
    nearbyOrigin?: GeographicPoint | null;
    nearbyRadiusKm?: number;
  } = {},
): boolean {
  const now = options.now ?? new Date();
  if (filters.has('today') && (!isEvent(marker) || !isEventInDateWindow(marker.startsAt, 'today', now))) return false;
  if (filters.has('week') && (!isEvent(marker) || !isEventInDateWindow(marker.startsAt, 'week', now))) return false;
  if (filters.has('free') && (!isEvent(marker) || marker.priceType !== 'free')) return false;
  if (filters.has('family') && (!isEvent(marker) || !isFamilyFriendly(marker))) return false;
  if (filters.has('indoor') && marker.isIndoor !== true) return false;
  if (filters.has('open-now') && marker.openNow !== true) return false;
  if (filters.has('nearby')) {
    const origin = options.nearbyOrigin;
    if (!origin || distanceKm(origin, marker) > (options.nearbyRadiusKm ?? 2.5)) return false;
  }
  return true;
}

export function routeUrl(marker: Pick<Marker, 'name' | 'lat' | 'lng' | 'isApproximateLocation'>, mode: RouteMode): string | null {
  if (marker.isApproximateLocation) return null;
  if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) return null;
  const destination = `${marker.name}, ${marker.lat}, ${marker.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${mode}`;
}

export function freshnessBadge(
  marker: Pick<Marker, 'firstSeenAt' | 'lastSeenAt' | 'updatedAt' | 'lastCheckedAt' | 'snapshotDate'>,
  language: Language,
  now = new Date(),
): string | null {
  const updated = validDate(marker.updatedAt) ?? validDate(marker.lastSeenAt) ?? validDate(marker.lastCheckedAt);
  if (updated && now.getTime() - updated.getTime() >= 0 && now.getTime() - updated.getTime() <= 3 * 24 * 60 * 60 * 1000) {
    return language === 'nl' ? 'Recent bijgewerkt' : 'Updated recently';
  }
  const firstSeen = validDate(marker.firstSeenAt);
  if (firstSeen && now.getTime() - firstSeen.getTime() >= 0 && now.getTime() - firstSeen.getTime() <= 7 * 24 * 60 * 60 * 1000) {
    return language === 'nl' ? 'Nieuw toegevoegd' : 'Recently added';
  }
  const checked = validDate(marker.lastCheckedAt) ?? validDate(marker.snapshotDate);
  if (checked && now.getTime() - checked.getTime() >= 0 && now.getTime() - checked.getTime() <= 14 * 24 * 60 * 60 * 1000) {
    return language === 'nl' ? 'Recent gecontroleerd' : 'Recently checked';
  }
  return null;
}

export function trustBadge(
  marker: Pick<Marker, 'source' | 'sourceName' | 'officialUrl' | 'reviewStatus'>,
  language: Language,
): string | null {
  if (marker.reviewStatus === 'verified' || marker.source === 'source_scan') {
    return language === 'nl' ? 'Bron gecontroleerd' : 'Verified source';
  }
  if (marker.officialUrl) return language === 'nl' ? 'Officiële bron' : 'Official source';
  if (marker.source === 'google_maps' || marker.source === 'openstreetmap') {
    return language === 'nl' ? 'Kaartbron' : 'Map source';
  }
  return marker.sourceName
    ? (language === 'nl' ? 'Lokale bron' : 'Local source')
    : null;
}