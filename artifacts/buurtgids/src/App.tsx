import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Route, Switch, Router as WouterRouter, Link, Redirect, useLocation, useRoute, useSearch } from 'wouter';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { 
  Search, MapPinOff, ArrowLeft,
  Map as MapIcon, Clock, Newspaper,
  Globe2, Bookmark, BookmarkCheck, X, ChevronDown, ChevronUp,
  ScanSearch, RefreshCw, WifiOff, Radio, MapPinned,
  Landmark, Route as RouteIcon, Baby, Building2, Coffee, Gamepad2, HandHeart, Waves, ShoppingBag, ExternalLink, AlertCircle, CalendarPlus,
  CalendarDays, UsersRound, Utensils,
  CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, Sun, Wind, Droplets, Tag, Store,
  Bike, Car, Footprints, TrainFront, ShieldCheck, Sparkles, Navigation, UserRound, Loader2, Menu, Facebook, Instagram
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Toaster } from '@/components/ui/sonner';
import {
  getGetListingsQueryKey,
  getGetWeatherQueryKey,
  setAuthTokenGetter,
  syncSavedEvents,
  type SavedEventsResponse,
  type SavedEventsSyncRequest,
  useGetListings,
  useGetListing,
  useGetWeather,
} from '@workspace/api-client-react';
import {
  LOCATIONS,
  MARKERS,
  ALL_CATEGORIES,
  BUSINESS_CATEGORIES,
  EVENT_CATEGORIES,
  SOCIAL_MAP_CATEGORIES,
  FOOD_TYPES,
  type BusinessCategory,
  type Category,
  type ListingSource,
  type Marker,
  type EventActivityKind,
  type SocialMapCategory,
  type SocialMapReviewStatus,
  type FoodType,
} from './lib/data';
import { GoogleMapView } from './components/GoogleMapView';
import { getSubcategoryColor } from './lib/mapColors';
import CaptureView from './pages/CaptureView';
import SourceDirectoryView from './pages/SourceDirectoryView';
import EventReviewView from './pages/EventReviewView';
import SocialMapReviewView from './pages/SocialMapReviewView';
import NewsFeedView from './pages/NewsFeedView';
import NewsArticleView from './pages/NewsArticleView';
import CommunityFeedView from './pages/CommunityFeedView';
import CommunityModerationView from './pages/CommunityModerationView';
import DealsView from './pages/DealsView';
import BusinessProfileView from './pages/BusinessProfileView';
import BusinessClaimView from './pages/BusinessClaimView';
import ListingCorrectionView from './pages/ListingCorrectionView';
import MyBusinessWorkspace from './pages/MyBusinessWorkspace';
import BusinessRevisionPage from './pages/BusinessRevisionPage';
import BusinessModerationView from './pages/BusinessModerationView';
import OnboardingPage from './pages/OnboardingPage';
import AccountPage from './pages/AccountPage';
import AccountPreferencesPage from './pages/AccountPreferencesPage';
import AccountPrivacyPage from './pages/AccountPrivacyPage';
import { useAccountAuth } from './lib/accountAuth';
import { featureFlags } from './lib/featureFlags';
import { carryReturnPath, resolveReturnPath, withReturnPath } from './lib/returnPath';
import BusinessOnboardingPage from './pages/BusinessOnboardingPage';
import BusinessLookupPage from './pages/BusinessLookupPage';
import BusinessDraftPage from './pages/BusinessDraftPage';
import { useEditorAccess } from './lib/editorAccess';
import {
  getLocationName,
  getMarkerCopy,
  getBusinessCategoryName,
  getListingSourceName,
  getSocialMapCategoryName,
  LANGUAGE_OPTIONS,
  translations,
  type Language,
} from './lib/i18n';
import { persistLanguage, useStoredLanguage } from './lib/useAppLanguage';
import { clerkLocalizationFor } from './lib/clerkLocalization';
import {
  formatEventTiming,
  matchesDiscoveryQuickFilters,
  routeUrl,
  type DiscoveryQuickFilter,
  type RouteMode,
} from './lib/listingPresentation';
import { isPointInsideNeighborhoods } from '@workspace/geo';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatEvidenceCheckedAt(value: string, language: Language): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'nl' ? 'nl-NL' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

type UserRole = 'designer' | 'user';
const USER_ROLE_STORAGE_KEY = 'buurtplaza-user-role';
const DETAIL_LISTING_STORAGE_PREFIX = 'buurtplaza-detail-listing:';
const DETAIL_LISTING_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

function persistDetailListing(listing: Marker): void {
  try {
    localStorage.setItem(
      `${DETAIL_LISTING_STORAGE_PREFIX}${listing.id}`,
      JSON.stringify({ savedAt: Date.now(), listing }),
    );
  } catch {
    // Storage can be unavailable in privacy modes; the stored-only query below
    // remains the direct-link fallback.
  }
}

