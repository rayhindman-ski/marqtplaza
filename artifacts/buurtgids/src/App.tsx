import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Route, Switch, Router as WouterRouter, Link, Redirect, useLocation, useRoute } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { 
  Search, MapPinOff, ArrowLeft,
  Map as MapIcon, List, Clock, Newspaper,
  Globe2, Bookmark, BookmarkCheck, X, ChevronDown, ChevronUp,
  ScanSearch, RefreshCw, WifiOff, Radio, MapPinned,
  Landmark, Route as RouteIcon, Baby, Building2, Coffee, Gamepad2, Waves, ShoppingBag, ExternalLink
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Toaster } from '@/components/ui/sonner';
import { setAuthTokenGetter, useGetListings } from '@workspace/api-client-react';
import {
  LOCATIONS,
  MARKERS,
  ALL_CATEGORIES,
  BUSINESS_CATEGORIES,
  EVENT_CATEGORIES,
  type BusinessCategory,
  type Category,
  type ListingSource,
  type Marker,
} from './lib/data';
import { GoogleMapView } from './components/GoogleMapView';
import CaptureView from './pages/CaptureView';
import SourceDirectoryView from './pages/SourceDirectoryView';
import EventReviewView from './pages/EventReviewView';
import NewsFeedView from './pages/NewsFeedView';
import NewsArticleView from './pages/NewsArticleView';
import { useEditorAccess } from './lib/editorAccess';
import {
  getLocationName,
  getMarkerCopy,
  getBusinessCategoryName,
  getListingSourceName,
  LANGUAGE_OPTIONS,
  translations,
  type Language,
} from './lib/i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
type ListingSection = 'events' | 'businesses' | 'food-drink';
type FilterSubcategory = Exclude<Category, 'Businesses'> | BusinessCategory;
const TOP_LEVEL_SECTIONS: ListingSection[] = ['events', 'businesses', 'food-drink'];

function topLevelStateFor(section: ListingSection): Record<ListingSection, boolean> {
  return Object.fromEntries(
    TOP_LEVEL_SECTIONS.map((candidate) => [candidate, candidate === section]),
  ) as Record<ListingSection, boolean>;
}

function subcategoryStateFor(section: ListingSection): Record<FilterSubcategory, boolean> {
  const active = subcategoriesForTopLevel(section);
  const eventSubcategories = EVENT_CATEGORIES.filter(
    (category): category is Exclude<Category, 'Businesses'> => category !== 'Businesses',
  );
  return Object.fromEntries(
    [...eventSubcategories, ...BUSINESS_CATEGORIES].map((category) => [category, active.includes(category)]),
  ) as Record<FilterSubcategory, boolean>;
}

function subcategoriesForTopLevel(section: ListingSection): FilterSubcategory[] {
  if (section === 'events') {
    return EVENT_CATEGORIES.filter(
      (category): category is Exclude<Category, 'Businesses'> => category !== 'Businesses',
    );
  }
  if (section === 'businesses') {
    return BUSINESS_CATEGORIES.filter((subcategory) => subcategory !== 'Food & Drink');
  }
  return ['Food & Drink'];
}

function topLevelForMarker(marker: Marker): ListingSection {
  if (marker.category === 'Businesses') return 'businesses';
  if (marker.category === 'Food & Drink') return 'food-drink';
  return 'events';
}