function readDetailListing(id: string): Marker | null {
  try {
    const raw = localStorage.getItem(`${DETAIL_LISTING_STORAGE_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; listing?: unknown };
    if (
      typeof parsed.savedAt !== 'number'
      || Date.now() - parsed.savedAt > DETAIL_LISTING_MAX_AGE_MS
      || !parsed.listing
      || typeof parsed.listing !== 'object'
      || (parsed.listing as { id?: unknown }).id !== id
    ) {
      localStorage.removeItem(`${DETAIL_LISTING_STORAGE_PREFIX}${id}`);
      return null;
    }
    return parsed.listing as Marker;
  } catch {
    localStorage.removeItem(`${DETAIL_LISTING_STORAGE_PREFIX}${id}`);
    return null;
  }
}

type CalendarEventData = {
  name: string;
  description?: string | null;
  startsAt?: string | null;
  venue?: string | null;
  address?: string | null;
  sourceUrl?: string | null;
};

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

type CalendarDateParts = {
  date: string;
  time?: string;
  timestamp: number;
  isDateOnly: boolean;
  isAmsterdamLocal: boolean;
};

function calendarDateParts(value: string): CalendarDateParts | null {
  const pad = (part: number) => String(part).padStart(2, '0');
  const naive = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const hasTime = /T\d{2}:\d{2}/.test(value);
  const parsed = naive && !hasExplicitZone
    ? new Date(Date.UTC(
        Number(naive[1]),
        Number(naive[2]) - 1,
        Number(naive[3]),
        Number(naive[4] ?? 0),
        Number(naive[5] ?? 0),
        Number(naive[6] ?? 0),
      ))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: `${parsed.getUTCFullYear()}${pad(parsed.getUTCMonth() + 1)}${pad(parsed.getUTCDate())}`,
    time: hasTime
      ? `${pad(parsed.getUTCHours())}${pad(parsed.getUTCMinutes())}${pad(parsed.getUTCSeconds())}`
      : undefined,
    timestamp: parsed.getTime(),
    isDateOnly: !hasTime,
    isAmsterdamLocal: Boolean(naive && !hasExplicitZone && hasTime),
  };
}

function downloadCalendarFile(event: CalendarEventData, language: Language): boolean {
  if (!event.startsAt) return false;
  const start = calendarDateParts(event.startsAt);
  if (!start) return false;
  const endParts = calendarDateParts(new Date(
    start.timestamp + (start.isDateOnly ? 24 : 2) * 60 * 60 * 1000,
  ).toISOString());
  const location = event.venue || event.address || '';
  const description = [
    event.description,
    event.sourceUrl ? `${language === 'nl' ? 'Bron' : 'Source'}: ${event.sourceUrl}` : '',
  ].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//buurtplaza.nl//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:buurtplaza-${encodeURIComponent(`${event.name}-${event.startsAt}`)}@buurtplaza.nl`,
    `DTSTAMP:${calendarDateParts(new Date().toISOString())?.date}${calendarDateParts(new Date().toISOString())?.time ?? ''}`,
    start.isDateOnly ? `DTSTART;VALUE=DATE:${start.date}` : (
      start.isAmsterdamLocal
        ? `DTSTART;TZID=Europe/Amsterdam:${start.date}T${start.time}`
        : `DTSTART:${start.date}T${start.time}Z`
    ),
    start.isDateOnly && endParts ? `DTEND;VALUE=DATE:${endParts.date}` : (endParts ? (
      start.isAmsterdamLocal
        ? `DTEND;TZID=Europe/Amsterdam:${endParts.date}T${endParts.time}`
        : `DTEND:${endParts.date}T${endParts.time}Z`
    ) : ''),
    `SUMMARY:${icsEscape(event.name)}`,
    location ? `LOCATION:${icsEscape(location)}` : '',
    description ? `DESCRIPTION:${icsEscape(description)}` : '',
    event.sourceUrl ? `URL:${event.sourceUrl}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([`${lines}\r\n`], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${event.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

function googleCalendarUrl(event: CalendarEventData): string | null {
  if (!event.startsAt) return null;
  const start = calendarDateParts(event.startsAt);
  if (!start) return null;
  const end = calendarDateParts(new Date(
    start.timestamp + (start.isDateOnly ? 24 : 2) * 60 * 60 * 1000,
  ).toISOString());
  if (!end) return null;
  const dates = start.isDateOnly
    ? `${start.date}/${end.date}`
    : `${start.date}T${start.time}${start.isAmsterdamLocal ? '' : 'Z'}/${end.date}T${end.time}${start.isAmsterdamLocal ? '' : 'Z'}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.name,
    dates,
    details: [event.description, event.sourceUrl].filter(Boolean).join('\n\n'),
    location: event.venue || event.address || '',
  });
  if (start.isAmsterdamLocal) params.set('ctz', 'Europe/Amsterdam');
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function EventCalendarActions({
  language,
  event,
}: {
  language: Language;
  event: CalendarEventData;
}) {
  const [message, setMessage] = useState<string | null>(null);
  if (!event.startsAt) return null;
  const googleUrl = googleCalendarUrl(event);
  const labels = language === 'nl'
    ? { title: 'In je agenda zetten', google: 'Google Agenda', file: 'Download .ics', unavailable: 'Agenda-informatie niet beschikbaar' }
    : { title: 'Add to your calendar', google: 'Google Calendar', file: 'Download .ics', unavailable: 'Calendar information unavailable' };
  return (
    <div className="mt-3 rounded-xl border border-primary/15 bg-primary/5 p-3" onClick={(click) => click.stopPropagation()}>
      <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-primary">
        <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {labels.title}
      </p>
      <div className="flex flex-wrap gap-2">
        {googleUrl && (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {labels.google}
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            if (downloadCalendarFile(event, language)) setMessage(labels.file);
          }}
          className="inline-flex items-center rounded-lg border border-primary/25 bg-background px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
        >
          {labels.file}
        </button>
      </div>
      {message && <p className="mt-2 text-[11px] font-semibold text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}

const routeOptions: Array<{
  mode: RouteMode;
  icon: typeof Car;
  nl: string;
  en: string;
}> = [
  { mode: 'driving', icon: Car, nl: 'Auto', en: 'Car' },
  { mode: 'bicycling', icon: Bike, nl: 'Fiets', en: 'Bike' },
  { mode: 'walking', icon: Footprints, nl: 'Lopen', en: 'Walk' },
  { mode: 'transit', icon: TrainFront, nl: 'OV', en: 'Transit' },
];

function RouteLinks({
  language,
  marker,
  className,
}: {
  language: Language;
  marker: Pick<Marker, 'name' | 'lat' | 'lng' | 'isApproximateLocation'>;
  className?: string;
}) {
  if (marker.isApproximateLocation) {
    return (
      <p className={cn('mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-900', className)}>
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {language === 'nl'
          ? 'Route niet beschikbaar: dit kaartpunt is een benadering.'
          : 'Directions unavailable: this map point is approximate.'}
      </p>
    );
  }

  return (
    <div className={cn('mt-3', className)} onClick={(event) => event.stopPropagation()}>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        <Navigation className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {language === 'nl' ? 'Plan je route' : 'Plan your route'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {routeOptions.map(({ mode, icon: Icon, nl, en }) => {
          const href = routeUrl(marker, mode);
          if (!href) return null;
          const label = language === 'nl' ? nl : en;
          return (
            <a
              key={mode}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${language === 'nl' ? 'Route via' : 'Directions by'} ${label}: ${marker.name}`}
              title={label}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function getDistanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latB - latA);
  const longitudeDelta = toRadians(lngB - lngA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STORAGE_KEY = 'buurtgids_saved_places';
const EVENT_ALERTS_STORAGE_KEY = 'buurtgids_saved_event_alerts';
const SAVED_EVENTS_TEST_AUTH_EVENT = 'buurtplaza:saved-events-test-auth';

type SavedEventsTestAuth = {
  userId: string | null;
};

declare global {
  interface Window {
    __setSavedEventsTestAuth?: (auth: SavedEventsTestAuth) => void;
    __savedEventsTestAuth?: SavedEventsTestAuth;
  }
}

type EventAlertField = 'time' | 'venue' | 'price';

type SavedEventAlert = {
  fingerprint: string;
  eventId: string;
  kind: 'changed' | 'cancelled';
  changedFields: EventAlertField[];
  eventName: string;
  sourceName?: string;
  sourceUrl?: string;
  startsAt?: string | null;
  openingTimes?: string | null;
  venue?: string | null;
  priceType?: Marker['priceType'];
  priceText?: string | null;
  detectedAt: string;
};

const EVENT_ALERT_FIELDS: Array<{
  alertField: EventAlertField;
  markerFields: Array<keyof Marker>;
}> = [
  { alertField: 'time', markerFields: ['startsAt', 'openingTimes'] },
  { alertField: 'venue', markerFields: ['venue', 'address'] },
  { alertField: 'price', markerFields: ['priceType', 'priceText'] },
];

function normalizedPlanningValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '');
}

function changedPlanningFields(saved: Marker, current: Marker): EventAlertField[] {
  return EVENT_ALERT_FIELDS
    .filter(({ markerFields }) => markerFields.some((field) =>
      normalizedPlanningValue(saved[field]) !== normalizedPlanningValue(current[field])))
    .map(({ alertField }) => alertField);
}

function eventAlertFingerprint(current: Marker, kind: SavedEventAlert['kind']): string {
  const currentPlanningState = [
    current.startsAt,
    current.openingTimes,
    current.venue,
    current.address,
    current.priceType,
    current.priceText,
    current.isCancelled,
  ].map(normalizedPlanningValue).join('|');
  return `${current.id}:${kind}:${currentPlanningState}`;
}

function isEventMarker(marker: Marker): boolean {
  return marker.source === 'source_scan' || EVENT_CATEGORIES.includes(marker.category);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function markerFromAccountSnapshot(eventId: string, snapshot: Record<string, unknown>): Marker | null {
  if (typeof snapshot.id !== 'string'
    || snapshot.id !== eventId
    || typeof snapshot.name !== 'string'
    || typeof snapshot.category !== 'string'
    || typeof snapshot.locationId !== 'string') {
    return null;
  }
  return snapshot as unknown as Marker;
}

function alertFromAccountSnapshot(value: Record<string, unknown>): SavedEventAlert | null {
  if (typeof value.fingerprint !== 'string'
    || typeof value.eventId !== 'string'
    || (value.kind !== 'changed' && value.kind !== 'cancelled')
    || !Array.isArray(value.changedFields)
    || !value.changedFields.every((field) => field === 'time' || field === 'venue' || field === 'price')
    || typeof value.eventName !== 'string'
    || typeof value.detectedAt !== 'string') {
    return null;
  }
  return value as unknown as SavedEventAlert;
}

type ListingSection = 'events' | 'businesses' | 'food-drink' | 'social-map';
type FilterSubcategory = Exclude<Category, 'Businesses' | 'Social map' | 'Food & Drink'> | BusinessCategory | SocialMapCategory | FoodType;
const TOP_LEVEL_SECTIONS: ListingSection[] = ['events', 'food-drink', 'social-map', 'businesses'];
const DEFAULT_START_SECTION = 'events' satisfies ListingSection;
type AgendaTimeFilter = 'all' | 'today' | 'week';
type AgendaPriceFilter = 'all' | 'free' | 'low-cost';
type DiscoveryReturnState = {
  savedAt: number;
  locationId: string;
  topLevelCategories: Record<ListingSection, boolean>;
  subcategories: Record<FilterSubcategory, boolean>;
  selectedNeighborhoods: string[];
  neighborhoodSelection: 'all' | 'some' | 'none';
  postcodeFilter: string;
  agendaTime: AgendaTimeFilter;
  agendaPrice: AgendaPriceFilter;
  mealOnly: boolean;
  quickFilters: DiscoveryQuickFilter[];
};

const DISCOVERY_RETURN_STATE_KEY = 'buurtplaza-discovery-return-state';
const DISCOVERY_RETURN_STATE_TTL_MS = 24 * 60 * 60 * 1000;

function readDiscoveryReturnState(locationId: string): DiscoveryReturnState | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(DISCOVERY_RETURN_STATE_KEY) ?? 'null') as Partial<DiscoveryReturnState> | null;
    if (!value
      || value.locationId !== locationId
      || typeof value.savedAt !== 'number'
      || Date.now() - value.savedAt > DISCOVERY_RETURN_STATE_TTL_MS
      || !value.topLevelCategories
      || !value.subcategories
      || !Array.isArray(value.selectedNeighborhoods)
      || !Array.isArray(value.quickFilters)) {
      return null;
    }
    return value as DiscoveryReturnState;
  } catch {
    return null;
  }
}

const eventActivityLabels: Record<EventActivityKind, { nl: string; en: string }> = {
  community: { nl: 'Samen in de buurt', en: 'Community' },
  culture: { nl: 'Cultuur', en: 'Culture' },
  learning: { nl: 'Leren & oefenen', en: 'Learning' },
  movement: { nl: 'Bewegen', en: 'Movement' },
  meal: { nl: 'Maaltijd', en: 'Meal' },
  family: { nl: 'Gezin', en: 'Family' },
  market: { nl: 'Markt', en: 'Market' },
  outdoor: { nl: 'Buiten', en: 'Outdoors' },
  entertainment: { nl: 'Uitgaan', en: 'Entertainment' },
};

function eventBadgeLabel(
  marker: Marker,
  language: Language,
): Array<{ key: string; label: string; className: string }> {
  const badges: Array<{ key: string; label: string; className: string }> = [];
  if (marker.activityKind) {
    badges.push({
      key: 'kind',
      label: eventActivityLabels[marker.activityKind][language],
      className: 'bg-sky-600/10 text-sky-800',
    });
  }
  if (marker.priceType === 'free') {
    badges.push({ key: 'free', label: language === 'nl' ? 'Gratis' : 'Free', className: 'bg-emerald-600/10 text-emerald-800' });
  } else if (marker.priceType === 'low-cost') {
    badges.push({ key: 'low-cost', label: language === 'nl' ? 'Laag tarief' : 'Low cost', className: 'bg-amber-500/10 text-amber-900' });
  }
  if (marker.mealType) {
    badges.push({
      key: 'meal',
      label: marker.mealType === 'food-support'
        ? (language === 'nl' ? 'Voedselhulp' : 'Food support')
        : (language === 'nl' ? 'Maaltijd' : 'Meal'),
      className: 'bg-orange-600/10 text-orange-800',
    });
  }
  return badges.slice(0, 3);
}

function topLevelStateFor(section: ListingSection): Record<ListingSection, boolean> {
  return Object.fromEntries(
    TOP_LEVEL_SECTIONS.map((candidate) => [candidate, candidate === section]),
  ) as Record<ListingSection, boolean>;
}

function allTopLevelState(): Record<ListingSection, boolean> {
  return Object.fromEntries(
    TOP_LEVEL_SECTIONS.map((section) => [section, true]),
  ) as Record<ListingSection, boolean>;
}

function noTopLevelState(): Record<ListingSection, boolean> {
  return Object.fromEntries(
    TOP_LEVEL_SECTIONS.map((section) => [section, false]),
  ) as Record<ListingSection, boolean>;
}

function subcategoryStateFor(section: ListingSection): Record<FilterSubcategory, boolean> {
  const active = subcategoriesForTopLevel(section);
  const eventSubcategories = EVENT_CATEGORIES.filter(
    (category): category is Exclude<Category, 'Businesses' | 'Social map' | 'Food & Drink'> =>
      category !== 'Businesses' && category !== 'Social map' && category !== 'Food & Drink',
  );
  return Object.fromEntries(
    [...eventSubcategories, ...BUSINESS_CATEGORIES, ...SOCIAL_MAP_CATEGORIES, ...FOOD_TYPES].map((category) => [
      category,
      active.includes(category),
    ]),
  ) as Record<FilterSubcategory, boolean>;
}

function allSubcategoryState(): Record<FilterSubcategory, boolean> {
  return Object.fromEntries(
    Array.from(new Set(TOP_LEVEL_SECTIONS.flatMap(subcategoriesForTopLevel)))
      .map((subcategory) => [subcategory, true]),
  ) as Record<FilterSubcategory, boolean>;
}

function noSubcategoryState(): Record<FilterSubcategory, boolean> {
  return Object.fromEntries(
    Array.from(new Set(TOP_LEVEL_SECTIONS.flatMap(subcategoriesForTopLevel)))
      .map((subcategory) => [subcategory, false]),
  ) as Record<FilterSubcategory, boolean>;
}

function subcategoriesForTopLevel(section: ListingSection): FilterSubcategory[] {
  if (section === 'events') {
    return EVENT_CATEGORIES.filter(
      (category): category is Exclude<Category, 'Businesses' | 'Social map' | 'Food & Drink'> =>
        category !== 'Businesses' && category !== 'Social map' && category !== 'Food & Drink',
    );
  }
  if (section === 'businesses') {
    return BUSINESS_CATEGORIES.filter((subcategory) => subcategory !== 'Food & Drink');
  }
  if (section === 'social-map') return SOCIAL_MAP_CATEGORIES;
  return FOOD_TYPES;
}

function topLevelForMarker(marker: Marker): ListingSection {
  if (marker.category === 'Businesses') return 'businesses';
  if (marker.category === 'Food & Drink') return 'food-drink';
  if (marker.category === 'Social map') return 'social-map';
  return 'events';
}

function subcategoryLabelFor(subcategory: FilterSubcategory, language: Language): string {
  if (FOOD_TYPES.includes(subcategory as FoodType)) {
    const labels: Record<FoodType, { nl: string, en: string }> = {
      restaurant: { nl: 'Restaurant', en: 'Restaurant' },
      cafe: { nl: 'Café', en: 'Cafe' },
      bar: { nl: 'Bar', en: 'Bar' },
      bakery: { nl: 'Bakker', en: 'Bakery' },
      takeaway: { nl: 'Afhalen & Bezorgen', en: 'Takeaway' },
      other: { nl: 'Overig', en: 'Other' },
    };
    return labels[subcategory as FoodType][language];
  }
  if (EVENT_CATEGORIES.includes(subcategory as Category)) {
    return translations[language].categories[subcategory as Category];
  }
  if (SOCIAL_MAP_CATEGORIES.includes(subcategory as SocialMapCategory)) {
    return getSocialMapCategoryName(subcategory as SocialMapCategory, language);
  }
  return getBusinessCategoryName(subcategory as BusinessCategory, language);
}

function socialMapReviewLabel(status: SocialMapReviewStatus, language: Language): string {
  const labels: Record<SocialMapReviewStatus, { nl: string; en: string }> = {
    verified: { nl: 'Bron gecontroleerd', en: 'Source checked' },
    review_due: { nl: 'Broncontrole gepland', en: 'Source review due' },
    changed: { nl: 'Wijziging ter controle', en: 'Change needs review' },
    unavailable: { nl: 'Bron tijdelijk onbereikbaar', en: 'Source temporarily unavailable' },
  };
  return labels[status][language];
}
function LanguageSelector({
  language,
  onLanguageChange,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  const t = translations[language];

  return (
    <label className="absolute right-20 top-3 z-40 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur-md lg:right-7 lg:top-7">
      <Globe2 className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="sr-only">{t.languageLabel}</span>
      <select
        value={language}
        onChange={(event) => onLanguageChange(event.target.value as Language)}
        aria-label={t.languageLabel}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserRoleSelector({
  userRole,
  onUserRoleChange,
}: {
  userRole: UserRole;
  onUserRoleChange: (userRole: UserRole) => void;
}) {
  return (
    <label
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 text-[11px] font-extrabold text-foreground shadow-sm backdrop-blur-md"
      title={userRole === 'designer' ? 'Editor view' : 'Consumer view'}
    >
      <span>{userRole === 'designer' ? 'Editor' : 'Consumer'}</span>
      <select
        value={userRole}
        onChange={(event) => onUserRoleChange(event.target.value as UserRole)}
        aria-label="Preview mode"
        className="cursor-pointer appearance-none bg-transparent text-[11px] font-extrabold lowercase outline-none"
      >
        <option value="designer">Editor</option>
        <option value="user">Consumer</option>
      </select>
    </label>
  );
}

const weatherConditionLabels: Record<string, { nl: string; en: string }> = {
  clear: { nl: 'Helder', en: 'Clear' },
  partly_cloudy: { nl: 'Licht bewolkt', en: 'Partly cloudy' },
  cloudy: { nl: 'Bewolkt', en: 'Cloudy' },
  fog: { nl: 'Mistig', en: 'Foggy' },
  drizzle: { nl: 'Motregen', en: 'Drizzle' },
  rain: { nl: 'Regen', en: 'Rain' },
  snow: { nl: 'Sneeuw', en: 'Snow' },
  showers: { nl: 'Buien', en: 'Showers' },
  thunderstorm: { nl: 'Onweer', en: 'Thunderstorm' },
  unknown: { nl: 'Wisselend', en: 'Mixed' },
};

function WeatherIcon({ condition, isDay, className }: { condition: string; isDay?: boolean; className?: string }) {
  const Icon = condition === 'clear'
    ? (isDay === false ? Cloud : Sun)
    : condition === 'partly_cloudy'
      ? CloudSun
      : condition === 'cloudy'
        ? Cloud
        : condition === 'fog'
          ? CloudFog
          : condition === 'snow'
            ? CloudSnow
            : condition === 'rain' || condition === 'showers' || condition === 'drizzle'
              ? CloudRain
              : condition === 'thunderstorm'
                ? CloudRain
                : CloudSun;
  return <Icon className={className} aria-hidden="true" />;
}

function WeatherCard({ cityId, language }: { cityId: string; language: Language }) {
  const weatherQuery = useGetWeather(
    { cityId },
    {
      query: {
        staleTime: 10 * 60 * 1000,
        retry: 1,
        queryKey: getGetWeatherQueryKey({ cityId }),
      },
      request: {
        cache: 'no-store',
      },
    },
  );
  const data = weatherQuery.data;
  const currentLabel = data
    ? (weatherConditionLabels[data.current.condition]?.[language] ?? weatherConditionLabels.unknown[language])
    : '';
  const updatedLabel = data
    ? new Intl.DateTimeFormat(language === 'nl' ? 'nl-NL' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(data.fetchedAt))
    : '';
  const weatherLocation = LOCATIONS.find((location) => location.id === cityId);
  const localizedLocationName = weatherLocation
    ? getLocationName(weatherLocation, language)
    : (data?.locationName ?? cityId);

  if (weatherQuery.isLoading) {
    return (
      <div className="w-full animate-pulse border-t border-white/40 bg-gradient-to-r from-secondary/85 via-teal-600/75 to-cyan-400/65 px-4 py-3 backdrop-blur-md" aria-label={language === 'nl' ? 'Weer laden' : 'Loading weather'}>
        <div className="mx-auto h-4 max-w-6xl rounded bg-white/15" />
      </div>
    );
  }

  if (weatherQuery.isError || !data) {
    return (
      <div className="w-full border-t border-white/40 bg-gradient-to-r from-secondary/85 via-teal-600/75 to-cyan-400/65 px-4 py-2 text-xs font-bold text-white backdrop-blur-md">
        {localizedLocationName} · {language === 'nl' ? 'Weer tijdelijk niet beschikbaar' : 'Weather temporarily unavailable'}
      </div>
    );
  }

  return (
    <section
      data-testid="weather-card"
      aria-label={language === 'nl' ? `Weer in ${localizedLocationName}` : `Weather in ${localizedLocationName}`}
      className="w-full border-t border-white/40 bg-gradient-to-r from-secondary/85 via-teal-600/75 to-cyan-400/65 text-white shadow-lg backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <WeatherIcon condition={data.current.condition} isDay={data.current.isDay} className="h-6 w-6 shrink-0 text-sky-200" />
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-sky-100/75">{localizedLocationName}</p>
            <p className="truncate text-xs font-bold text-white">
              {currentLabel} · {Math.round(data.current.temperature)}° · {language === 'nl' ? 'voelt als' : 'feels like'} {Math.round(data.current.apparentTemperature)}°
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[10px] font-bold text-sky-50 sm:gap-4 sm:text-[11px]">
          <span className="inline-flex items-center gap-1" title={language === 'nl' ? 'Kans op neerslag' : 'Chance of precipitation'}>
            <Droplets className="h-3.5 w-3.5 text-sky-200" aria-hidden="true" />
            {data.forecast[0]?.precipitationProbability ?? 0}%
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex" title={language === 'nl' ? 'Wind' : 'Wind'}>
            <Wind className="h-3.5 w-3.5 text-sky-200" aria-hidden="true" />
            {Math.round(data.current.windSpeed)} km/u
          </span>
          <span className="hidden text-sky-100/70 md:inline">
            {language === 'nl' ? `Bijgewerkt ${updatedLabel}` : `Updated ${updatedLabel}`}
          </span>
        </div>
      </div>
    </section>
  );
}

function ReferenceCategoryNav({
  language,
  userRole,
  onUserRoleChange,
  onThingsToDo,
  onSectionSelect,
  embedded = false,
}: {
  language: Language;
  userRole: UserRole;
  onUserRoleChange: (userRole: UserRole) => void;
  onThingsToDo: () => void;
  onSectionSelect: (section: ListingSection) => void;
  embedded?: boolean;
}) {
  const t = translations[language];
  const [location] = useLocation();
  const search = useSearch();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const accountHref = withReturnPath('/account', `${location}${search ? `?${search}` : ''}`);
  const iconForCategory = (id: string) => {
    if (id === 'things-to-do') return CalendarDays;
    if (id === 'locals') return UsersRound;
    if (id === 'shopping') return ShoppingBag;
    if (id === 'food-drink') return Utensils;
    if (id === 'social-map') return HandHeart;
    return Newspaper;
  };
  const tooltipClass = 'pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-bold text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

  return (
    <nav
      aria-label={language === 'nl' ? 'Hoofdnavigatie' : 'Primary navigation'}
      className={cn(
        "z-30 w-full border-b border-border/70 bg-card/95 px-4 py-2.5 backdrop-blur-md sm:px-6",
        embedded ? "relative shrink-0" : "absolute left-0 top-0",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link href="/" className="shrink-0 text-xs font-black uppercase tracking-[0.16em] text-primary">
          MarqtPlaza
        </Link>
        <button
          ref={menuTriggerRef}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation-links"
          aria-label={menuOpen
            ? (language === 'nl' ? 'Menu sluiten' : 'Close menu')
            : (language === 'nl' ? 'Menu openen' : 'Open menu')}
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false);
              menuTriggerRef.current?.focus();
            }
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      <div
        id="primary-navigation-links"
        className={cn(
          "mx-auto mt-2 max-w-6xl flex-col items-stretch gap-1 rounded-2xl border border-border/70 bg-card p-2 shadow-lg lg:mt-0 lg:flex lg:flex-row lg:items-center lg:justify-center lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
          menuOpen ? "flex" : "hidden",
        )}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setMenuOpen(false);
            menuTriggerRef.current?.focus();
          }
        }}
      >
        {t.navCategories.map((category) => {
          const Icon = iconForCategory(category.id);
          if (category.id === 'news') {
            return (
              <span key={category.id} className="group relative">
                <Link
                  href="/nieuws"
                  aria-label={category.label}
                  title={category.label}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{category.label}</span>
                </Link>
                <span className={tooltipClass}>{category.label}</span>
              </span>
            );
          }
          return (
            <span key={category.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  if (category.id === 'things-to-do') onThingsToDo();
                  if (category.id === 'locals' || category.id === 'shopping') onSectionSelect('businesses');
                  if (category.id === 'food-drink') onSectionSelect('food-drink');
                  if (category.id === 'social-map') onSectionSelect('social-map');
                }}
                aria-label={category.label}
                aria-haspopup={category.id === 'things-to-do' ? 'dialog' : undefined}
                title={category.label}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{category.label}</span>
              </button>
              <span className={tooltipClass}>{category.label}</span>
            </span>
          );
        })}
        {[
          { href: '/capture', label: t.capture, Icon: ScanSearch },
          { href: '/bronnen', label: language === 'nl' ? 'Bronnen' : 'Sources', Icon: Radio },
          { href: '/buurt', label: language === 'nl' ? 'Buurtplein' : 'Community', Icon: HandHeart },
          { href: '/deals', label: language === 'nl' ? 'Deals' : 'Deals', Icon: Tag },
          { href: '/mijn-bedrijf', label: language === 'nl' ? 'Mijn bedrijf' : 'My business', Icon: Store },
          { href: '/bedrijf-aanmelden', label: language === 'nl' ? 'Bedrijf aanmelden' : 'List a business', Icon: Building2 },
          { href: accountHref, label: language === 'nl' ? 'Mijn account' : 'My account', Icon: UserRound },
        ].filter(({ href }) => userRole === 'designer' || !['/capture', '/bronnen'].includes(href))
          .map(({ href, label, Icon }) => (
          <span key={href} className="group relative">
            <Link
              href={href}
              aria-label={label}
              title={label}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
            <span className={tooltipClass}>{label}</span>
          </span>
        ))}
        <UserRoleSelector userRole={userRole} onUserRoleChange={onUserRoleChange} />
      </div>
    </nav>
  );
}

function SaveButton({ saved, onToggle }: { saved: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(e); }}
      aria-label={saved ? 'Remove from saved' : 'Save this place'}
      className={cn(
        "p-1.5 rounded-lg transition-all duration-200 shrink-0",
        saved
          ? "text-primary bg-primary/10 hover:bg-primary/20"
          : "text-muted-foreground hover:text-primary hover:bg-primary/5"
      )}
    >
      {saved
        ? <BookmarkCheck className="w-4 h-4" />
        : <Bookmark className="w-4 h-4" />
      }
    </button>
  );
}

const DISCOVERY_EXTERNAL_SOURCES_STORAGE_KEY = 'buurtplaza-discovery-live-mode';

function readIncludeExternalSources(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = window.sessionStorage.getItem(DISCOVERY_EXTERNAL_SOURCES_STORAGE_KEY);
  return saved === 'true';
}

function SearchState({
  language,
  userRole,
  onUserRoleChange,
  onLanguageChange,
  onSearch,
  savedCount,
  onViewSaved,
}: {
  language: Language;
  userRole: UserRole;
  onUserRoleChange: (userRole: UserRole) => void;
  onLanguageChange: (language: Language) => void;
  onSearch: (locId: string, neighborhood?: string, section?: ListingSection, postcode?: string) => void;
  savedCount: number;
  onViewSaved: () => void;
}) {
  const majorDutchCities = [
    'Amsterdam',
    'Rotterdam',
    'Den Haag',
    'Utrecht',
    'Eindhoven',
    'Groningen',
    'Tilburg',
    'Almere',
    'Breda',
    'Nijmegen',
    'Apeldoorn',
    'Haarlem',
    'Arnhem',
    'Enschede',
    'Amersfoort',
  ];
  const popularNeighborhoods: Record<string, string[]> = {};
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedMapNeighborhood, setSelectedMapNeighborhood] = useState<string | null>(null);
  const [hoveredMapNeighborhood, setHoveredMapNeighborhood] = useState<string | null>(null);
  const [includeExternalSources, setIncludeExternalSources] = useState(readIncludeExternalSources);
  const t = translations[language];
  const mapLocation = LOCATIONS.find((location) => location.id === selectedCityId) ?? LOCATIONS[0];

  useEffect(() => {
    if (!mapLocation.neighborhoods.includes(selectedMapNeighborhood ?? '')) {
      setSelectedMapNeighborhood(null);
    }
    if (!mapLocation.neighborhoods.includes(hoveredMapNeighborhood ?? '')) {
      setHoveredMapNeighborhood(null);
    }
  }, [hoveredMapNeighborhood, mapLocation, selectedMapNeighborhood]);

  useEffect(() => {
    if (!mapLocation.neighborhoods.includes(selectedMapNeighborhood ?? '')) {
      setSelectedMapNeighborhood(null);
    }
    if (!mapLocation.neighborhoods.includes(hoveredMapNeighborhood ?? '')) {
      setHoveredMapNeighborhood(null);
    }
  }, [hoveredMapNeighborhood, mapLocation, selectedMapNeighborhood]);

  useEffect(() => {
    window.sessionStorage.setItem(
      DISCOVERY_EXTERNAL_SOURCES_STORAGE_KEY,
      String(includeExternalSources),
    );
  }, [includeExternalSources]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError(t.emptySearch);
      return;
    }
    const normalizedQuery = query.trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');
    const normalizedPostcode = query.trim().toLocaleUpperCase('nl-NL').replace(/\s+/g, '');
    const isPostcodeQuery = /^\d{4}(?:[A-Z]{2})?$/.test(normalizedPostcode);
    const matchedNeighborhood = mapLocation.neighborhoods.find(
      neighborhood => neighborhood.toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ') === normalizedQuery,
    );
    const matched = LOCATIONS.find(l =>
      l.name.toLocaleLowerCase('nl-NL') === normalizedQuery ||
      l.nameNl.toLocaleLowerCase('nl-NL') === normalizedQuery ||
      (isPostcodeQuery && l.postcodes.includes(normalizedPostcode.slice(0, 4)))
    );

    if (matchedNeighborhood) {
      setError('');
      onSearch(mapLocation.id, matchedNeighborhood, 'events');
    } else if (matched) {
      setError('');
      onSearch(matched.id, undefined, 'events', isPostcodeQuery ? normalizedPostcode : undefined);
    } else {
      setError(t.locationNotFound);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center overflow-x-hidden bg-background px-4 pb-10 pt-28 sm:px-6 lg:justify-center">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-bold text-primary focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        {language === 'nl' ? 'Naar hoofdinhoud' : 'Skip to main content'}
      </a>
      <ReferenceCategoryNav
        language={language}
        userRole={userRole}
        onUserRoleChange={onUserRoleChange}
        onSectionSelect={(section) => onSearch('dhg', undefined, section)}
        onThingsToDo={() => onSearch('dhg', undefined, 'events')}
      />
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />

      {/* Decorative background */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/60 via-background to-background" />
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyIiBjeT0iMiIgcj0iMSIgZmlsbD0iIzAwMDAwMCIgZmlsbC1vcGFjaXR5PSIwLjAzIi8+PC9zdmc+')] mix-blend-multiply pointer-events-none" />
      
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Saved places shortcut */}
      {savedCount > 0 && (
        <button
          onClick={onViewSaved}
          className="absolute bottom-8 right-6 z-10 flex items-center gap-2 px-4 py-2.5 bg-card/90 backdrop-blur-sm border border-border/60 rounded-full text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary shadow-md hover:shadow-lg transition-all sm:bottom-auto sm:top-16 sm:right-7"
        >
          <BookmarkCheck className="w-4 h-4 text-primary" />
          <span>{t.savedCount(savedCount)}</span>
        </button>
      )}

      <main id="main-content" className="z-10 w-full max-w-7xl space-y-6 text-center animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
        <div className="space-y-2">
          <img
            src="/marqtplaza-logo.png"
            alt="marqtplaza.com — The Digital Village Square"
            className="mx-auto h-[78px] w-auto md:h-[96px]"
          />
          <h1 className="mx-auto max-w-3xl text-3xl font-black tracking-tight text-foreground sm:text-5xl">
            {language === 'nl'
              ? 'Ontdek wat er lokaal gebeurt, waar je ook bent'
              : 'Discover what is happening locally, wherever you are'}
          </h1>
          <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-muted-foreground md:text-lg">
            {language === 'nl'
              ? 'Vind activiteiten, bedrijven, eten en buurthulp vanuit één rustige, privacyvriendelijke plek.'
              : 'Find activities, businesses, food, and community support from one calm, privacy-friendly place.'}
          </p>
          <p className="mx-auto inline-flex rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-extrabold text-foreground">
            {language === 'nl'
              ? 'Nu beschikbaar voor heel Den Haag'
              : 'Currently available across The Hague'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative group w-full max-w-lg mx-auto">
          <div className={cn(
            "absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500",
            error && "from-destructive to-destructive opacity-40 group-focus-within:opacity-50"
          )} />
          <div className={cn(
            "relative flex bg-card rounded-2xl shadow-xl overflow-hidden border-2 transition-all duration-300",
            error ? "border-destructive/50" : "border-transparent focus-within:border-primary/50"
          )}>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(''); }}
              placeholder={t.placeholder}
              className="flex-1 px-6 py-5 text-lg bg-transparent border-none focus:ring-0 outline-none placeholder:text-muted-foreground/50 text-foreground font-medium"
            />
            <button
              type="submit"
              className="px-6 md:px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg transition-colors flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              <span className="hidden md:inline">{t.explore}</span>
            </button>
          </div>
          {error && (
             <p className="absolute -bottom-8 left-0 right-0 text-center text-destructive text-sm font-semibold animate-in slide-in-from-top-1">
               {error}
             </p>
          )}
        </form>

        <div className="w-full pt-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)] lg:items-start">
            <section className="flex min-h-[18rem] flex-col justify-between rounded-3xl border border-border/70 bg-card/90 p-6 text-left shadow-xl backdrop-blur-sm sm:p-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                  {language === 'nl' ? 'Jij houdt de regie' : 'You stay in control'}
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">
                  {language === 'nl' ? 'Begin met de lijst. Kies zelf of je meer deelt.' : 'Start with the list. Choose if you want to share more.'}
                </h2>
                <p className="mt-3 text-sm font-medium leading-relaxed text-muted-foreground">
                  {language === 'nl'
                    ? 'We laden geen kaart, vragen geen locatie en zoeken niet op het web voordat jij daar bewust voor kiest.'
                    : 'We do not load a map, request your location, or search the web until you explicitly choose to.'}
                </p>
              </div>
              <details className="mt-6 rounded-2xl border border-border/70 bg-muted/30 p-4">
                <summary className="cursor-pointer font-extrabold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {language === 'nl' ? 'Hoe lokaal en web zoeken verschillen' : 'How local and web search differ'}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {language === 'nl'
                    ? 'Lokaal zoeken gebruikt de bestaande catalogus. Aanvullende webresultaten delen alleen je gekozen zoekgebied met externe aanbieders en zijn geen verificatie door MarqtPlaza.'
                    : 'Local search uses the established catalogue. Additional web results share only your chosen search area with external providers and are not verified by MarqtPlaza.'}
                </p>
              </details>
            </section>

            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t.popularDestinations}</p>
              <div className="flex flex-wrap justify-center gap-2.5">
                {LOCATIONS.map(loc => {
                  const neighborhoodOptions = selectedCityId === loc.id
                    ? loc.neighborhoods
                    : (popularNeighborhoods[loc.id] ?? loc.neighborhoods.slice(0, 8));

                  return (
                  <div
                    key={loc.id}
                    className={cn(
                      "flex w-full max-w-5xl flex-col items-center gap-2 rounded-2xl p-1.5 transition-colors",
                      selectedCityId === loc.id && "bg-primary/5 p-3 ring-1 ring-primary/20",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={selectedCityId === loc.id}
                      onClick={() => {
                        setSelectedCityId(loc.id);
                        setSelectedMapNeighborhood(null);
                        setHoveredMapNeighborhood(null);
                      }}
                      className={cn(
                        "px-4 py-2 backdrop-blur-sm border rounded-full text-sm font-semibold transition-all shadow-sm hover:shadow-md",
                        selectedCityId === loc.id
                          ? "bg-foreground text-background border-foreground"
                          : "bg-card/80 border-border/60 text-foreground hover:border-primary/50 hover:text-primary",
                      )}
                    >
                      {getLocationName(loc, language)}
                    </button>
                    <div className="w-full text-left">
                      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        {selectedCityId === loc.id
                          ? t.chooseNeighborhood(getLocationName(loc, language))
                          : t.popularNeighborhoods}
                      </p>
                      <div className="mb-3 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSearch(loc.id, undefined, DEFAULT_START_SECTION)}
                          className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-extrabold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {t.selectAllNeighborhoods}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCityId(null)}
                          className="rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-[11px] font-extrabold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {t.clearNeighborhoodSelection}
                        </button>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
                        {neighborhoodOptions.map((neighborhood) => (
                          <button
                            key={neighborhood}
                            type="button"
                            onClick={() => onSearch(loc.id, neighborhood, DEFAULT_START_SECTION)}
                            onMouseEnter={() => selectedCityId === loc.id && setHoveredMapNeighborhood(neighborhood)}
                            onMouseLeave={() => setHoveredMapNeighborhood(null)}
                            onFocus={() => selectedCityId === loc.id && setHoveredMapNeighborhood(neighborhood)}
                            onBlur={() => setHoveredMapNeighborhood(null)}
                            className="min-h-10 rounded-xl border border-border/50 bg-card/80 px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {neighborhood}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NeighborhoodActionButtons({
  language,
  onSelectAll,
  onDeselectAll,
}: {
  language: Language;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const t = translations[language];

  return (
    <div className="grid grid-cols-2 gap-1">
      <button
        type="button"
        onClick={onSelectAll}
        className="min-h-8 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1.5 text-[10px] font-extrabold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t.selectAllNeighborhoods}
      </button>
      <button
        type="button"
        onClick={onDeselectAll}
        className="min-h-8 rounded-lg border border-border/70 bg-card/70 px-2 py-1.5 text-[10px] font-extrabold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t.clearNeighborhoodSelection}
      </button>
    </div>
  );
}

function CategoryActionButtons({
  language,
  onSelectAll,
  onDeselectAll,
  selectLabel,
  deselectLabel,
}: {
  language: Language;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  selectLabel?: string;
  deselectLabel?: string;
}) {
  const t = translations[language];

  return (
    <div className="grid grid-cols-2 gap-1">
      <button
        type="button"
        onClick={onSelectAll}
        className="min-h-8 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1.5 text-[10px] font-extrabold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {selectLabel ?? t.selectAllCategories}
      </button>
      <button
        type="button"
        onClick={onDeselectAll}
        className="min-h-8 rounded-lg border border-border/70 bg-card/70 px-2 py-1.5 text-[10px] font-extrabold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {deselectLabel ?? t.clearCategorySelection}
      </button>
    </div>
  );
}

function FilterFrame({
  title,
  children,
  defaultOpen = true,
  status,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  status?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/70">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex min-h-9 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {status}
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
        </span>
      </button>
      {isOpen && <div className="border-t border-border/60 p-2">{children}</div>}
    </section>
  );
}

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  Museums: Landmark,
  Tours: RouteIcon,
  Family: Baby,
  Entertainment: Gamepad2,
  Outdoors: Waves,
  Markets: ShoppingBag,
  Businesses: Building2,
  'Food & Drink': Coffee,
  'Social map': HandHeart,
};
const DETAIL_ICONS: Record<Category, React.ElementType> = {
  Museums: Clock,
  Tours: MapPinned,
  Family: Clock,
  Entertainment: Clock,
  Outdoors: MapPinned,
  Markets: Clock,
  Businesses: MapPinned,
  'Food & Drink': Clock,
  'Social map': MapPinned,
};

function MapPin({
  language,
  marker,
  isSelected,
  isSaved,
  onClick,
  onSave,
}: {
  language: Language;
  marker: Marker;
  isSelected: boolean;
  isSaved: boolean;
  onClick: () => void;
  onSave: (e: React.MouseEvent) => void;
}) {
  const Icon = CATEGORY_ICONS[marker.category];
  const t = translations[language];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "absolute transform -translate-x-1/2 -translate-y-1/2 z-10 group outline-none rounded-full",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        isSelected ? "scale-[1.35] z-30" : "scale-100 hover:scale-[1.15] hover:z-20"
      )}
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      aria-label={t.selectMarker(marker.name)}
    >
      <div className={cn(
        "relative flex items-center justify-center w-[3.4375rem] h-[3.4375rem] rounded-full shadow-lg backdrop-blur-md border-2 transition-colors duration-300",
        isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card/95 text-foreground border-border group-hover:border-primary/50 group-focus-visible:ring-4 group-focus-visible:ring-primary/30",
      )}>
         <Icon className="w-6 h-6" />
        {isSaved && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center border-2 border-background">
            <BookmarkCheck className="w-2.5 h-2.5 text-primary-foreground" />
          </span>
        )}
        {isSelected && (
          <span className="absolute flex h-full w-full rounded-full">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
          </span>
        )}
      </div>
      <div className={cn(
        "absolute top-full mt-3 left-1/2 -translate-x-1/2 rounded-xl bg-card shadow-xl border border-border whitespace-nowrap pointer-events-none transition-all duration-300 ease-out",
        isSelected ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
      )}>
        <div className="px-3.5 py-2">
          <p className="text-sm font-bold text-foreground">{marker.name}</p>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5">{t.categories[marker.category]}</p>
        </div>
        {isSelected && (
          <div className="border-t border-border px-3 py-1.5 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <button
              onClick={onSave}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 text-xs font-bold py-1 rounded-md transition-colors",
                isSaved
                  ? "text-primary hover:text-destructive"
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              {isSaved
                ? <><BookmarkCheck className="w-3.5 h-3.5" /> {t.saved}</>
                : <><Bookmark className="w-3.5 h-3.5" /> {t.savePlace}</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MarkerCard({
  language,
  marker,
  isSelected,
  isSaved,
  showAdminEvidence,
  onClick,
  onSave,
}: {
  language: Language;
  marker: Marker;
  isSelected: boolean;
  isSaved: boolean;
  showAdminEvidence: boolean;
  onClick: () => void;
  onSave: (e: React.MouseEvent) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[marker.category];
  const DetailIcon = DETAIL_ICONS[marker.category];
  const copy = getMarkerCopy(marker, language);
  const t = translations[language];
  const sourceLabel = marker.sourceName
    ?? (marker.source ? getListingSourceName(marker.source, language) : undefined);
  const isEvent = topLevelForMarker(marker) === 'events';
  const websiteUrl = marker.officialUrl ?? marker.sourcePageUrl ?? marker.sourceUrl;
  const hasWebLinks = Boolean(websiteUrl || marker.facebookUrl || marker.instagramUrl);
  const timing = isEvent ? formatEventTiming(marker.startsAt, language) : null;
  const evidence = marker.evidence ?? [];
  const evidenceStatusLabel = {
    current: language === 'nl' ? 'Actueel gecontroleerd' : 'Currently checked',
    stale: language === 'nl' ? 'Controle verlopen' : 'Check overdue',
    conflicting: language === 'nl' ? 'Bronnen spreken elkaar tegen' : 'Sources conflict',
    unknown: language === 'nl' ? 'Onbekend' : 'Unknown',
    unavailable: language === 'nl' ? 'Bron niet beschikbaar' : 'Source unavailable',
  } as const;
  const evidenceFieldLabel = {
    name: language === 'nl' ? 'Naam' : 'Name',
    description: language === 'nl' ? 'Beschrijving' : 'Description',
    address: language === 'nl' ? 'Adres' : 'Address',
    event_date: language === 'nl' ? 'Evenementdatum' : 'Event date',
    opening_times: language === 'nl' ? 'Openingstijden' : 'Opening times',
    price: language === 'nl' ? 'Prijs' : 'Price',
  } as const;
  const eventPrice = marker.priceText?.trim()
    || (marker.priceType === 'free'
      ? (language === 'nl' ? 'Gratis' : 'Free')
      : marker.priceType === 'low-cost'
        ? (language === 'nl' ? 'Laag tarief' : 'Low cost')
        : marker.priceType === 'paid'
          ? (language === 'nl' ? 'Betaald' : 'Paid')
          : (language === 'nl' ? 'Prijs onbekend' : 'Price unknown'));

  useEffect(() => {
    if (isSelected) setIsExpanded(true);
  }, [isSelected]);

  const toggleExpanded = () => {
    onClick();
    setIsExpanded((current) => !current);
  };

  return (
    <div
      className={cn(
        "w-full text-left p-4 rounded-2xl border transition-all duration-300 relative group",
        isSelected
          ? "bg-primary/5 border-primary shadow-[0_4px_20px_-4px_rgba(243,108,33,0.15)]"
          : "bg-card border-border hover:border-primary/40 hover:shadow-md"
      )}
    >
      {isSelected && (
        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary rounded-l-2xl" />
      )}
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={`marker-details-${marker.id}`}
          className="flex min-w-0 flex-1 items-start gap-4 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className={cn(
            "p-3 rounded-xl shrink-0 transition-colors",
            isSelected ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
          )}>
            <Icon className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1 py-0.5">
            <span className="mb-1 flex items-start justify-between gap-2">
              <span
                data-testid={`listing-title-${marker.id}`}
                className={cn(
                  "min-w-0 flex-1 line-clamp-2 text-sm font-bold leading-snug transition-colors sm:text-base",
                  isSelected ? "text-primary" : "text-foreground group-hover:text-primary",
                )}
              >
                {marker.name}
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                aria-hidden="true"
              />
            </span>
          </span>
        </button>
        <SaveButton saved={isSaved} onToggle={onSave} />
      </div>
      <div className="ml-16 min-w-0 py-0.5">
          {isEvent && (
            <div className="mb-3">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                {timing && (
                  <span data-testid={`event-timing-${marker.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-primary">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {timing}
                  </span>
                )}
                <span data-testid={`event-price-${marker.id}`} className="rounded-md bg-emerald-700/10 px-2 py-1 text-emerald-800">
                  {language === 'nl' ? 'Prijs' : 'Price'}: {eventPrice}
                </span>
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {language === 'nl' ? 'Bekijk evenement' : 'View event'}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
          <p
            data-testid={`listing-summary-${marker.id}`}
            className={cn(
              "mb-3 text-sm leading-relaxed text-muted-foreground",
              !isExpanded && "line-clamp-2",
            )}
          >
            {copy.description}
          </p>
          {!isEvent && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {websiteUrl && (
                <a
                  data-testid={`listing-website-${marker.id}`}
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {marker.officialUrl
                    ? t.officialWebsite
                    : (language === 'nl' ? 'Bronpagina' : 'Source page')}
                </a>
              )}
              {marker.facebookUrl && (
                <a
                  href={marker.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Facebook: ${marker.name}`}
                  title="Facebook"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/5 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Facebook className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {marker.instagramUrl && (
                <a
                  href={marker.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Instagram: ${marker.name}`}
                  title="Instagram"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/5 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {!hasWebLinks && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {language === 'nl' ? 'Geen website of sociale links vermeld' : 'No website or social links listed'}
                </span>
              )}
            </div>
          )}
          {isExpanded && <div id={`marker-details-${marker.id}`}>
           {isEvent && (
             <EventCalendarActions
               language={language}
               event={{
                 name: marker.name,
                 description: copy.description,
                 startsAt: marker.startsAt,
                 venue: marker.venue ?? marker.address,
                 sourceUrl: marker.sourceUrl,
               }}
             />
           )}
           {(marker.businessCategory || marker.socialCategory || sourceLabel || marker.reviewStatus || (topLevelForMarker(marker) === 'events' && eventBadgeLabel(marker, language).length > 0)) && (
             <div className="mb-3 flex flex-wrap items-center gap-1.5">
               {marker.businessCategory && (
                 <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                   {getBusinessCategoryName(marker.businessCategory, language)}
                 </span>
               )}
                {marker.socialCategory && (
                  <span className="rounded-md bg-emerald-700/10 px-2 py-1 text-[11px] font-bold text-emerald-800">
                    {getSocialMapCategoryName(marker.socialCategory, language)}
                  </span>
                )}
               {sourceLabel && (
                 <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                   {sourceLabel}
                 </span>
               )}
                {marker.reviewStatus && marker.reviewStatus !== 'verified' && (
                  <span
                    data-testid={`social-map-review-status-${marker.id}`}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-800"
                  >
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    {socialMapReviewLabel(marker.reviewStatus, language)}
                  </span>
                )}
                {topLevelForMarker(marker) === 'events' && eventBadgeLabel(marker, language).map((badge) => (
                  <span key={badge.key} className={cn('rounded-md px-2 py-1 text-[11px] font-bold', badge.className)}>
                    {badge.label}
                  </span>
                ))}
             </div>
           )}
           {showAdminEvidence && <details data-testid={`listing-evidence-${marker.id}`} className="mb-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs">
             <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
               {language === 'nl' ? 'Bron en controle per veld' : 'Source and check by field'}
             </summary>
             {evidence.length === 0 ? (
               <p className="mt-2 font-semibold text-muted-foreground">
                 {language === 'nl'
                   ? 'Bron, controledatum en status zijn onbekend.'
                   : 'Source, checked date, and status are unknown.'}
               </p>
             ) : (
               <ul className="mt-2 space-y-2">
                 {evidence.map((item) => (
                   <li key={item.field} className="rounded-lg bg-card px-2.5 py-2">
                     <p className="font-bold text-foreground">{evidenceFieldLabel[item.field]}</p>
                     <p className="mt-0.5 text-muted-foreground">
                       {(language === 'nl' ? 'Bron' : 'Source')}: {item.sourceLabel ?? (language === 'nl' ? 'Onbekend' : 'Unknown')}
                       {' · '}
                       {(language === 'nl' ? 'Gecontroleerd' : 'Checked')}: {item.checkedAt
                         ? formatEvidenceCheckedAt(item.checkedAt, language)
                         : (language === 'nl' ? 'Onbekend' : 'Unknown')}
                       {' · '}
                       {evidenceStatusLabel[item.status]}
                     </p>
                     {item.caveat ? <p className="mt-1 font-semibold text-amber-800">{item.caveat}</p> : null}
                   </li>
                 ))}
               </ul>
             )}
           </details>}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary bg-secondary/5 w-fit px-2.5 py-1 rounded-md">
            <DetailIcon className="w-3.5 h-3.5 opacity-70" />
            {copy.details}
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <MapPinned className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="min-w-0 truncate">{marker.address ?? `Lat ${marker.lat.toFixed(5)} · Lng ${marker.lng.toFixed(5)}`}</span>
            </div>
            <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {(marker.category === 'Businesses' || marker.category === 'Food & Drink') && (
                <Link
                  href={featureFlags.businessIntake
                    ? `/bedrijf-nieuw?kind=existing_listing&cityId=dhg&listingSource=${encodeURIComponent(marker.source || 'google_maps')}&listingId=${encodeURIComponent(String(marker.id))}`
                    : `/bedrijf-claim?listingId=${marker.id}&cityId=dhg&listingSource=${marker.source || 'google_maps'}&name=${encodeURIComponent(marker.name)}&address=${encodeURIComponent(marker.address || '')}`}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Store className="h-3 w-3 shrink-0" />
                  {language === 'nl' ? 'Dit bedrijf claimen' : 'Claim this business'}
                </Link>
              )}
              {marker.source && (
                <Link
                  href={`/correctie?cityId=${encodeURIComponent(marker.locationId)}&listingSource=${encodeURIComponent(marker.source)}&listingId=${encodeURIComponent(marker.id)}&name=${encodeURIComponent(marker.name)}&locale=${language}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  {language === 'nl' ? 'Meld een correctie' : 'Report an issue'}
                </Link>
              )}
            </div>
          </div>
          <RouteLinks language={language} marker={marker} />
          </div>}
        </div>
    </div>
  );
}

function SavedCategorySection({
  language,
  category,
  markers,
  onRemove,
}: {
  language: Language;
  category: Category;
  markers: Marker[];
  onRemove: (marker: Marker) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const Icon = CATEGORY_ICONS[category];
  const DetailIcon = DETAIL_ICONS[category];
  const t = translations[language];

  if (markers.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 mb-4 group focus-visible:outline-none"
      >
        <div className="p-2 bg-primary/10 rounded-xl">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-lg font-extrabold text-foreground group-hover:text-primary transition-colors">
          {t.categories[category]}
        </h3>
        <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{markers.length}</span>
        <div className="ml-auto text-muted-foreground">
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-3 mb-8">
          {markers.map(marker => {
            const location = LOCATIONS.find(l => l.id === marker.locationId);
            const copy = getMarkerCopy(marker, language);
            return (
              <div
                key={marker.id}
                className="flex items-start gap-4 p-4 bg-card border border-border rounded-2xl hover:border-primary/30 hover:shadow-md transition-all duration-300 group"
              >
                <div className="p-2.5 bg-muted rounded-xl shrink-0 group-hover:bg-primary/10 transition-colors">
                  <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-bold text-sm text-foreground truncate">{marker.name}</h4>
                    <button
                      onClick={() => onRemove(marker)}
                      aria-label={`${t.removeSaved} ${marker.name}`}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">{copy.description}</p>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1 text-xs font-semibold text-secondary bg-secondary/5 px-2 py-0.5 rounded-md">
                      <DetailIcon className="w-3 h-3 opacity-70" />
                      {copy.details}
                    </div>
                    {location && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {getLocationName(location, language)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function DiscoveryState({
  language,
  userRole,
  onUserRoleChange,
  locationId,
  listingSection,
  initialNeighborhood,
  initialPostcode,
  restorePrevious,
  onBack,
  onLanguageChange,
  savedIds,
  onToggle,
  onEventRefresh,
  onViewSaved,
}: {
  language: Language;
  userRole: UserRole;
  onUserRoleChange: (userRole: UserRole) => void;
  locationId: string;
  listingSection: ListingSection;
  initialNeighborhood?: string;
  initialPostcode?: string;
  restorePrevious?: boolean;
  onBack: () => void;
  onLanguageChange: (language: Language) => void;
  savedIds: Set<string>;
  onToggle: (marker: Marker) => void;
  onEventRefresh: (markers: Marker[]) => void;
  onViewSaved: () => void;
}) {
  const location = LOCATIONS.find(l => l.id === locationId);
  const t = translations[language];
  const restoredState = useMemo(
    () => restorePrevious ? readDiscoveryReturnState(locationId) : null,
    [locationId, restorePrevious],
  );
  const [topLevelCategories, setTopLevelCategories] = useState<Record<ListingSection, boolean>>(
    () => restoredState?.topLevelCategories ?? (initialPostcode ? allTopLevelState() : topLevelStateFor(listingSection)),
  );
  const [subcategories, setSubcategories] = useState<Record<FilterSubcategory, boolean>>(
    () => restoredState?.subcategories ?? (initialPostcode ? allSubcategoryState() : subcategoryStateFor(listingSection)),
  );
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    restoredState?.selectedNeighborhoods ?? (initialNeighborhood ? [initialNeighborhood] : []),
  );
  const [neighborhoodSelection, setNeighborhoodSelection] = useState<'all' | 'some' | 'none'>(
    restoredState?.neighborhoodSelection ?? (initialNeighborhood ? 'some' : 'all'),
  );
  const [postcodeFilter, setPostcodeFilter] = useState(restoredState?.postcodeFilter ?? initialPostcode ?? '');
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [viewportPreservingSelection, setViewportPreservingSelection] = useState<string | null>(null);
  const [agendaTime, setAgendaTime] = useState<AgendaTimeFilter>(restoredState?.agendaTime ?? 'all');
  const [agendaPrice, setAgendaPrice] = useState<AgendaPriceFilter>(restoredState?.agendaPrice ?? 'all');
  const [mealOnly, setMealOnly] = useState(restoredState?.mealOnly ?? false);
  const [quickFilters, setQuickFilters] = useState<Set<DiscoveryQuickFilter>>(
    () => new Set(restoredState?.quickFilters ?? []),
  );
  const [nearbyPosition, setNearbyPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyStatus, setNearbyStatus] = useState<'idle' | 'locating' | 'ready' | 'fallback'>('idle');
  const [showMap, setShowMap] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const sidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const initialScopeEffectRef = useRef(true);
  const hasSearchArea = Boolean(
    initialPostcode?.trim()
    || initialNeighborhood?.trim()
    || selectedNeighborhoods.length > 0
    || postcodeFilter.trim().length >= 4,
  );
  const requestedNeighborhoods = location
    && selectedNeighborhoods.length > 0
    && selectedNeighborhoods.length < location.neighborhoods.length
    ? selectedNeighborhoods.join(',')
    : undefined;
  const businessSubcategories = subcategoriesForTopLevel('businesses') as BusinessCategory[];
  const selectedBusinessCategories = businessSubcategories.filter((category) => subcategories[category]);
  const requestedBusinessCategories = selectedBusinessCategories.length < businessSubcategories.length
    ? selectedBusinessCategories.join(',')
    : undefined;
  const requestedSearchCenter = selectedNeighborhoods.length === 1
    ? location?.neighborhoodCoords[selectedNeighborhoods[0]]
    : undefined;

  const [liveMode, setLiveMode] = useState(readIncludeExternalSources);
  const setDiscoveryScope = useCallback((includeWebResults: boolean) => {
    sessionStorage.setItem(DISCOVERY_EXTERNAL_SOURCES_STORAGE_KEY, String(includeWebResults));
    setLiveMode(includeWebResults);
  }, []);
  const enableLiveMode = useCallback(() => setDiscoveryScope(true), [setDiscoveryScope]);

  const anonymousId = useMemo(() => {
    let id = localStorage.getItem('buurtplaza-anonymous-id');
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('buurtplaza-anonymous-id', id);
    }
    return id;
  }, []);

  // Fetch selected top-level sections only; each query keeps its generated cache key.
  const eventsQuery = useGetListings(
    { cityId: locationId, section: 'events', language, neighborhoods: requestedNeighborhoods, mode: 'stored_only', anonymousId },
    { query: { enabled: topLevelCategories.events, queryKey: getGetListingsQueryKey({ cityId: locationId, section: 'events', language, neighborhoods: requestedNeighborhoods, mode: 'stored_only', anonymousId }) } },
  );
  // Narrowing a filter changes the query key. Keep the previous response while
  // the new one loads: the client-side polygon and subcategory filters already
  // narrow it correctly, so the user never sees a false "0 results" state.
  const businessesQuery = useGetListings(
    { cityId: locationId, section: 'businesses', language, neighborhoods: requestedNeighborhoods, businessCategories: requestedBusinessCategories, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'stored_only', anonymousId },
    // Keep the query enabled even when the final subcategory is unchecked.
    // The empty category value is a real request for the current area; the
    // client-side filter keeps the map empty until the response settles.
    { query: { enabled: topLevelCategories.businesses && hasSearchArea, placeholderData: keepPreviousData, queryKey: getGetListingsQueryKey({ cityId: locationId, section: 'businesses', language, neighborhoods: requestedNeighborhoods, businessCategories: requestedBusinessCategories, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'stored_only', anonymousId }) } },
  );
  const foodDrinkQuery = useGetListings(
    { cityId: locationId, section: 'food-drink', language, neighborhoods: requestedNeighborhoods, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'stored_only', anonymousId },
    { query: { enabled: topLevelCategories['food-drink'] && hasSearchArea, placeholderData: keepPreviousData, queryKey: getGetListingsQueryKey({ cityId: locationId, section: 'food-drink', language, neighborhoods: requestedNeighborhoods, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'stored_only', anonymousId }) } },
  );
  const socialMapQuery = useGetListings(
    { cityId: locationId, section: 'social-map', language, neighborhoods: requestedNeighborhoods, mode: 'stored_only', anonymousId },
    { query: { enabled: topLevelCategories['social-map'], queryKey: getGetListingsQueryKey({ cityId: locationId, section: 'social-map', language, neighborhoods: requestedNeighborhoods, mode: 'stored_only', anonymousId }) } },
  );
  const webBusinessesQuery = useGetListings(
    { cityId: locationId, section: 'businesses', language, neighborhoods: requestedNeighborhoods, businessCategories: requestedBusinessCategories, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'live', anonymousId },
    { query: { enabled: liveMode && topLevelCategories.businesses && hasSearchArea, queryKey: getGetListingsQueryKey({ cityId: locationId, section: 'businesses', language, neighborhoods: requestedNeighborhoods, businessCategories: requestedBusinessCategories, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'live', anonymousId }) } },
  );
  const webFoodDrinkQuery = useGetListings(
    { cityId: locationId, section: 'food-drink', language, neighborhoods: requestedNeighborhoods, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'live', anonymousId },
    { query: { enabled: liveMode && topLevelCategories['food-drink'] && hasSearchArea, queryKey: getGetListingsQueryKey({ cityId: locationId, section: 'food-drink', language, neighborhoods: requestedNeighborhoods, searchLat: requestedSearchCenter?.lat, searchLng: requestedSearchCenter?.lng, mode: 'live', anonymousId }) } },
  );
  const listingQueries = {
    events: eventsQuery,
    businesses: businessesQuery,
    'food-drink': foodDrinkQuery,
    'social-map': socialMapQuery,
  };
  const webListingQueries = {
    businesses: webBusinessesQuery,
    'food-drink': webFoodDrinkQuery,
  };

  useEffect(() => {
    if (!eventsQuery.data) return;
    const refreshedEvents = eventsQuery.data.listings
      .filter(listing => listing.source === 'source_scan') as unknown as Marker[];
    onEventRefresh(refreshedEvents);
  }, [eventsQuery.data, onEventRefresh]);

  if (!location) return null;

  const toggleTopLevelCategory = (section: ListingSection) => {
    const isEnabling = !topLevelCategories[section];
    setTopLevelCategories((previous) => ({
      ...previous,
      [section]: !previous[section],
    }));
    if (isEnabling) {
      const childCategories = subcategoriesForTopLevel(section);
      setSubcategories((previous) => ({
        ...previous,
        ...Object.fromEntries(childCategories.map((category) => [category, true])),
      }));
    }
    setSelectedMarker(null);
  };

  const selectTopLevelSection = (section: ListingSection) => {
    setTopLevelCategories(topLevelStateFor(section));
    setSubcategories(subcategoryStateFor(section));
    setSelectedMarker(null);
  };

  const selectAllCategories = () => {
    setTopLevelCategories(allTopLevelState());
    setSubcategories(allSubcategoryState());
    setSelectedMarker(null);
  };

  const deselectAllCategories = () => {
    setTopLevelCategories(noTopLevelState());
    setSubcategories(noSubcategoryState());
    setSelectedMarker(null);
  };

  const toggleSubcategory = (subcategory: FilterSubcategory) => {
    setSubcategories((previous) => ({
      ...previous,
      [subcategory]: !previous[subcategory],
    }));
    setSelectedMarker(null);
  };

  const selectAllSubcategories = () => {
    setSubcategories((previous) => ({
      ...previous,
      ...Object.fromEntries(visibleSubcategories.map((subcategory) => [subcategory, true])),
    }));
    setSelectedMarker(null);
  };

  const deselectAllSubcategories = () => {
    setSubcategories((previous) => ({
      ...previous,
      ...Object.fromEntries(visibleSubcategories.map((subcategory) => [subcategory, false])),
    }));
    setSelectedMarker(null);
  };

  const handleMarkerClick = (id: string) => {
    const marker = allMarkers.find((item) => item.id === id);
    if (marker) persistDetailListing(marker);
    const section = marker ? topLevelForMarker(marker) : listingSection;
    const detailUrl = `/activiteiten/den-haag/${encodeURIComponent(id)}?section=${section}`;
    const detailWindow = window.open(detailUrl, '_blank', 'noopener,noreferrer');
    if (detailWindow) {
      detailWindow.opener = null;
    }
  };
  const handleClusterMarkerClick = handleMarkerClick;

  const toggleNeighborhood = (neighborhood: string) => {
    if (selectedNeighborhoods.includes(neighborhood)) {
      setSelectedNeighborhoods([]);
      setNeighborhoodSelection('none');
    } else {
      setSelectedNeighborhoods([neighborhood]);
      setNeighborhoodSelection('some');
    }
    setSelectedMarker(null);
  };

  const selectAllNeighborhoods = () => {
    setSelectedNeighborhoods([]);
    setNeighborhoodSelection('all');
    setSelectedMarker(null);
  };

  const deselectAllNeighborhoods = () => {
    setSelectedNeighborhoods([]);
    setNeighborhoodSelection('none');
    setSelectedMarker(null);
  };

  const toggleQuickFilter = (filter: DiscoveryQuickFilter) => {
    const isActivating = !quickFilters.has(filter);
    setQuickFilters((previous) => {
      const next = new Set(previous);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
    setSelectedMarker(null);
    if (filter !== 'nearby' || !isActivating || nearbyPosition) return;
    if (!navigator.geolocation) {
      setNearbyStatus('fallback');
      return;
    }
    setNearbyStatus('locating');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setNearbyPosition({ lat: coords.latitude, lng: coords.longitude });
        setNearbyStatus('ready');
      },
      () => setNearbyStatus('fallback'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  };

  useEffect(() => {
    if (initialScopeEffectRef.current) {
      initialScopeEffectRef.current = false;
      if (restoredState) return;
    }
    setTopLevelCategories(initialPostcode ? allTopLevelState() : topLevelStateFor(listingSection));
    setSubcategories(initialPostcode ? allSubcategoryState() : subcategoryStateFor(listingSection));
    setSelectedNeighborhoods(initialNeighborhood ? [initialNeighborhood] : []);
    setNeighborhoodSelection(initialNeighborhood ? 'some' : 'all');
    setSelectedMarker(null);
  }, [initialNeighborhood, initialPostcode, listingSection, restoredState]);

  useEffect(() => {
    const returnState: DiscoveryReturnState = {
      savedAt: Date.now(),
      locationId,
      topLevelCategories,
      subcategories,
      selectedNeighborhoods,
      neighborhoodSelection,
      postcodeFilter,
      agendaTime,
      agendaPrice,
      mealOnly,
      quickFilters: [...quickFilters],
    };
    window.localStorage.setItem(DISCOVERY_RETURN_STATE_KEY, JSON.stringify(returnState));
  }, [
    agendaPrice,
    agendaTime,
    locationId,
    mealOnly,
    neighborhoodSelection,
    postcodeFilter,
    quickFilters,
    selectedNeighborhoods,
    subcategories,
    topLevelCategories,
  ]);

  useEffect(() => {
    if (nearbyStatus !== 'locating') return;
    const fallbackTimer = window.setTimeout(() => {
      setNearbyStatus((current) => current === 'locating' ? 'fallback' : current);
    }, 4_000);
    return () => window.clearTimeout(fallbackTimer);
  }, [nearbyStatus]);

  useEffect(() => {
    if (!selectedMarker) return;
    const scrollToSelectedCard = () => {
      const card = document.getElementById(`event-${selectedMarker}`);
      const list = document.querySelector<HTMLElement>('[data-event-list]');
      if (!card || !list) return;

      const cardRect = card.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const targetScrollTop = list.scrollTop
        + cardRect.top
        - listRect.top
        - (list.clientHeight - cardRect.height) / 2;
      list.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'auto' });
    };
    const frame = window.requestAnimationFrame(scrollToSelectedCard);
    const timer = window.setTimeout(scrollToSelectedCard, 550);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [selectedMarker]);

  const selectedTopLevelSections = TOP_LEVEL_SECTIONS.filter((section) => topLevelCategories[section]);
  const selectedLocalQueries = selectedTopLevelSections.map((section) => listingQueries[section]);
  const selectedWebQueries = liveMode
    ? selectedTopLevelSections
      .filter((section): section is 'businesses' | 'food-drink' =>
        section === 'businesses' || section === 'food-drink')
      .map((section) => webListingQueries[section])
    : [];
  const selectedQueries = [...selectedLocalQueries, ...selectedWebQueries];
  const localSelectedData = selectedLocalQueries
    .map((query) => query.data)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const webSelectedData = selectedWebQueries
    .map((query) => query.data)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const selectedData = [...localSelectedData, ...webSelectedData];
  const localSelectedListings = [
    ...new Map(
      localSelectedData
        .flatMap((result) => result.listings)
        .map((listing) => [listing.id, listing] as const),
    ).values(),
  ];
  const localListingIds = new Set(localSelectedListings.map((listing) => listing.id));
  const webSelectedListings = webSelectedData
    .flatMap((result) => result.listings)
    .filter((listing) => !localListingIds.has(listing.id));
  const selectedListings = [...localSelectedListings, ...webSelectedListings];
  const socialMapSnapshotDate = selectedListings.find((listing) => listing.snapshotDate)?.snapshotDate;
  const visibleSubcategories = Array.from(new Set(
    selectedTopLevelSections.flatMap(subcategoriesForTopLevel),
  ));

  // The listings API already scopes each result to the selected section. Do not
  // fill an empty event response with general static attractions: a first visit
  // must show actual events only, or the explicit empty-event state.
  type ScopedMarker = Marker & { scopeGroup: 'local' | 'web' };
  const toMarker = (l: (typeof selectedListings)[number], scopeGroup: 'local' | 'web'): ScopedMarker => {
    return {
      id: l.id,
      locationId: l.locationId,
      category: l.category as Category,
      name: l.name,
      description: l.description,
      x: l.x,
      y: l.y,
      details: l.details,
      startsAt: l.startsAt,
      isCancelled: l.isCancelled,
      openingTimes: l.openingTimes,
      venue: l.venue,
      lat: l.lat,
      lng: l.lng,
      sourceUrl: (l as { sourceUrl?: string }).sourceUrl,
        businessCategory: l.businessCategory as BusinessCategory | undefined,
        source: l.source as ListingSource | undefined,
        sourceName: l.sourceName,
        address: l.address,
        neighborhood: l.neighborhood,
        socialCategory: l.socialCategory as SocialMapCategory | undefined,
        officialUrl: l.officialUrl,
        sourcePageUrl: l.sourcePageUrl,
        facebookUrl: l.facebookUrl,
        instagramUrl: l.instagramUrl,
        snapshotDate: l.snapshotDate,
        reviewStatus: l.reviewStatus as SocialMapReviewStatus | undefined,
        reviewReason: l.reviewReason,
        lastCheckedAt: l.lastCheckedAt,
        nextReviewAt: l.nextReviewAt,
        sourceGroup: l.sourceGroup,
        organizer: l.organizer,
        scopeGroup,
        activityKind: l.activityKind as EventActivityKind | null | undefined,
        priceType: l.priceType,
        priceText: l.priceText,
        mealType: l.mealType,
        foodType: l.foodType,
        audience: l.audience,
        recurrenceText: l.recurrenceText,
        isApproximateLocation: l.isApproximateLocation,
        isIndoor: l.isIndoor,
        openNow: l.openNow,
        firstSeenAt: l.firstSeenAt,
        lastSeenAt: l.lastSeenAt,
        updatedAt: l.updatedAt,
        evidence: l.evidence,
    };
  };
  const allMarkers: ScopedMarker[] = [
    ...localSelectedListings.map((listing) => toMarker(listing, 'local')),
    ...webSelectedListings.map((listing) => toMarker(listing, 'web')),
  ];

  const selectedAreas = selectedNeighborhoods
    .map((neighborhood) => location.neighborhoodCoords[neighborhood])
    .filter((area): area is { lat: number; lng: number; zoom: number } => Boolean(area));
  const activeQuickFilters = new Set(quickFilters);
  if (agendaTime !== 'all') activeQuickFilters.add(agendaTime);
  if (agendaPrice === 'free') activeQuickFilters.add('free');
  const nearbyOrigin = nearbyPosition
    ?? selectedAreas[0]
    ?? { lat: location.lat, lng: location.lng };
  // A map click or a refresh can update selectedNeighborhoods before the
  // checkbox state catches up. Explicit selections must always win over the
  // "all neighborhoods" default, otherwise pins from the whole city remain
  // visible while one polygon is highlighted.
  const activeNeighborhoodNames = neighborhoodSelection === 'all' && selectedNeighborhoods.length === 0
    ? location.neighborhoods
    : neighborhoodSelection === 'none'
      ? []
      : selectedNeighborhoods;
  const filteredMarkers = allMarkers.filter((marker) => {
    const markerTopLevel = topLevelForMarker(marker);
    if (!topLevelCategories[markerTopLevel]) return false;
    const markerSubcategory = marker.category === 'Food & Drink'
      ? (marker.foodType && FOOD_TYPES.includes(marker.foodType) ? marker.foodType : 'other')
      : (marker.socialCategory
        ?? marker.businessCategory
        ?? (marker.category === 'Businesses' ? undefined : marker.category as FilterSubcategory));
    if (
      markerTopLevel !== 'events'
      && visibleSubcategories.length > 0
      && (!markerSubcategory || !subcategories[markerSubcategory as FilterSubcategory])
    ) {
      return false;
    }
    if (markerTopLevel === 'events' && markerSubcategory && !subcategories[markerSubcategory]) {
      return false;
    }
    if (markerTopLevel === 'events') {
      if (agendaPrice === 'low-cost' && marker.priceType !== 'low-cost') return false;
      if (mealOnly && !marker.mealType) return false;
    }
    if (!matchesDiscoveryQuickFilters(marker, activeQuickFilters, { nearbyOrigin, nearbyRadiusKm: 2.5 })) return false;
    const normalizedPostcode = postcodeFilter.trim().toUpperCase().replace(/\s/g, '');
    if (
      normalizedPostcode
      && !marker.address?.toUpperCase().replace(/\s/g, '').includes(normalizedPostcode)
    ) {
      return false;
    }
    if (neighborhoodSelection === 'none') return false;
    if (activeNeighborhoodNames.length === 0) return false;
    if (marker.category === 'Social map') {
      if (!marker.neighborhood || !activeNeighborhoodNames.includes(marker.neighborhood)) return false;
    }
    return isPointInsideNeighborhoods(marker.lat, marker.lng, activeNeighborhoodNames);
  });
  const isLoading = selectedQueries.some((query) => query.isLoading);
  // A background refetch after a filter change shows the previous response
  // (placeholder data) until the narrowed result arrives; surface that state.
  const isRefreshing = !isLoading && selectedQueries.some((query) => query.isFetching);
  const refreshingLabel = language === 'nl' ? 'Resultaten worden bijgewerkt…' : 'Updating results…';
  const refreshingIndicator = isRefreshing ? (
    <span
      role="status"
      aria-live="polite"
      data-testid="results-refreshing"
      className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case tracking-normal text-primary"
    >
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      {refreshingLabel}
    </span>
  ) : null;
  const isError = selectedQueries.some((query) => query.isError) && selectedListings.length === 0;
  const refetch = () => Promise.all(selectedQueries.map((query) => query.refetch()));
  const isLive = selectedData.some((result) => result.source === 'live');
  const isGooglePlaces = selectedData.some((result) => result.source === 'google_places');
  const hasOpenStreetMap = selectedListings.some((listing) => listing.source === 'openstreetmap');
  const isFallback = selectedData.some((result) => result.source === 'fallback');
  const isCurated = selectedData.some((result) => result.source === 'curated');
  const isStored = selectedData.some((result) => result.source === 'stored');
  const isCacheMiss = selectedData.some((result) => result.cacheMiss);
  const fallbackMessage = selectedData
    .filter((result) => result.source === 'fallback' && result.message)
    .map((result) => result.message)
    .join(' ');
  const eventEvidence = topLevelCategories.events
    ? selectedData.find((result) => result.evidence)?.evidence
    : undefined;
  const evidenceStatus = eventEvidence?.status;
  const evidenceTone = evidenceStatus === 'verified'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : evidenceStatus === 'empty'
      ? 'border-slate-200 bg-slate-50 text-slate-900'
      : evidenceStatus === 'stale'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-rose-200 bg-rose-50 text-rose-950';

  const savedCount = savedIds.size;
  const normalizedNeighborhoodSearch = neighborhoodSearch.trim().toLocaleLowerCase(language === 'nl' ? 'nl-NL' : 'en-GB');
  const visibleNeighborhoods = normalizedNeighborhoodSearch
    ? location.neighborhoods.filter((neighborhood) =>
      neighborhood.toLocaleLowerCase(language === 'nl' ? 'nl-NL' : 'en-GB').includes(normalizedNeighborhoodSearch),
    )
    : location.neighborhoods;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:h-screen md:flex-row md:overflow-hidden">
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />

      {/* Sidebar List */}
      <div
      className={cn(
        "relative z-20 flex min-h-screen w-full flex-col overflow-y-auto border-r border-border bg-card/95 shadow-2xl backdrop-blur-xl md:h-full md:min-h-0 md:bg-card",
        showMap ? "h-[70vh] md:w-[var(--sidebar-width)]" : "md:w-full",
      )}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <div className="shrink-0 border-b border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-3">
            <button 
              onClick={onBack} 
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t.backToSearch}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{getLocationName(location, language)}</h1>
              <p className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                {t.discoveriesNearby(filteredMarkers.length)}
                {isRefreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />}
              </p>
            </div>
            <button
              onClick={onViewSaved}
              aria-label={t.savedPlaces}
              className={cn(
                "relative p-2.5 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                savedCount > 0
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
            >
              <BookmarkCheck className="w-5 h-5" />
              {savedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] font-black text-primary-foreground">
                  {savedCount > 9 ? '9+' : savedCount}
                </span>
              )}
            </button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMap((visible) => !visible)}
              aria-pressed={showMap}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-4 text-sm font-extrabold text-foreground transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {showMap ? <Search className="h-4 w-4" aria-hidden="true" /> : <MapIcon className="h-4 w-4" aria-hidden="true" />}
              {showMap
                ? (language === 'nl' ? 'Toon lijst' : 'Show list')
                : (language === 'nl' ? 'Toon kaart' : 'Show map')}
            </button>
            {!showMap && (
              <p className="text-xs font-semibold text-muted-foreground">
                {language === 'nl'
                  ? 'De kaart wordt pas geladen als je hiervoor kiest.'
                  : 'The map loads only when you choose to show it.'}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="discovery-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-muted/35 px-4 text-sm font-extrabold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
          >
            <span>{language === 'nl' ? 'Filters en zoekgebied' : 'Filters and search area'}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', mobileFiltersOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          <div id="discovery-filters" className={cn("mt-3 space-y-2", mobileFiltersOpen ? "block" : "hidden md:block")}>
            <FilterFrame title={language === 'nl' ? 'Zoekbereik' : 'Search scope'}>
              <p className="text-xs font-semibold text-muted-foreground" role="status" aria-live="polite">
                {liveMode
                  ? (language === 'nl' ? 'Lokaal zoeken met aanvullende webresultaten.' : 'Local search with additional web results.')
                  : (language === 'nl' ? 'Alleen lokaal zoeken.' : 'Local-only search.')}
              </p>
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 transition-colors hover:border-primary/40">
                <input
                  type="checkbox"
                  checked={liveMode}
                  onChange={(event) => setDiscoveryScope(event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="text-xs font-bold text-foreground">
                  {language === 'nl' ? 'Webresultaten opnemen' : 'Include web results'}
                </span>
              </label>
              <details className="mt-2 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px]">
                <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {language === 'nl' ? 'Uitleg over bronnen en privacy' : 'Source and privacy details'}
                </summary>
                <div className="mt-2 space-y-2 leading-relaxed text-muted-foreground">
                  <p>
                    {language === 'nl'
                      ? 'Lokaal gebruikt de bestaande catalogus en geïntegreerde bronnen. Webresultaten voegen externe bronnen toe en delen je gekozen zoekgebied met die aanbieders.'
                      : 'Local-only uses the established catalogue and integrated sources. Web results add external sources and share your selected search area with those providers.'}
                  </p>
                  <p>
                    {language === 'nl'
                      ? 'Webresultaten zijn geen aanbeveling of verificatie door MarqtPlaza.'
                      : 'Web results are not endorsed or verified by MarqtPlaza.'}
                  </p>
                  <Link to="/account/privacy" className="inline-flex font-bold text-primary underline-offset-2 hover:underline">
                    {language === 'nl' ? 'Privacyinformatie' : 'Privacy information'}
                  </Link>
                </div>
              </details>
            </FilterFrame>
            <FilterFrame title={language === 'nl' ? 'Snel kiezen' : 'Quick choices'}>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={language === 'nl' ? 'Snelle filters' : 'Quick filters'}>
                {([
                  ['nearby', language === 'nl' ? 'Dichtbij' : 'Nearby'],
                  ...(topLevelCategories.events
                    ? [
                      ['family', language === 'nl' ? 'Gezin' : 'Family'],
                      ['indoor', language === 'nl' ? 'Binnen' : 'Indoor'],
                    ] as Array<[DiscoveryQuickFilter, string]>
                    : []),
                  ...(topLevelCategories.businesses || topLevelCategories['food-drink']
                    ? [['open-now', language === 'nl' ? 'Nu open' : 'Open now'] as [DiscoveryQuickFilter, string]]
                    : []),
                ] as Array<[DiscoveryQuickFilter, string]>).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => toggleQuickFilter(value)}
                    aria-pressed={quickFilters.has(value)}
                    className={cn(
                      'inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                      quickFilters.has(value)
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {value === 'nearby' && <Navigation className="h-3.5 w-3.5" aria-hidden="true" />}
                    {label}
                  </button>
                ))}
              </div>
              {quickFilters.has('nearby') && (
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground" role="status">
                  {nearbyStatus === 'locating'
                    ? (language === 'nl' ? 'Je locatie bepalen…' : 'Finding your location…')
                    : nearbyStatus === 'ready'
                      ? (language === 'nl' ? 'Binnen 2,5 km van je huidige locatie.' : 'Within 2.5 km of your current location.')
                      : (language === 'nl'
                        ? 'Binnen 2,5 km van de gekozen buurt of het stadscentrum.'
                        : 'Within 2.5 km of the selected neighborhood or city centre.')}
                </p>
              )}
              {(quickFilters.has('indoor') || quickFilters.has('open-now')) && (
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  {language === 'nl'
                    ? 'Binnen en nu open worden alleen getoond bij expliciete, gestructureerde broninformatie.'
                    : 'Indoor and open-now results only appear with explicit, structured source information.'}
                </p>
              )}
            </FilterFrame>
            <FilterFrame title={t.topLevelCategories}>
              <div className="mb-2">
                <CategoryActionButtons
                  language={language}
                  onSelectAll={selectAllCategories}
                  onDeselectAll={deselectAllCategories}
                />
              </div>
              <div
                role="group"
                aria-label={t.topLevelCategories}
                className="grid grid-cols-2 gap-1"
              >
                {TOP_LEVEL_SECTIONS.map((section) => {
                  const isChecked = topLevelCategories[section];
                  const label = section === 'events'
                    ? (language === 'nl' ? 'Evenementen' : 'Events')
                    : section === 'businesses'
                      ? t.categories.Businesses
                      : section === 'social-map'
                        ? t.categories['Social map']
                        : t.categories['Food & Drink'];
                  return (
                    <label
                      key={section}
                      className={cn(
                        "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-all",
                        isChecked
                          ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_3px_10px_-6px_rgba(243,108,33,0.8)]"
                          : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTopLevelCategory(section)}
                        className="h-3.5 w-3.5 shrink-0 accent-primary"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </FilterFrame>
            {visibleSubcategories.length > 0 && (
              <FilterFrame title={t.subcategories} status={refreshingIndicator}>
                <div className="mb-2">
                  <CategoryActionButtons
                    language={language}
                    onSelectAll={selectAllSubcategories}
                    onDeselectAll={deselectAllSubcategories}
                    selectLabel={language === 'nl' ? 'Alle subcategorieën' : 'All subcategories'}
                    deselectLabel={language === 'nl' ? 'Geen subcategorieën' : 'No subcategories'}
                  />
                </div>
                <div
                  role="group"
                  aria-label={t.subcategories}
                  aria-busy={isRefreshing}
                  className={cn("grid grid-cols-2 gap-1 transition-opacity", isRefreshing && "opacity-70")}
                >
                  {visibleSubcategories.map((subcategory) => {
                    const isChecked = subcategories[subcategory];
                    const color = getSubcategoryColor(subcategory);
                    return (
                      <label
                        key={subcategory}
                        className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-all hover:brightness-95"
                        style={{
                          backgroundColor: isChecked ? color : `${color}1f`,
                          borderColor: isChecked ? color : `${color}66`,
                          color: isChecked ? '#ffffff' : color,
                          boxShadow: isChecked ? `0 3px 10px -6px ${color}` : undefined,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSubcategory(subcategory)}
                          className="h-3.5 w-3.5 shrink-0 accent-white"
                        />
                        <span>{subcategoryLabelFor(subcategory, language)}</span>
                      </label>
                    );
                  })}
                </div>
              </FilterFrame>
            )}

          {topLevelCategories.events && (
            <FilterFrame title={language === 'nl' ? 'Activiteitenkalender' : 'Activity calendar'}>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={language === 'nl' ? 'Agenda filters' : 'Calendar filters'}>
                {([
                  ['all', language === 'nl' ? 'Alle data' : 'All dates'],
                  ['today', language === 'nl' ? 'Vandaag' : 'Today'],
                  ['week', language === 'nl' ? 'Deze week' : 'This week'],
                ] as Array<[AgendaTimeFilter, string]>).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => { setAgendaTime(value); setSelectedMarker(null); }}
                    className={cn(
                      'min-h-8 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                      agendaTime === value ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {label}
                  </button>
                ))}
                {([
                  ['free', language === 'nl' ? 'Gratis' : 'Free'],
                  ['low-cost', language === 'nl' ? 'Laag tarief' : 'Low cost'],
                ] as Array<[Exclude<AgendaPriceFilter, 'all'>, string]>).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => { setAgendaPrice(current => current === value ? 'all' : value); setSelectedMarker(null); }}
                    aria-pressed={agendaPrice === value}
                    className={cn(
                      'min-h-8 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                      agendaPrice === value ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-900' : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setMealOnly(current => !current); setSelectedMarker(null); }}
                  aria-pressed={mealOnly}
                  className={cn(
                    'min-h-8 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                    mealOnly ? 'border-orange-500/50 bg-orange-500/10 text-orange-900' : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {language === 'nl' ? 'Maaltijden' : 'Meals'}
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                {language === 'nl'
                  ? 'Gratis, laag tarief en maaltijd worden alleen getoond als de bron dit expliciet vermeldt.'
                  : 'Free, low-cost, and meal labels appear only when the source states them explicitly.'}
              </p>
            </FilterFrame>
          )}
          <FilterFrame title={`${t.neighborhoods} / ${t.postcodeFilterLabel}`}>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {t.postcodeFilterLabel}
              </span>
              <input
                type="search"
                value={postcodeFilter}
                onChange={(event) => setPostcodeFilter(event.target.value)}
                placeholder={t.postcodeFilterPlaceholder}
                className="h-9 w-full rounded-lg border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {language === 'nl' ? 'Zoek buurt' : 'Search neighborhood'}
              </span>
              <input
                type="search"
                value={neighborhoodSearch}
                onChange={(event) => setNeighborhoodSearch(event.target.value)}
                placeholder={language === 'nl' ? 'Typ een buurtnaam…' : 'Type a neighborhood name…'}
                className="h-9 w-full rounded-lg border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="mb-2">
                <NeighborhoodActionButtons
                  language={language}
                  onSelectAll={selectAllNeighborhoods}
                  onDeselectAll={deselectAllNeighborhoods}
                />
            </div>
            <div
              role="group"
              aria-label={t.neighborhoods}
              data-neighborhood-list
              className="max-h-44 overflow-y-auto overflow-x-hidden rounded-lg border border-border/50 bg-muted/20 p-1 pr-1.5"
            >
              <div className="grid min-w-0 grid-cols-2 gap-1">
                <label
                  className={cn(
                    "flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-[10px] font-bold transition-all",
                    neighborhoodSelection === 'all'
                       ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_3px_10px_-6px_rgba(243,108,33,0.8)]"
                       : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={neighborhoodSelection === 'all'}
                    onChange={() => {
                      if (neighborhoodSelection === 'all') deselectAllNeighborhoods();
                      else selectAllNeighborhoods();
                    }}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                   <span className="min-w-0 truncate whitespace-nowrap">{t.allNeighborhoods}</span>
                </label>
                {visibleNeighborhoods.map((neighborhood) => {
                  const isChecked = selectedNeighborhoods.includes(neighborhood);
                  return (
                    <label
                      key={neighborhood}
                      className={cn(
                        "flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-[10px] font-semibold transition-all",
                        isChecked
                          ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_3px_10px_-6px_rgba(243,108,33,0.8)]"
                          : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
                      )}
                      title={`${t.neighborhoodLabel}: ${neighborhood}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => {
                          const nativeEvent = event.nativeEvent as MouseEvent;
                           toggleNeighborhood(neighborhood);
                        }}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 truncate whitespace-nowrap">{neighborhood}</span>
                    </label>
                  );
                })}
              </div>
              {visibleNeighborhoods.length === 0 && (
                <p className="px-3 py-5 text-center text-xs font-medium text-muted-foreground">
                  {language === 'nl' ? 'Geen buurten gevonden.' : 'No neighborhoods found.'}
                </p>
              )}
            </div>
            <p className="mt-2 text-[10px] font-medium text-muted-foreground">
              {neighborhoodSelection === 'some'
                ? t.neighborhoodsSelected(selectedNeighborhoods.length)
                : neighborhoodSelection === 'none'
                  ? t.noNeighborhoodsSelected
                  : t.allNeighborhoods}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {language === 'nl'
                ? 'Shift+klik om extra buurten toe te voegen of te verwijderen.'
                : 'Shift+click to add or remove additional neighborhoods.'}
            </p>
          </FilterFrame>
          </div>
        </div>

        {/* Data source badge */}
        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <Radio className="w-3 h-3" />
                {t.liveDataBadge}
              </span>
            ) : isGooglePlaces ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <MapPinned className="w-3 h-3" />
                {hasOpenStreetMap ? 'Google Places + OpenStreetMap' : 'Google Places'}
              </span>
            ) : isCurated ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/5 border border-primary/20 px-2.5 py-1 rounded-full">
                <Landmark className="w-3 h-3" />
                {language === 'nl' ? 'Samengestelde selectie' : 'Curated selection'}
              </span>
            ) : isFallback ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <WifiOff className="w-3 h-3" />
                {t.curatedDataBadge}
              </span>
            ) : null}
            {isStored && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-full dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                <Bookmark className="w-3 h-3" />
                {language === 'nl' ? 'Opgeslagen gegevens' : 'Stored data'}
              </span>
            )}
            {isCacheMiss && !liveMode && (
              <div className="flex flex-col gap-2 w-full mt-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  {language === 'nl' ? 'Er zijn geen opgeslagen resultaten voor deze zoekopdracht.' : 'No saved results exist for this search.'}
                </span>
                <button
                  type="button"
                  onClick={enableLiveMode}
                  className="self-start text-xs font-bold text-primary hover:text-primary/80 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                >
                  {language === 'nl' ? 'Schakel over naar live modus om externe bronnen te doorzoeken' : 'Switch to live mode to search external sources'}
                </button>
              </div>
            )}
            {isFallback && fallbackMessage && (
              <span className="text-xs text-muted-foreground">{fallbackMessage}</span>
            )}
            {(isGooglePlaces || selectedTopLevelSections.includes('social-map')) && (
              <p className="w-full text-xs leading-relaxed text-muted-foreground">
                {selectedTopLevelSections.includes('social-map') ? t.socialMapCoverageNote : t.listingsCoverageNote}
              </p>
            )}
            {eventEvidence && evidenceStatus && (
              <div
                data-testid="event-evidence-summary"
                role="status"
                aria-live="polite"
                className={cn('w-full rounded-xl border px-3 py-2.5', evidenceTone)}
              >
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em]">
                        {t.eventEvidenceTitle}
                      </span>
                      <span data-testid="event-evidence-status" className="text-xs font-bold">
                        {t.eventEvidenceStatus[evidenceStatus]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed">{eventEvidence.message}</p>
                    {eventEvidence.lastCheckedAt && (
                      <p className="mt-1 text-[10px] opacity-75">
                        {t.eventEvidenceLastChecked(formatEvidenceCheckedAt(eventEvidence.lastCheckedAt, language))}
                      </p>
                    )}
                    {eventEvidence.sources.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t.eventEvidenceTitle}>
                        {eventEvidence.sources.slice(0, 6).map((source) => (
                          <li
                            key={source.id}
                            className="rounded-full border border-current/15 bg-white/50 px-2 py-0.5 text-[10px] font-semibold"
                          >
                            {source.name}: {t.eventEvidenceSourceStatus[source.status]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
            {selectedTopLevelSections.includes('social-map') && socialMapSnapshotDate && (
              <span data-testid="text-social-map-public-snapshot-date" className="w-full text-xs text-muted-foreground">
                {t.socialMapSnapshot(socialMapSnapshotDate)}
              </span>
            )}
            {selectedTopLevelSections.includes('social-map') && selectedListings.some((listing) =>
              listing.reviewStatus && listing.reviewStatus !== 'verified',
            ) && (
              <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                {language === 'nl'
                  ? 'Een of meer bronnen vragen om controle. De getoonde snapshotdatum is niet vernieuwd totdat alle broncontroles slagen.'
                  : 'One or more sources need review. The displayed snapshot date is not renewed until every source check passes.'}
              </p>
            )}
          </div>
        )}

        <div data-event-list className="shrink-0 p-4 scroll-smooth">
          <FilterFrame
            title={`${language === 'nl' ? 'Resultaten' : 'Results'} (${filteredMarkers.length})`}
          >
          <div className="flex flex-col gap-4 pb-20 md:pb-0">
            {!hasSearchArea && (topLevelCategories.businesses || topLevelCategories['food-drink']) && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
                <MapPinOff className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-extrabold text-foreground">
                  {language === 'nl' ? 'Kies eerst een zoekgebied' : 'Choose a search area first'}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {language === 'nl'
                    ? 'Voer hierboven een postcode in of selecteer een buurt om lokale bedrijven te zoeken.'
                    : 'Enter a postcode above or select a neighborhood to search local businesses.'}
                </p>
              </div>
            )}
            {/* Loading skeleton */}
            {isLoading && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="p-4 rounded-2xl border border-border bg-card animate-pulse">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-center text-sm text-muted-foreground mt-2">{t.loadingListings}</p>
              </div>
            )}

            {/* Error state */}
            {isError && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                  <WifiOff className="w-7 h-7 text-destructive" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1">{t.listingsError}</h3>
                <p className="text-xs text-muted-foreground max-w-[220px] mb-4">{t.dataUnavailable}</p>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t.retryButton}
                </button>
              </div>
            )}

            {/* Listings */}
            {!isLoading && filteredMarkers.map((m, i) => (
              <div 
                key={m.id} 
                id={`event-${m.id}`}
                data-event-id={m.id}
                data-selected={selectedMarker === m.id || undefined}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <MarkerCard
                  language={language}
                  marker={m}
                  isSelected={selectedMarker === m.id}
                  isSaved={savedIds.has(m.id)}
                  showAdminEvidence={userRole === 'designer'}
                  onClick={() => setSelectedMarker(m.id)}
                  onSave={(e) => { e.stopPropagation(); onToggle(m); }}
                />
              </div>
            ))}
            
            {!isLoading && filteredMarkers.length === 0 && !isError && (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-5">
                  <MapPinOff className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{t.noDiscoveries}</h3>
                <p className="text-sm text-muted-foreground max-w-[250px] leading-relaxed">
                   {topLevelCategories.events && eventEvidence && allMarkers.length === 0
                     ? eventEvidence.message
                     : t.noDiscoveriesDescription}
                </p>
              </div>
            )}
          </div>
          </FilterFrame>
        </div>
        
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={language === 'nl' ? 'Breedte van filterpaneel aanpassen' : 'Resize filter panel'}
          tabIndex={0}
          className="absolute -right-1 top-0 z-30 hidden h-full w-2 cursor-col-resize touch-none items-center justify-center bg-transparent after:h-14 after:w-1 after:rounded-full after:bg-border hover:after:bg-primary focus-visible:outline-none focus-visible:after:bg-primary md:flex"
          onPointerDown={(event) => {
            sidebarResizeRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startWidth: sidebarWidth,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const resize = sidebarResizeRef.current;
            if (!resize || resize.pointerId !== event.pointerId) return;
            setSidebarWidth(Math.min(640, Math.max(320, resize.startWidth + event.clientX - resize.startX)));
          }}
          onPointerUp={(event) => {
            if (sidebarResizeRef.current?.pointerId === event.pointerId) {
              sidebarResizeRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setSidebarWidth((width) => Math.max(320, width - 16));
            if (event.key === 'ArrowRight') setSidebarWidth((width) => Math.min(640, width + 16));
          }}
        />
      </div>

      {/* Map Area: mounted only after an explicit user action. */}
      {showMap && <div className="flex h-[70vh] min-h-[32rem] w-full flex-1 flex-col overflow-hidden bg-background md:h-full md:min-h-0">
        <ReferenceCategoryNav
          embedded
          language={language}
          userRole={userRole}
          onUserRoleChange={onUserRoleChange}
          onThingsToDo={() => selectTopLevelSection('events')}
          onSectionSelect={selectTopLevelSection}
        />
        <WeatherCard cityId={locationId} language={language} />
        <div className="relative min-h-0 flex-1">
          <GoogleMapView
            language={language}
            locationId={location.id}
            selectedNeighborhoods={selectedNeighborhoods}
            showAllNeighborhoods
            highlightedNeighborhood={selectedNeighborhoods.length === 1 ? selectedNeighborhoods[0] : null}
            isDataLoading={topLevelCategories.businesses && businessesQuery.isFetching}
            onNeighborhoodClick={toggleNeighborhood}
            markers={filteredMarkers}
            selectedMarkerId={selectedMarker}
            recenterSelectedMarker={selectedMarker !== viewportPreservingSelection}
            savedIds={savedIds}
            onMarkerClick={handleMarkerClick}
            onClusterMarkerClick={handleClusterMarkerClick}
          />

        </div>
      </div>}
    </div>
  );
}

function EventDetailView({ eventId, listingSection = 'events' }: {
  eventId: string;
  listingSection?: Exclude<ListingSection, 'social-map'>;
}) {
  const [, navigate] = useLocation();
  const language: Language = typeof window !== 'undefined' && window.localStorage.getItem('buurtplaza-language') === 'nl'
    ? 'nl'
    : 'en';
  const { savedMarkers, savedStateStatus } = useSavedPlaces();
  const decodedEventId = decodeURIComponent(eventId);
  const cachedListing = useMemo(() => readDetailListing(decodedEventId), [decodedEventId]);
  const listingQuery = useGetListing({
    listingId: decodedEventId,
    cityId: 'dhg',
    section: listingSection,
    language,
  });
  const listing = listingQuery.data?.listing ?? cachedListing ?? savedMarkers.get(decodedEventId);

  if (!listing && (listingQuery.isLoading || savedStateStatus === 'loading')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-2xl animate-pulse space-y-4">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-14 w-3/4 rounded bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MapPinOff className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {language === 'nl' ? 'Vermelding tijdelijk niet beschikbaar' : 'Listing temporarily unavailable'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {language === 'nl'
              ? 'We konden deze vermelding nu niet ophalen. De bron kan tijdelijk niet beschikbaar zijn of de vermelding kan zijn gewijzigd.'
              : 'We could not retrieve this listing right now. Its source may be temporarily unavailable or the listing may have changed.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void listingQuery.refetch()}
              disabled={listingQuery.isFetching}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={cn('h-4 w-4', listingQuery.isFetching && 'animate-spin')} />
              {listingQuery.isFetching
                ? (language === 'nl' ? 'Opnieuw laden…' : 'Retrying…')
                : (language === 'nl' ? 'Opnieuw proberen' : 'Try again')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/activiteiten/den-haag?restore=1')}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background"
            >
              <ArrowLeft className="h-4 w-4" />
              {language === 'nl' ? 'Terug naar ontdekken' : 'Back to discoveries'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const category = listing.category as Category;
  const Icon = CATEGORY_ICONS[category] ?? MapPinOff;
  const sourceUrl = (listing as typeof listing & { sourceUrl?: string }).sourceUrl;
  const practicalDetails = listingSection === 'events'
    ? [
      listing.organizer ? `${language === 'nl' ? 'Organisatie' : 'Organizer'}: ${listing.organizer}` : '',
      listing.priceType === 'free' ? (language === 'nl' ? 'Gratis' : 'Free') : '',
      listing.priceType === 'low-cost' ? (language === 'nl' ? 'Laag tarief' : 'Low cost') : '',
      listing.priceText ?? '',
      listing.mealType === 'food-support'
        ? (language === 'nl' ? 'Voedselhulp' : 'Food support')
        : listing.mealType ? (language === 'nl' ? 'Maaltijd' : 'Meal') : '',
      listing.audience ? `${language === 'nl' ? 'Voor' : 'For'}: ${listing.audience}` : '',
      listing.recurrenceText ?? '',
    ].filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/90 px-5 py-4 shadow-sm backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/activiteiten/den-haag?restore=1')}
            className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-5 w-5" />
            {language === 'nl' ? 'Terug naar ontdekken' : 'Back to discoveries'}
          </button>
          <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">marqtplaza.com</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <article className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-10">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-primary">
              {translations[language].categories[category]}
            </span>
          </div>
          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">{listing.name}</h1>
          {listing.isCancelled && (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-extrabold">
                  {language === 'nl' ? 'Dit evenement is afgelast' : 'This event has been cancelled'}
                </p>
                <p className="mt-1 text-sm">
                  {language === 'nl'
                    ? 'Controleer de bron voor de laatste informatie.'
                    : 'Check the source for the latest information.'}
                </p>
              </div>
            </div>
          )}
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">{listing.description}</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                {listingSection === 'events'
                  ? (language === 'nl' ? 'Wanneer' : 'When')
                  : (language === 'nl' ? 'Adres & informatie' : 'Address & information')}
              </p>
              <p className="mt-2 text-sm font-bold text-foreground">{listing.details}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                {language === 'nl' ? 'Locatie' : 'Location'}
              </p>
              <p className="mt-2 text-sm font-bold text-foreground">
                Lat {listing.lat.toFixed(5)} · Lng {listing.lng.toFixed(5)}
              </p>
            </div>
            {practicalDetails.length > 0 && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4 sm:col-span-2">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  {language === 'nl' ? 'Praktisch' : 'Practical'}
                </p>
                <p className="mt-2 text-sm font-bold text-foreground">{practicalDetails.join(' · ')}</p>
              </div>
            )}
          </div>

          {listingSection === 'events' && (
            <EventCalendarActions
              language={language}
              event={{
                name: listing.name,
                description: listing.description,
                startsAt: listing.startsAt,
                address: listing.address,
                sourceUrl,
              }}
            />
          )}

          <RouteLinks
            language={language}
            marker={{
              name: listing.name,
              lat: listing.lat,
              lng: listing.lng,
              isApproximateLocation: listing.isApproximateLocation,
            }}
            className="mt-6 rounded-2xl border border-border bg-muted/30 p-4"
          />

          {sourceUrl && (
            <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              {(listing as typeof listing & { officialUrl?: string }).officialUrl
                ? translations[language].officialWebsite
                : (language === 'nl' ? 'Bekijk de bronwebsite' : 'View source website')}
              <ExternalLink className="h-4 w-4" />
            </a>
            {(listing as typeof listing & { sourcePageUrl?: string }).sourcePageUrl && (
              <a
                href={(listing as typeof listing & { sourcePageUrl?: string }).sourcePageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted"
              >
                {translations[language].sourcePage}
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            </div>
          )}
        </article>
      </main>
    </div>
  );
}

function EventDetailRoute() {
  const [, params] = useRoute('/activiteiten/den-haag/:eventId');
  const requestedSection = new URLSearchParams(window.location.search).get('section');
  const listingSection: Exclude<ListingSection, 'social-map'> = requestedSection === 'businesses'
    || requestedSection === 'food-drink'
    ? requestedSection
    : DEFAULT_START_SECTION;
  return <EventDetailView eventId={params?.eventId ?? ''} listingSection={listingSection} />;
}

type AppScreen =
  | { kind: 'search' }
  | { kind: 'discovery'; locationId: string; neighborhood?: string; postcode?: string; listingSection: ListingSection }
  | { kind: 'saved' };

function getInitialListingSection(): ListingSection {
  const requestedSection = new URLSearchParams(window.location.search).get('section');
  return requestedSection === 'businesses'
    || requestedSection === 'food-drink'
    || requestedSection === 'social-map'
    ? requestedSection
    : DEFAULT_START_SECTION;
}

function MainApp({ initialLocationId }: { initialLocationId?: string } = {}) {
  const [, navigate] = useLocation();
  const [screen, setScreen] = useState<AppScreen>(() =>
    initialLocationId
      ? {
          kind: 'discovery',
          locationId: initialLocationId,
          neighborhood: new URLSearchParams(window.location.search).get('neighborhood') || undefined,
          postcode: new URLSearchParams(window.location.search).get('postcode') || undefined,
          listingSection: getInitialListingSection(),
        }
      : { kind: 'search' },
  );
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('buurtplaza-language') === 'nl' ? 'nl' : 'en';
  });
  const [userRole, setUserRole] = useState<UserRole>(() => {
    if (typeof window === 'undefined') return 'user';
    return window.localStorage.getItem(USER_ROLE_STORAGE_KEY) === 'designer' ? 'designer' : 'user';
  });
  const {
    savedIds,
    savedMarkers,
    savedEventAlerts,
    recordEventRefresh,
    toggle,
    savedCount,
  } = useSavedPlaces();

  useEffect(() => {
    persistLanguage(language);
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(USER_ROLE_STORAGE_KEY, userRole);
  }, [userRole]);

  if (screen.kind === 'saved') {
    return (
      <SavedView
        language={language}
        savedMarkers={savedMarkers}
        eventAlerts={savedEventAlerts}
        onEventRefresh={recordEventRefresh}
        onToggle={toggle}
        onBack={() => setScreen({ kind: 'search' })}
      />
    );
  }

  if (screen.kind === 'discovery') {
    return (
      <DiscoveryState
        language={language}
        locationId={screen.locationId}
        listingSection={screen.listingSection}
        initialNeighborhood={screen.neighborhood}
        initialPostcode={screen.postcode}
        restorePrevious={new URLSearchParams(window.location.search).get('restore') === '1'}
        onBack={() => {
          setScreen({ kind: 'search' });
          navigate('/');
        }}
        onLanguageChange={setLanguage}
        userRole={userRole}
        onUserRoleChange={setUserRole}
        savedIds={savedIds}
        onToggle={toggle}
        onEventRefresh={recordEventRefresh}
        onViewSaved={() => setScreen({ kind: 'saved' })}
      />
    );
  }

  return (
    <SearchState
      language={language}
      userRole={userRole}
      onUserRoleChange={setUserRole}
      onLanguageChange={setLanguage}
      onSearch={(locId, neighborhood, listingSection = DEFAULT_START_SECTION, postcode) => {
        setScreen({
          kind: 'discovery',
          locationId: locId,
          neighborhood,
          postcode,
          listingSection,
        });

        if (locId === 'dhg') {
          const params = new URLSearchParams();
          if (neighborhood) params.set('neighborhood', neighborhood);
          if (postcode) params.set('postcode', postcode);
          if (listingSection !== 'events') params.set('section', listingSection);
          const query = params.toString();
          navigate(`/activiteiten/den-haag${query ? `?${query}` : ''}`);
        }
      }}
      savedCount={savedCount}
      onViewSaved={() => setScreen({ kind: 'saved' })}
    />
  );
}

function CaptureRoute() {
  const [language] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('buurtplaza-language') === 'nl' ? 'nl' : 'en';
  });
  return <CaptureView language={language} />;
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRouter>
        <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/">
            <MainApp />
          </Route>
          <Route path="/activiteiten/den-haag/:eventId" component={EventDetailRoute} />
          <Route path="/activiteiten/den-haag">
            <MainApp initialLocationId="dhg" />
          </Route>
          <Route path="/capture" component={CaptureRoute} />
          <Route path="/bronnen" component={SourceDirectoryView} />
          <Route path="/buurt" component={CommunityFeedView} />
          <Route path="/beoordelen" component={EventReviewRoute} />
          <Route path="/beoordelen/sociale-kaart" component={SocialMapReviewRoute} />
          <Route path="/beoordelen/community" component={CommunityModerationView} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/account/voorkeuren" component={AccountPreferencesPage} />
          <Route path="/account/privacy" component={AccountPrivacyPage} />
          <Route path="/account/*?" component={AccountPage} />
          <Route path="/bedrijf-aanmelden" component={BusinessOnboardingPage} />
          <Route path="/bedrijf-zoeken" component={BusinessLookupPage} />
          <Route path="/bedrijf-nieuw" component={BusinessDraftPage} />
          <Route path="/nieuws" component={NewsFeedView} />
          <Route path="/nieuws/:id" component={NewsArticleView} />
          <Route path="/deals" component={DealsView} />
          <Route path="/bedrijf/:slug" component={BusinessProfileView} />
          <Route path="/bedrijf-claim" component={BusinessClaimView} />
          <Route path="/correctie" component={ListingCorrectionView} />
          <Route path="/mijn-bedrijf" component={MyBusinessWorkspace} />
          <Route path="/mijn-bedrijf/:id/profiel" component={BusinessRevisionPage} />
          <Route path="/redactie/bedrijven" component={BusinessModerationView} />
          <Route>
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-2">404</h1>
                <p className="text-muted-foreground">Page not found</p>
              </div>
            </div>
          </Route>
        </Switch>
          <Toaster />
        </QueryClientProvider>
      </ClerkProviderWithRouter>
    </WouterRouter>
  );
}