function subcategoryLabelFor(subcategory: FilterSubcategory, language: Language): string {
  return EVENT_CATEGORIES.includes(subcategory as Category)
    ? translations[language].categories[subcategory as Category]
    : getBusinessCategoryName(subcategory as BusinessCategory, language);
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
    <label className="absolute right-5 top-5 z-40 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur-md sm:right-7 sm:top-7">
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

function ReferenceCategoryNav({
  language,
  onThingsToDo,
  onSectionSelect,
}: {
  language: Language;
  onThingsToDo: () => void;
  onSectionSelect: (section: ListingSection) => void;
}) {
  const t = translations[language];

  return (
    <nav
      aria-label="Categories"
      className="absolute left-0 top-0 z-30 hidden w-full border-b border-border/70 bg-card/85 px-6 py-4 backdrop-blur-md lg:block"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-7">
        {t.navCategories.map((category) => {
          if (category.id === 'news') {
            return (
              <Link
                href="/nieuws"
                key={category.id}
                className="text-sm font-extrabold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {category.label}
              </Link>
            );
          }
          return (
            <button
              type="button"
              key={category.id}
              onClick={() => {
                if (category.id === 'things-to-do') onThingsToDo();
                if (category.id === 'locals' || category.id === 'shopping') onSectionSelect('businesses');
                if (category.id === 'food-drink') onSectionSelect('food-drink');
              }}
              aria-haspopup={category.id === 'things-to-do' ? 'dialog' : undefined}
              className="text-sm font-extrabold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {category.label}
            </button>
          );
        })}
        <Link
          href="/capture"
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ScanSearch className="h-4 w-4" />
          {t.capture}
        </Link>
        <Link
          href="/bronnen"
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Radio className="h-4 w-4" />
          Sources
        </Link>
        <Search className="h-5 w-5 text-foreground" aria-label={t.explore} />
      </div>
    </nav>
  );
}

function SaveButton({ saved, onToggle }: { saved: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onToggle}
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
function SearchState({
  language,
  onLanguageChange,
  onSearch,
  savedCount,
  onViewSaved,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSearch: (locId: string, neighborhood?: string, section?: ListingSection) => void;
  savedCount: number;
  onViewSaved: () => void;
}) {
  const popularNeighborhoods: Record<string, string[]> = {
    dhg: [
      'Centrum',
      'Scheveningen',
      'Zeeheldenkwartier',
      'Duinoord',
      'Statenkwartier',
      'Benoordenhout',
      'Bezuidenhout',
      'Regentessekwartier',
    ],
  };
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [activityChooserOpen, setActivityChooserOpen] = useState(false);
  const t = translations[language];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError(t.emptySearch);
      return;
    }
    const normalizedQuery = query.trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');
    const normalizedPostcode = normalizedQuery.replace(/\s/g, '');
    const matched = LOCATIONS.find(l =>
      l.name.toLocaleLowerCase('nl-NL') === normalizedQuery ||
      l.nameNl.toLocaleLowerCase('nl-NL') === normalizedQuery ||
      l.postcodes.some((postcode) => normalizedPostcode.startsWith(postcode))
    );

    if (matched) {
      setError('');
      onSearch(matched.id);
    } else {
      setError(t.locationNotFound);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden bg-background">
      <ReferenceCategoryNav
        language={language}
        onSectionSelect={(section) => onSearch('dhg', undefined, section)}
        onThingsToDo={() => {
          setActivityChooserOpen(true);
          setSelectedCityId(null);
          requestAnimationFrame(() => {
            document.getElementById('activity-area-picker')?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          });
        }}
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

      {/* Mobile shortcuts (the desktop category nav is hidden below lg) */}
      <div className="lg:hidden absolute bottom-8 left-6 z-10 flex items-center gap-2 flex-wrap">
        <Link href="/nieuws" className="flex items-center gap-2 px-4 py-2.5 bg-card/90 backdrop-blur-sm border border-border/60 rounded-full text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary shadow-md hover:shadow-lg transition-all">
          <Newspaper className="w-4 h-4 text-primary" />
          <span>Nieuws</span>
        </Link>
        <Link href="/capture" className="flex items-center gap-2 px-4 py-2.5 bg-card/90 backdrop-blur-sm border border-border/60 rounded-full text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary shadow-md hover:shadow-lg transition-all">
          <ScanSearch className="w-4 h-4 text-primary" />
          <span>{t.capture}</span>
        </Link>
        <Link href="/bronnen" className="flex items-center gap-2 px-4 py-2.5 bg-card/90 backdrop-blur-sm border border-border/60 rounded-full text-sm font-bold text-foreground hover:border-primary/50 hover:text-primary shadow-md hover:shadow-lg transition-all">
          <Radio className="w-4 h-4 text-primary" />
          <span>Sources</span>
        </Link>
      </div>

      <div className="z-10 w-full max-w-6xl text-center space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
        <div className="space-y-5">
          <img
            src="/marqtplaza-logo.png"
            alt="marqtplaza.com — The Digital Village Square"
            className="h-[100px] md:h-[140px] w-auto mx-auto"
          />
          <p className="text-xl text-muted-foreground font-medium max-w-md mx-auto leading-relaxed">
            {t.searchDescription}
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

        <div id="activity-area-picker" className="w-full pt-6" tabIndex={-1}>
          {activityChooserOpen && (
            <div
              role="dialog"
              aria-label="Choose an area for activities"
              className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-left shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <p className="text-sm font-extrabold text-foreground">Choose an area for things to do</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Select a city, then choose a neighbourhood or explore the whole city.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-4 uppercase tracking-widest font-bold">{t.popularDestinations}</p>
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
                  onClick={() => setSelectedCityId(loc.id)}
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
                  <div className="grid w-full grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {neighborhoodOptions.map((neighborhood) => (
                      <button
                        key={neighborhood}
                        type="button"
                        onClick={() => onSearch(loc.id, neighborhood)}
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
  const DetailIcon = DETAIL_ICONS[marker.category];
  const copy = getMarkerCopy(marker, language);
  const sourceLabel = marker.sourceName
    ?? (marker.source ? getListingSourceName(marker.source, language) : undefined);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "w-full text-left p-4 rounded-2xl border transition-all duration-300 relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent",
        isSelected
          ? "bg-primary/5 border-primary shadow-[0_4px_20px_-4px_rgba(243,108,33,0.15)]"
          : "bg-card border-border hover:border-primary/40 hover:shadow-md"
      )}
    >
      {isSelected && (
        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary rounded-l-2xl" />
      )}
      <div className="flex items-start gap-4">
        <div className={cn(
          "p-3 rounded-xl shrink-0 transition-colors",
          isSelected ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-start justify-between mb-1 gap-2">
            <h3 className={cn(
              "font-bold text-base truncate transition-colors",
              isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
            )}>{marker.name}</h3>
            <SaveButton saved={isSaved} onToggle={onSave} />
          </div>
           {(marker.businessCategory || sourceLabel) && (
             <div className="mb-3 flex flex-wrap items-center gap-1.5">
               {marker.businessCategory && (
                 <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                   {getBusinessCategoryName(marker.businessCategory, language)}
                 </span>
               )}
               {sourceLabel && (
                 <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                   {sourceLabel}
                 </span>
               )}
             </div>
           )}
          <p className="text-muted-foreground text-sm mb-3 line-clamp-2 leading-relaxed">{copy.description}</p>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary bg-secondary/5 w-fit px-2.5 py-1 rounded-md">
            <DetailIcon className="w-3.5 h-3.5 opacity-70" />
            {copy.details}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <MapPinned className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Lat {marker.lat.toFixed(5)} · Lng {marker.lng.toFixed(5)}</span>
            </div>
            {marker.sourceUrl && (
              <a
                href={marker.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline shrink-0"
              >
                Source <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
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
  locationId,
  listingSection,
  initialNeighborhood,
  onBack,
  onLanguageChange,
  savedIds,
  onToggle,
  onViewSaved,
}: {
  language: Language;
  locationId: string;
  listingSection: ListingSection;
  initialNeighborhood?: string;
  onBack: () => void;
  onLanguageChange: (language: Language) => void;
  savedIds: Set<string>;
  onToggle: (marker: Marker) => void;
  onViewSaved: () => void;
}) {
  const location = LOCATIONS.find(l => l.id === locationId);
  const t = translations[language];
  const [topLevelCategories, setTopLevelCategories] = useState<Record<ListingSection, boolean>>(
    () => topLevelStateFor(listingSection),
  );
  const [subcategories, setSubcategories] = useState<Record<FilterSubcategory, boolean>>(
    () => subcategoryStateFor(listingSection),
  );
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    initialNeighborhood ? [initialNeighborhood] : [],
  );
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');

  // Fetch each top-level section so the checkbox filters can be combined.
  const eventsQuery = useGetListings({ cityId: locationId, section: 'events' });
  const businessesQuery = useGetListings({ cityId: locationId, section: 'businesses' });
  const foodDrinkQuery = useGetListings({ cityId: locationId, section: 'food-drink' });
  const listingQueries = {
    events: eventsQuery,
    businesses: businessesQuery,
    'food-drink': foodDrinkQuery,
  };

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

  const toggleSubcategory = (subcategory: FilterSubcategory) => {
    setSubcategories((previous) => ({
      ...previous,
      [subcategory]: !previous[subcategory],
    }));
    setSelectedMarker(null);
  };

  const handleMarkerClick = (id: string) => {
    const detailUrl = `/activiteiten/den-haag/${encodeURIComponent(id)}?section=${listingSection}`;
    const detailWindow = window.open(detailUrl, '_blank', 'noopener,noreferrer');
    if (detailWindow) {
      detailWindow.opener = null;
    }
  };

  const toggleNeighborhood = (neighborhood: string) => {
    setSelectedNeighborhoods((current) =>
      current.includes(neighborhood)
        ? current.filter((item) => item !== neighborhood)
        : [...current, neighborhood],
    );
    setSelectedMarker(null);
  };

  useEffect(() => {
    setTopLevelCategories(topLevelStateFor(listingSection));
    setSubcategories(subcategoryStateFor(listingSection));
    setSelectedMarker(null);
  }, [listingSection]);

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
  }, [selectedMarker, view]);

  const selectedTopLevelSections = TOP_LEVEL_SECTIONS.filter((section) => topLevelCategories[section]);
  const selectedQueries = selectedTopLevelSections.map((section) => listingQueries[section]);
  const selectedData = selectedQueries
    .map((query) => query.data)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const selectedListings = selectedData.flatMap((result) => result.listings);
  const visibleSubcategories = Array.from(new Set(
    selectedTopLevelSections.flatMap(subcategoriesForTopLevel),
  ));

  // Use API data when available, falling back to coordinate-complete static activities for events.
  const fallbackMarkers = selectedTopLevelSections.includes('events')
    ? MARKERS.filter((marker) => marker.locationId === location.id)
    : [];
  const allMarkers: Marker[] = (selectedListings.length > 0 ? selectedListings : fallbackMarkers).map(l => {
    return {
      id: l.id,
      locationId: l.locationId,
      category: l.category as Category,
      name: l.name,
      description: l.description,
      x: l.x,
      y: l.y,
      details: l.details,
      lat: l.lat,
      lng: l.lng,
      sourceUrl: (l as { sourceUrl?: string }).sourceUrl,
        businessCategory: (l as { businessCategory?: BusinessCategory }).businessCategory,
        source: (l as { source?: ListingSource }).source,
        sourceName: (l as { sourceName?: string }).sourceName,
    };
  });

  const selectedAreas = selectedNeighborhoods
    .map((neighborhood) => location.neighborhoodCoords[neighborhood])
    .filter((area): area is { lat: number; lng: number; zoom: number } => Boolean(area));
  const filteredMarkers = allMarkers.filter((marker) => {
    const markerTopLevel = topLevelForMarker(marker);
    if (!topLevelCategories[markerTopLevel]) return false;
    const markerSubcategory = marker.businessCategory
      ?? (marker.category === 'Businesses' ? undefined : marker.category as FilterSubcategory);
    if (
      markerTopLevel !== 'events'
      && visibleSubcategories.length > 0
      && (!markerSubcategory || !subcategories[markerSubcategory])
    ) {
      return false;
    }
    if (markerTopLevel === 'events' && markerSubcategory && !subcategories[markerSubcategory]) {
      return false;
    }
    if (selectedAreas.length === 0) return true;
    return selectedAreas.some((area) => getDistanceKm(marker.lat, marker.lng, area.lat, area.lng) <= 2.5);
  });
  const isLoading = selectedQueries.some((query) => query.isLoading);
  const isError = selectedQueries.some((query) => query.isError) && selectedListings.length === 0;
  const refetch = () => Promise.all(selectedQueries.map((query) => query.refetch()));
  const isLive = selectedData.some((result) => result.source === 'live');
  const isGooglePlaces = selectedData.some((result) => result.source === 'google_places');
  const hasOpenStreetMap = selectedListings.some((listing) => listing.source === 'openstreetmap');
  const isFallback = selectedData.some((result) => result.source === 'fallback');
  const isCurated = selectedData.some((result) => result.source === 'curated');
  const fallbackMessage = selectedData
    .filter((result) => result.source === 'fallback' && result.message)
    .map((result) => result.message)
    .join(' ');

  const savedCount = savedIds.size;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />

      {/* Sidebar List */}
      <div className={cn(
        "w-full md:w-[420px] h-full flex flex-col bg-card/95 backdrop-blur-xl md:bg-card border-r border-border shadow-2xl z-20 absolute md:relative transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        view === 'list' ? "translate-y-0" : "translate-y-full md:translate-y-0"
      )}>
        <div className="max-h-[48vh] shrink-0 overflow-y-auto border-b border-border bg-card p-6 md:max-h-none md:overflow-visible">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={onBack} 
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t.backToSearch}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{getLocationName(location, language)}</h2>
              <p className="text-sm text-muted-foreground font-medium">{t.discoveriesNearby(filteredMarkers.length)}</p>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {t.topLevelCategories}
              </p>
              <div
                role="group"
                aria-label={t.topLevelCategories}
                className="space-y-1"
              >
                {TOP_LEVEL_SECTIONS.map((section) => {
                  const isChecked = topLevelCategories[section];
                  const label = section === 'events'
                    ? (language === 'nl' ? 'Evenementen' : 'Events')
                    : section === 'businesses'
                      ? t.categories.Businesses
                      : t.categories['Food & Drink'];
                  return (
                    <label
                      key={section}
                      className={cn(
                        "flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition-all",
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
            </div>
            {visibleSubcategories.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {t.subcategories}
                </p>
                <div
                  role="group"
                  aria-label={t.subcategories}
                  className="max-h-48 space-y-1 overflow-y-auto pr-1"
                >
                  {visibleSubcategories.map((subcategory) => {
                    const isChecked = subcategories[subcategory];
                    return (
                      <label
                        key={subcategory}
                        className={cn(
                          "flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition-all",
                          isChecked
                            ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_3px_10px_-6px_rgba(243,108,33,0.8)]"
                            : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSubcategory(subcategory)}
                          className="h-3.5 w-3.5 shrink-0 accent-primary"
                        />
                        <span>{subcategoryLabelFor(subcategory, language)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-border/70 pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t.neighborhoods}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNeighborhoods(location.neighborhoods);
                    setSelectedMarker(null);
                  }}
                  className="rounded-lg border border-primary/35 bg-primary/5 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t.selectAllNeighborhoods}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNeighborhoods([]);
                    setSelectedMarker(null);
                  }}
                  className="rounded-lg border border-border/70 bg-card/70 px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t.clearNeighborhoodSelection}
                </button>
              </div>
            </div>
            <div
              role="group"
              aria-label={t.neighborhoods}
              data-neighborhood-list
              className="max-h-48 overflow-x-hidden overflow-y-auto rounded-xl border border-border/50 bg-muted/20 p-2 pr-1"
            >
              <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
                <label
                  className={cn(
                      "flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-bold transition-all",
                    selectedNeighborhoods.length === 0
                       ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_3px_10px_-6px_rgba(243,108,33,0.8)]"
                       : "border-border/60 bg-card/70 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedNeighborhoods.length === 0}
                    onChange={() => {
                      setSelectedNeighborhoods([]);
                      setSelectedMarker(null);
                    }}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                   <span className="min-w-0 truncate whitespace-nowrap">{t.allNeighborhoods}</span>
                </label>
                {location.neighborhoods.map((neighborhood) => {
                  const isChecked = selectedNeighborhoods.includes(neighborhood);
                  return (
                    <label
                      key={neighborhood}
                      className={cn(
                        "flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition-all",
                        isChecked
                          ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_3px_10px_-6px_rgba(243,108,33,0.8)]"
                          : "border-border/60 bg-card/70 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleNeighborhood(neighborhood)}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 truncate whitespace-nowrap">{neighborhood}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {selectedNeighborhoods.length > 0
                ? t.neighborhoodsSelected(selectedNeighborhoods.length)
                : t.allNeighborhoods}
            </p>
          </div>
        </div>

        {/* Data source badge */}
        {!isLoading && (
          <div className="px-6 pb-2 flex items-center gap-2">
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
            {isFallback && fallbackMessage && (
              <span className="text-xs text-muted-foreground">{fallbackMessage}</span>
            )}
            {isGooglePlaces && (
              <span className="w-full text-xs text-muted-foreground">{t.listingsCoverageNote}</span>
            )}
          </div>
        )}

        <div data-event-list className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="flex flex-col gap-4 pb-20 md:pb-0">
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
                data-selected={selectedMarker === m.id || undefined}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <MarkerCard
                  language={language}
                  marker={m}
                  isSelected={selectedMarker === m.id}
                  isSaved={savedIds.has(m.id)}
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
                  {t.noDiscoveriesDescription}
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile close list button */}
        <div className="md:hidden p-4 border-t border-border bg-card/95 backdrop-blur-xl mt-auto shrink-0 pb-safe">
          <button 
            onClick={() => setView('map')} 
            className="w-full py-3.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-bold transition-colors"
          >
            {t.backToMap}
          </button>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative h-full w-full overflow-hidden bg-background">
        <GoogleMapView
          language={language}
          locationId={location.id}
          selectedNeighborhoods={selectedNeighborhoods}
          markers={filteredMarkers}
          selectedMarkerId={selectedMarker}
          savedIds={savedIds}
          onMarkerClick={handleMarkerClick}
        />

        {/* Mobile Toggle Overlay */}
        <div className="md:hidden absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setView(v => v === 'map' ? 'list' : 'map')}
            className="bg-foreground text-background px-6 py-3.5 rounded-full shadow-2xl font-bold flex items-center gap-2.5 hover:scale-105 active:scale-95 transition-transform"
          >
            {view === 'map' ? <List className="w-5 h-5" /> : <MapIcon className="w-5 h-5" />}
            <span>{view === 'map' ? t.showList : t.showMap}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EventDetailView({ eventId, listingSection = 'events' }: { eventId: string; listingSection?: ListingSection }) {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useGetListings({ cityId: 'dhg', section: listingSection });
  const listing = data?.listings.find((item) => item.id === decodeURIComponent(eventId));
  const language: Language = typeof window !== 'undefined' && window.localStorage.getItem('buurtplaza-language') === 'nl'
    ? 'nl'
    : 'en';

  if (isLoading) {
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

  if (isError || !listing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MapPinOff className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {language === 'nl' ? 'Activiteit niet gevonden' : 'Event not found'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {language === 'nl' ? 'Deze activiteit is niet meer beschikbaar.' : 'This activity is no longer available.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/activiteiten/den-haag')}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background"
          >
            <ArrowLeft className="h-4 w-4" />
            {language === 'nl' ? 'Terug naar ontdekken' : 'Back to discoveries'}
          </button>
        </div>
      </div>
    );
  }

  const category = listing.category as Category;
  const Icon = CATEGORY_ICONS[category] ?? MapPinOff;
  const sourceUrl = (listing as typeof listing & { sourceUrl?: string }).sourceUrl;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/90 px-5 py-4 shadow-sm backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/activiteiten/den-haag')}
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
          </div>

          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              {language === 'nl' ? 'Bekijk de bronwebsite' : 'View source website'}
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </article>
      </main>
    </div>
  );
}

function EventDetailRoute() {
  const [, params] = useRoute('/activiteiten/den-haag/:eventId');
  const requestedSection = new URLSearchParams(window.location.search).get('section');
  const listingSection: ListingSection = requestedSection === 'businesses' || requestedSection === 'food-drink'
    ? requestedSection
    : 'events';
  return <EventDetailView eventId={params?.eventId ?? ''} listingSection={listingSection} />;
}

type AppScreen =
  | { kind: 'search' }
  | { kind: 'discovery'; locationId: string; neighborhood?: string; listingSection: ListingSection }
  | { kind: 'saved' };
function MainApp({ initialLocationId }: { initialLocationId?: string } = {}) {
  const [screen, setScreen] = useState<AppScreen>(() =>
    initialLocationId ? { kind: 'discovery', locationId: initialLocationId, listingSection: 'events' } : { kind: 'search' },
  );
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('buurtplaza-language') === 'nl' ? 'nl' : 'en';
  });
  const { savedIds, savedMarkers, toggle, savedCount } = useSavedPlaces();

  useEffect(() => {
    window.localStorage.setItem('buurtplaza-language', language);
    document.documentElement.lang = language;
  }, [language]);

  if (screen.kind === 'saved') {
    return (
      <SavedView
        language={language}
        savedMarkers={savedMarkers}
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
        onBack={() => setScreen({ kind: 'search' })}
        onLanguageChange={setLanguage}
        savedIds={savedIds}
        onToggle={toggle}
        onViewSaved={() => setScreen({ kind: 'saved' })}
      />
    );
  }

  return (
    <SearchState
      language={language}
      onLanguageChange={setLanguage}
      onSearch={(locId, neighborhood, listingSection = 'events') => setScreen({
        kind: 'discovery',
        locationId: locId,
        neighborhood,
        listingSection,
      })}
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
            <MainApp initialLocationId="dhg" />
          </Route>
          <Route path="/activiteiten/den-haag/:eventId" component={EventDetailRoute} />
          <Route path="/activiteiten/den-haag">
            <MainApp initialLocationId="dhg" />
          </Route>
          <Route path="/capture" component={CaptureRoute} />
          <Route path="/bronnen" component={SourceDirectoryView} />
          <Route path="/beoordelen" component={EventReviewRoute} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/nieuws" component={NewsFeedView} />
          <Route path="/nieuws/:id" component={NewsArticleView} />
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

function useSavedPlaces() {
  const [savedMarkers, setSavedMarkers] = useState<Map<string, Marker>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return new Map();
      // Support both the old format (string[]) and the new format (Marker[])
      const parsed = JSON.parse(stored) as unknown[];
      if (parsed.length === 0) return new Map();
      if (typeof parsed[0] === 'string') {
        // Legacy: IDs only – look up in static MARKERS
        const ids = new Set(parsed as string[]);
        const map = new Map<string, Marker>();
        MARKERS.filter(m => ids.has(m.id)).forEach(m => map.set(m.id, m));
        return map;
      }
      // New format: full marker objects
      const map = new Map<string, Marker>();
      (parsed as Marker[]).forEach(m => map.set(m.id, m));
      return map;
    } catch {
      return new Map();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedMarkers.values()]));
    } catch {
      // localStorage unavailable; state still works in-memory
    }
  }, [savedMarkers]);

  const toggle = useCallback((marker: Marker) => {
    setSavedMarkers(prev => {
      const next = new Map(prev);
      if (next.has(marker.id)) next.delete(marker.id);
      else next.set(marker.id, marker);
      return next;
    });
  }, []);

  const savedIds = useMemo(() => new Set(savedMarkers.keys()), [savedMarkers]);
  const savedCount = savedMarkers.size;

  return { savedIds, savedMarkers, toggle, savedCount };
}

function SavedView({
  language,
  savedMarkers,
  onToggle,
  onBack,
}: {
  language: Language;
  savedMarkers: Map<string, Marker>;
  onToggle: (marker: Marker) => void;
  onBack: () => void;
}) {
  const t = translations[language];
  const savedList = [...savedMarkers.values()];
  const byCategory: Record<Category, Marker[]> = {
    Museums:       savedList.filter(m => m.category === 'Museums'),
    Tours:         savedList.filter(m => m.category === 'Tours'),
    Family:        savedList.filter(m => m.category === 'Family'),
    Entertainment: savedList.filter(m => m.category === 'Entertainment'),
    Outdoors:      savedList.filter(m => m.category === 'Outdoors'),
    Markets:       savedList.filter(m => m.category === 'Markets'),
    Businesses:    savedList.filter(m => m.category === 'Businesses'),
    'Food & Drink': savedList.filter(m => m.category === 'Food & Drink'),
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

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function ApiAuthTokenBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setAuthTokenGetter(null);
      return;
    }

    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn]);

  return null;
}

function ClerkProviderWithRouter({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ApiAuthTokenBridge />
      {children}
    </ClerkProvider>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}