function readBrowserSavedMarkers(): Map<string, Marker> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();
    const parsed = JSON.parse(stored) as unknown[];
    if (parsed.length === 0) return new Map();
    if (typeof parsed[0] === 'string') {
      const ids = new Set(parsed as string[]);
      return new Map(MARKERS.filter(marker => ids.has(marker.id)).map(marker => [marker.id, marker]));
    }
    return new Map((parsed as Marker[]).map(marker => [marker.id, marker]));
  } catch {
    return new Map();
  }
}

function readBrowserEventAlerts(): SavedEventAlert[] {
  try {
    const stored = localStorage.getItem(EVENT_ALERTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown[];
    return parsed
      .filter(isRecord)
      .map(alertFromAccountSnapshot)
      .filter((alert): alert is SavedEventAlert => alert !== null);
  } catch {
    return [];
  }
}

function useSavedPlaces() {
  const [savedMarkers, setSavedMarkers] = useState<Map<string, Marker>>(readBrowserSavedMarkers);
  const [savedEventAlerts, setSavedEventAlerts] = useState<SavedEventAlert[]>(readBrowserEventAlerts);
  const [accountHydrationStatus, setAccountHydrationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [syncRetry, setSyncRetry] = useState(0);
  const [hydrationRetry, setHydrationRetry] = useState(0);
  const clerkAuth = useAuth();
  const testAuthEnabled = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('e2eSavedEventsAuth') === '1';
  const [testAuth, setTestAuth] = useState<SavedEventsTestAuth | null>(
    testAuthEnabled ? (window.__savedEventsTestAuth ?? { userId: null }) : null,
  );
  useEffect(() => {
    if (!testAuthEnabled) return;
    const updateTestAuth = () => setTestAuth(window.__savedEventsTestAuth ?? { userId: null });
    window.__setSavedEventsTestAuth = (auth) => {
      window.__savedEventsTestAuth = auth;
      window.dispatchEvent(new Event(SAVED_EVENTS_TEST_AUTH_EVENT));
    };
    window.addEventListener(SAVED_EVENTS_TEST_AUTH_EVENT, updateTestAuth);
    return () => {
      window.removeEventListener(SAVED_EVENTS_TEST_AUTH_EVENT, updateTestAuth);
      delete window.__setSavedEventsTestAuth;
    };
  }, [testAuthEnabled]);
  const userId = testAuthEnabled ? testAuth?.userId ?? null : clerkAuth.userId;
  const isSignedIn = testAuthEnabled ? Boolean(userId) : clerkAuth.isSignedIn;
  const getToken = testAuthEnabled
    ? async () => userId ? `e2e-token:${userId}` : null
    : clerkAuth.getToken;
  const activeAccountUserRef = useRef<string | null>(null);
  const accountHydratedRef = useRef(false);
  const syncInFlightUserRef = useRef<string | null>(null);
  const pendingEventUpsertsRef = useRef<Map<string, Marker>>(new Map());
  const pendingAlertUpsertsRef = useRef<Map<string, SavedEventAlert>>(new Map());
  const pendingRemovedEventIdsRef = useRef<Set<string>>(new Set());
  const pendingRemovedAlertFingerprintsRef = useRef<Set<string>>(new Set());

  const clearPendingOperations = useCallback(() => {
    pendingEventUpsertsRef.current.clear();
    pendingAlertUpsertsRef.current.clear();
    pendingRemovedEventIdsRef.current.clear();
    pendingRemovedAlertFingerprintsRef.current.clear();
  }, []);

  const syncForAccount = useCallback(async (payload: SavedEventsSyncRequest) => {
    const token = await getToken();
    if (!token) throw new Error('A Clerk session token is required to sync saved events.');
    return syncSavedEvents(payload, { headers: { Authorization: `Bearer ${token}` } });
  }, [getToken]);

  const applyAccountState = useCallback((accountUserId: string, accountState: SavedEventsResponse) => {
    if (activeAccountUserRef.current !== accountUserId) return;
    setSavedMarkers((previous) => {
      const next = new Map([...previous].filter(([, marker]) => !isEventMarker(marker)));
      for (const event of accountState.events) {
        const marker = markerFromAccountSnapshot(event.eventId, event.snapshot);
        if (marker) next.set(marker.id, marker);
      }
      for (const [eventId, marker] of pendingEventUpsertsRef.current) next.set(eventId, marker);
      for (const eventId of pendingRemovedEventIdsRef.current) next.delete(eventId);
      return next;
    });
    setSavedEventAlerts(() => {
      const next = new Map<string, SavedEventAlert>();
      for (const item of accountState.alerts) {
        const alert = alertFromAccountSnapshot(item.alert);
        if (alert) next.set(alert.fingerprint, alert);
      }
      for (const [fingerprint, alert] of pendingAlertUpsertsRef.current) next.set(fingerprint, alert);
      for (const fingerprint of pendingRemovedAlertFingerprintsRef.current) next.delete(fingerprint);
      for (const eventId of pendingRemovedEventIdsRef.current) {
        for (const [fingerprint, alert] of next) {
          if (alert.eventId === eventId) next.delete(fingerprint);
        }
      }
      return [...next.values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    });
  }, []);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setAccountHydrationStatus('idle');
      if (activeAccountUserRef.current !== null) {
        activeAccountUserRef.current = null;
        accountHydratedRef.current = false;
        syncInFlightUserRef.current = null;
        clearPendingOperations();
        setSavedMarkers(readBrowserSavedMarkers());
        setSavedEventAlerts(readBrowserEventAlerts());
      }
      return;
    }
    if (activeAccountUserRef.current === userId && accountHydratedRef.current) return;

    const accountChanged = activeAccountUserRef.current !== userId;
    activeAccountUserRef.current = userId;
    accountHydratedRef.current = false;
    syncInFlightUserRef.current = null;
    setAccountHydrationStatus('loading');

    const browserMarkers = readBrowserSavedMarkers();
    const browserAlerts = readBrowserEventAlerts();
    const migrationEvents = [...browserMarkers.values()].filter(isEventMarker);
    const migrationEventIds = new Set(migrationEvents.map(event => event.id));
    if (accountChanged) {
      clearPendingOperations();
      setSavedMarkers(browserMarkers);
      setSavedEventAlerts(browserAlerts.filter(alert => migrationEventIds.has(alert.eventId)));
    }

    let cancelled = false;
    syncForAccount({
      migrationEvents: migrationEvents.map(marker => ({
        eventId: marker.id,
        snapshot: marker as unknown as Record<string, unknown>,
      })),
      alerts: browserAlerts
        .filter(alert => migrationEventIds.has(alert.eventId))
        .map(alert => ({
          eventId: alert.eventId,
          fingerprint: alert.fingerprint,
          alert: alert as unknown as Record<string, unknown>,
        })),
    }).then((accountState) => {
      if (cancelled || activeAccountUserRef.current !== userId) return;
      applyAccountState(userId, accountState);
      const anonymousOnly = [...browserMarkers.values()].filter(marker => !isEventMarker(marker));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(anonymousOnly));
        localStorage.setItem(EVENT_ALERTS_STORAGE_KEY, '[]');
      } catch {
        // Account data is already safe on the server even if browser cleanup is unavailable.
      }
      accountHydratedRef.current = true;
      setAccountHydrationStatus('ready');
      setSyncRetry(value => value + 1);
    }).catch(() => {
      if (!cancelled) {
        setAccountHydrationStatus('error');
        window.setTimeout(() => setHydrationRetry(value => value + 1), 1500);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    applyAccountState,
    clearPendingOperations,
    hydrationRetry,
    isSignedIn,
    syncForAccount,
    userId,
  ]);

  useEffect(() => {
    if (isSignedIn) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedMarkers.values()]));
      localStorage.setItem(EVENT_ALERTS_STORAGE_KEY, JSON.stringify(savedEventAlerts));
    } catch {
      // localStorage unavailable; anonymous state still works in-memory.
    }
  }, [isSignedIn, savedEventAlerts, savedMarkers]);

  useEffect(() => {
    if (!isSignedIn
      || !userId
      || activeAccountUserRef.current !== userId
      || !accountHydratedRef.current
      || syncInFlightUserRef.current === userId) {
      return;
    }
    const eventEntries = [...pendingEventUpsertsRef.current.entries()];
    const alertEntries = [...pendingAlertUpsertsRef.current.entries()];
    const removedEventIds = [...pendingRemovedEventIdsRef.current];
    const removedAlertFingerprints = [...pendingRemovedAlertFingerprintsRef.current];
    if (eventEntries.length === 0
      && alertEntries.length === 0
      && removedEventIds.length === 0
      && removedAlertFingerprints.length === 0) {
      return;
    }

    syncInFlightUserRef.current = userId;
    let syncSucceeded = false;
    syncForAccount({
      events: eventEntries.map(([eventId, marker]) => ({
        eventId,
        snapshot: marker as unknown as Record<string, unknown>,
      })),
      alerts: alertEntries.map(([fingerprint, alert]) => ({
        eventId: alert.eventId,
        fingerprint,
        alert: alert as unknown as Record<string, unknown>,
      })),
      removeEventIds: removedEventIds,
      removeAlertFingerprints: removedAlertFingerprints,
    }).then((accountState) => {
      if (activeAccountUserRef.current !== userId) return;
      syncSucceeded = true;
      for (const [eventId, marker] of eventEntries) {
        if (pendingEventUpsertsRef.current.get(eventId) === marker) {
          pendingEventUpsertsRef.current.delete(eventId);
        }
      }
      for (const [fingerprint, alert] of alertEntries) {
        if (pendingAlertUpsertsRef.current.get(fingerprint) === alert) {
          pendingAlertUpsertsRef.current.delete(fingerprint);
        }
      }
      for (const eventId of removedEventIds) pendingRemovedEventIdsRef.current.delete(eventId);
      for (const fingerprint of removedAlertFingerprints) {
        pendingRemovedAlertFingerprintsRef.current.delete(fingerprint);
      }
      applyAccountState(userId, accountState);
    }).catch(() => {
      window.setTimeout(() => setSyncRetry(value => value + 1), 1500);
    }).finally(() => {
      if (syncInFlightUserRef.current === userId) syncInFlightUserRef.current = null;
      if (syncSucceeded && activeAccountUserRef.current === userId) {
        setSyncRetry(value => value + 1);
      }
    });
  }, [
    applyAccountState,
    isSignedIn,
    savedEventAlerts,
    savedMarkers,
    syncForAccount,
    syncRetry,
    userId,
  ]);

  const toggle = useCallback((marker: Marker) => {
    setSavedMarkers(prev => {
      const next = new Map(prev);
      const removing = next.has(marker.id);
      if (removing) {
        next.delete(marker.id);
      } else {
        next.set(marker.id, marker);
      }

      if (isEventMarker(marker) && isSignedIn && userId === activeAccountUserRef.current) {
        if (removing) {
          pendingEventUpsertsRef.current.delete(marker.id);
          pendingRemovedEventIdsRef.current.add(marker.id);
        } else {
          pendingRemovedEventIdsRef.current.delete(marker.id);
          pendingEventUpsertsRef.current.set(marker.id, marker);
        }
      }

      if (removing) {
        setSavedEventAlerts(alerts => {
          const removedAlerts = alerts.filter(alert => alert.eventId === marker.id);
          if (isSignedIn && userId === activeAccountUserRef.current) {
            for (const alert of removedAlerts) {
              pendingAlertUpsertsRef.current.delete(alert.fingerprint);
              pendingRemovedAlertFingerprintsRef.current.add(alert.fingerprint);
            }
          }
          return alerts.filter(alert => alert.eventId !== marker.id);
        });
      }
      return next;
    });
  }, [isSignedIn, userId]);

  const recordEventRefresh = useCallback((currentEvents: Marker[]) => {
    setSavedEventAlerts(previousAlerts => {
      const nextAlerts = [...previousAlerts];
      let addedAlert = false;

      for (const current of currentEvents) {
        const saved = savedMarkers.get(current.id);
        if (!saved || current.source !== 'source_scan') continue;

        const changedFields = changedPlanningFields(saved, current);
        const kind: SavedEventAlert['kind'] | null = current.isCancelled && saved.isCancelled !== true
          ? 'cancelled'
          : changedFields.length > 0
            ? 'changed'
            : null;
        if (!kind) continue;

        const fingerprint = eventAlertFingerprint(current, kind);
        if (nextAlerts.some(alert => alert.fingerprint === fingerprint)) continue;

        const alert: SavedEventAlert = {
          fingerprint,
          eventId: current.id,
          kind,
          changedFields,
          eventName: current.name,
          sourceName: current.sourceName,
          sourceUrl: current.sourceUrl,
          startsAt: current.startsAt,
          openingTimes: current.openingTimes,
          venue: current.venue ?? current.address,
          priceType: current.priceType,
          priceText: current.priceText,
          detectedAt: new Date().toISOString(),
        };
        nextAlerts.unshift(alert);
        if (isSignedIn && userId === activeAccountUserRef.current) {
          pendingRemovedAlertFingerprintsRef.current.delete(fingerprint);
          pendingAlertUpsertsRef.current.set(fingerprint, alert);
        }
        addedAlert = true;
      }

      return addedAlert ? nextAlerts.slice(0, 50) : previousAlerts;
    });
  }, [isSignedIn, savedMarkers, userId]);

  const savedIds = useMemo(() => new Set(savedMarkers.keys()), [savedMarkers]);
  const savedCount = savedMarkers.size;
  const savedStateStatus = !clerkAuth.isLoaded || accountHydrationStatus === 'loading'
    ? 'loading'
    : accountHydrationStatus;

  return { savedIds, savedMarkers, savedEventAlerts, recordEventRefresh, toggle, savedCount, savedStateStatus };
}

function SavedView({
  language,
  savedMarkers,
  eventAlerts,
  onEventRefresh,
  onToggle,
  onBack,
}: {
  language: Language;
  savedMarkers: Map<string, Marker>;
  eventAlerts: SavedEventAlert[];
  onEventRefresh: (markers: Marker[]) => void;
  onToggle: (marker: Marker) => void;
  onBack: () => void;
}) {
  const t = translations[language];
  const savedList = [...savedMarkers.values()];
  const activeEventAlerts = eventAlerts.filter(alert => savedMarkers.has(alert.eventId));
  const hasSavedSourceEvents = savedList.some(marker => marker.source === 'source_scan');
  const currentEventsQuery = useGetListings(
    { cityId: 'dhg', section: 'events', language },
    {
      query: {
        enabled: hasSavedSourceEvents,
        queryKey: getGetListingsQueryKey({ cityId: 'dhg', section: 'events', language }),
      },
    },
  );

  useEffect(() => {
    if (!currentEventsQuery.data) return;
    const refreshedEvents = currentEventsQuery.data.listings
      .filter(listing => listing.source === 'source_scan') as unknown as Marker[];
    onEventRefresh(refreshedEvents);
  }, [currentEventsQuery.data, onEventRefresh]);

  const byCategory: Record<Category, Marker[]> = {
    Museums:       savedList.filter(m => m.category === 'Museums'),
    Tours:         savedList.filter(m => m.category === 'Tours'),
    Family:        savedList.filter(m => m.category === 'Family'),
    Entertainment: savedList.filter(m => m.category === 'Entertainment'),
    Outdoors:      savedList.filter(m => m.category === 'Outdoors'),
    Markets:       savedList.filter(m => m.category === 'Markets'),
    Businesses:    savedList.filter(m => m.category === 'Businesses'),
    'Food & Drink': savedList.filter(m => m.category === 'Food & Drink'),
    'Social map': savedList.filter(m => m.category === 'Social map'),
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-xl border-b border-border px-6 py-5 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t.backToSearch}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{t.savedPlaces}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t.savedCount(savedList.length)}</p>
          </div>
          <div className="ml-auto p-2.5 bg-primary/10 rounded-xl">
            <BookmarkCheck className="w-5 h-5 text-primary" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {savedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
              <Bookmark className="w-9 h-9 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">{t.noSavedPlaces}</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
              {t.noSavedPlacesDescription}
            </p>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-bold text-sm hover:bg-primary/90 transition-colors"
            >
              {t.exploreNeighbourhoods}
            </button>
          </div>
        ) : (
          <div>
            {activeEventAlerts.length > 0 && (
              <section
                aria-labelledby="saved-event-alerts-title"
                className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 shadow-sm"
              >
                <div className="mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-700" aria-hidden="true" />
                  <h2 id="saved-event-alerts-title" className="font-extrabold text-foreground">
                    {t.savedEventAlerts}
                  </h2>
                  <span className="ml-auto rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white">
                    {activeEventAlerts.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {activeEventAlerts.map(alert => {
                    const changedLabels = alert.changedFields.map(field => ({
                      time: t.eventAlertTime,
                      venue: t.eventAlertVenue,
                      price: t.eventAlertPrice,
                    })[field]);
                    return (
                      <article
                        key={alert.fingerprint}
                        role="alert"
                        data-testid="saved-event-alert"
                        className="rounded-xl border border-amber-500/30 bg-card p-4"
                      >
                        <h3 className="font-bold text-foreground">
                          {alert.kind === 'cancelled'
                            ? t.savedEventCancelled(alert.eventName)
                            : t.savedEventChanged(alert.eventName)}
                        </h3>
                        {alert.kind === 'changed' && changedLabels.length > 0 && (
                          <p className="mt-1 text-sm font-semibold text-amber-800">
                            {changedLabels.join(' · ')}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">{t.savedEventAlertDescription}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
                          <Link
                            href={`/activiteiten/den-haag/${encodeURIComponent(alert.eventId)}?section=events`}
                            className="text-primary hover:underline"
                          >
                            {t.viewCurrentEvent}
                          </Link>
                          {alert.sourceUrl && (
                            <a
                              href={alert.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-secondary hover:underline"
                            >
                              {t.viewEventSource}
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {ALL_CATEGORIES.map(cat => (
              <SavedCategorySection
                key={cat}
                language={language}
                category={cat}
                markers={byCategory[cat]}
                onRemove={onToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function EventReviewRoute() {
  const { isEditor, isLoaded, isSignedIn } = useEditorAccess();
  if (!isLoaded) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }
  if (!isEditor) {
    return (
      <main data-testid="status-editor-access-denied" className="flex min-h-screen items-center justify-center bg-background px-5 text-center">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
          <p className="text-sm font-bold text-primary">Restricted workspace</p>
          <h1 className="mt-2 text-2xl font-extrabold text-foreground">Editor access required</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This review queue is available only to accounts with an editor role.
          </p>
          <Link data-testid="link-return-from-editor-access-denied" href="/" className="mt-6 inline-flex text-sm font-bold text-primary hover:underline">
            Return to Buurtplaza
          </Link>
        </div>
      </main>
    );
  }
  return (
    <EventReviewView />
  );
}

function SocialMapReviewRoute() {
  const { isEditor, isLoaded, isSignedIn } = useEditorAccess();
  if (!isLoaded) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }
  if (!isEditor) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-center">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
          <p className="text-sm font-bold text-primary">Restricted workspace</p>
          <h1 className="mt-2 text-2xl font-extrabold text-foreground">Editor access required</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This source-review queue is available only to accounts with an editor role.
          </p>
          <Link href="/" className="mt-6 inline-flex text-sm font-bold text-primary hover:underline">
            Return to Buurtplaza
          </Link>
        </div>
      </main>
    );
  }
  return <SocialMapReviewView />;
}

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#f97316',
    colorForeground: '#1e293b',
    colorMutedForeground: '#64748b',
    colorDanger: '#dc2626',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#1e293b',
    colorNeutral: '#d7dee8',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'w-[440px] max-w-full overflow-hidden rounded-2xl bg-white',
    card: '!border-0 !bg-transparent !shadow-none !rounded-none',
    footer: '!border-0 !bg-transparent !shadow-none !rounded-none',
    headerTitle: 'text-slate-800 font-bold',
    headerSubtitle: 'text-slate-500',
    socialButtonsBlockButtonText: 'text-slate-700',
    formFieldLabel: 'text-slate-700',
    footerActionLink: 'text-orange-600',
    footerActionText: 'text-slate-500',
    dividerText: 'text-slate-500',
    identityPreviewEditButton: 'text-orange-600',
    formFieldSuccessText: 'text-emerald-700',
    alertText: 'text-red-700',
    logoBox: 'mb-2',
    logoImage: 'h-9 w-auto',
    socialButtonsBlockButton: 'border-slate-200',
    formButtonPrimary: 'bg-orange-500 hover:bg-orange-600',
    formFieldInput: 'border-slate-200 text-slate-800',
    footerAction: 'bg-slate-50',
    dividerLine: 'bg-slate-200',
    alert: 'border-red-200 bg-red-50',
    otpCodeFieldInput: 'border-slate-200',
    formFieldRow: 'gap-1',
    main: 'gap-5',
  },
};

/**
 * Where Clerk sends a user after it finishes sign-in, sign-up, or verification.
 * The `terug` parameter is validated against a local allowlist, so an external
 * or unknown destination silently becomes the account page. New accounts go
 * through the optional preference step first when accounts are enabled;
 * otherwise the legacy research registration stays the landing step.
 */
function useClerkRedirects() {
  const search = useSearch();
  const returnPath = resolveReturnPath(search, '');
  const signInTarget = `${basePath}${returnPath}`;
  const signUpTarget = featureFlags.accounts
    ? `${basePath}${withReturnPath('/account/voorkeuren', returnPath)}`
    : `${basePath}/onboarding`;
  const carry = search ? `?${search}` : '';
  return {
    signInTarget,
    signUpTarget,
    signInUrl: `${basePath}/sign-in${carry}`,
    signUpUrl: `${basePath}/sign-up${carry}`,
  };
}

/**
 * Clerk renders an empty card for a stale verification step
 * (`/sign-up/verify-email-address`) when no sign-up is in progress, for example
 * a bookmarked or history entry reopened after the code was already used.
 * Send those visitors back to the start of sign-up so the recovery path is visible.
 */
function useStaleSignUpStepRecovery() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const isVerificationStep = /^\/sign-up\/verify-/.test(location);
  useEffect(() => {
    if (!isVerificationStep || !isLoaded || !clerk.loaded || isSignedIn) return;
    if (clerk.client?.signUp?.id) return;
    navigate(`/sign-up${search ? `?${search}` : ''}`, { replace: true });
  }, [isVerificationStep, isLoaded, isSignedIn, clerk, search, navigate]);
}

function SignUpPage() {
  const redirects = useClerkRedirects();
  useStaleSignUpStepRecovery();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={redirects.signInUrl}
        forceRedirectUrl={redirects.signUpTarget}
        signInForceRedirectUrl={redirects.signInTarget}
      />
    </div>
  );
}

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function ApiAuthTokenBridge() {
  const { getToken, isSignedIn, userId } = useAccountAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setAuthTokenGetter(null);
      return;
    }

    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn, userId]);

  return null;
}

function ClerkProviderWithRouter({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  // Clerk renders its own sign-in/sign-up/error cards, so it needs the app language
  // explicitly; otherwise expired-link and code errors stay English-only.
  const language = useStoredLanguage();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={clerkLocalizationFor(language)}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(carryReturnPath(stripBase(to), window.location.search))}
      routerReplace={(to) => setLocation(carryReturnPath(stripBase(to), window.location.search), { replace: true })}
    >
      <ApiAuthTokenBridge />
      {children}
    </ClerkProvider>
  );
}

function SignInPage() {
  const redirects = useClerkRedirects();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={redirects.signUpUrl}
        forceRedirectUrl={redirects.signInTarget}
        signUpForceRedirectUrl={redirects.signUpTarget}
      />
    </div>
  );
}
