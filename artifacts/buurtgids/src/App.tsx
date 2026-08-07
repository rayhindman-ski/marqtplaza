import React, { useState, useEffect } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { 
  Search, Compass, MapPinOff, ArrowLeft, Briefcase, 
  Calendar, Sparkles, Map as MapIcon, List, Clock, Tag, Globe2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LOCATIONS, MARKERS, type Category, type Location, type Marker } from './lib/data';
import {
  getLocationName,
  getMarkerCopy,
  LANGUAGE_OPTIONS,
  translations,
  type Language,
} from './lib/i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

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

function ReferenceCategoryNav({ language }: { language: Language }) {
  const t = translations[language];

  return (
    <nav
      aria-label={language === 'nl' ? 'Categorieën' : 'Categories'}
      className="absolute left-0 top-0 z-30 hidden w-full border-b border-border/70 bg-card/85 px-6 py-4 backdrop-blur-md lg:block"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-7">
        {t.navCategories.map((category) => (
          <button
            type="button"
            key={category.id}
            className="text-sm font-extrabold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {category.label}
          </button>
        ))}
        <Search className="h-5 w-5 text-foreground" aria-label={t.explore} />
      </div>
    </nav>
  );
}

function SearchState({
  language,
  onLanguageChange,
  onSearch,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSearch: (locId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const t = translations[language];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError(t.emptySearch);
      return;
    }
    const matched = LOCATIONS.find(l =>
      l.name.toLowerCase() === query.toLowerCase().trim() ||
      l.postcodes.includes(query.trim())
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
      <ReferenceCategoryNav language={language} />
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
      {/* Decorative background */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/60 via-background to-background" />
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyIiBjeT0iMiIgcj0iMSIgZmlsbD0iIzAwMDAwMCIgZmlsbC1vcGFjaXR5PSIwLjAzIi8+PC9zdmc+')] mix-blend-multiply pointer-events-none" />
      
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="z-10 max-w-xl w-full text-center space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
        <div className="space-y-5">
          <div className="inline-flex items-center justify-center p-3.5 bg-card shadow-sm border border-border/50 rounded-2xl mb-2">
            <Compass className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground">
            buurt<span className="text-primary">plaza.nl</span>
          </h1>
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

        <div className="pt-6">
          <p className="text-xs text-muted-foreground mb-4 uppercase tracking-widest font-bold">{t.popularDestinations}</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {LOCATIONS.map(loc => (
              <button
                key={loc.id}
                onClick={() => onSearch(loc.id)}
                className="px-4 py-2 bg-card/80 backdrop-blur-sm border border-border/60 rounded-full text-sm font-semibold text-foreground hover:border-primary/50 hover:text-primary transition-all shadow-sm hover:shadow-md"
              >
                {getLocationName(loc, language)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SchematicMap({ locationId }: { locationId: string }) {
  const loc = LOCATIONS.find(l => l.id === locationId);
  if (!loc) return null;

  const cityLabels = {
    amsterdam: [
      { text: 'Jordaan', x: 250, y: 400 },
      { text: 'De Pijp', x: 600, y: 800 },
      { text: 'Oud-West', x: 200, y: 650 }
    ],
    rotterdam: [
      { text: 'Kop van Zuid', x: 600, y: 550 },
      { text: 'Kralingen', x: 800, y: 300 },
      { text: 'Delfshaven', x: 300, y: 450 }
    ],
    utrecht: [
      { text: 'Wittevrouwen', x: 650, y: 350 },
      { text: 'Lombok', x: 250, y: 500 },
      { text: 'Oudwijk', x: 700, y: 650 }
    ],
    denhaag: [
      { text: 'Scheveningen', x: 350, y: 250 },
      { text: 'Statenkwartier', x: 450, y: 450 },
      { text: 'Schilderswijk', x: 650, y: 700 }
    ],
    eindhoven: [
      { text: 'Strijp-S', x: 350, y: 400 },
      { text: 'Woensel', x: 600, y: 250 },
      { text: 'Stratum', x: 650, y: 750 }
    ]
  };

  return (
    <div className="absolute inset-0 bg-accent/30 z-0 overflow-hidden border-l border-border pointer-events-none" aria-hidden="true">
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" className="w-full h-full opacity-60">
        <defs>
          <pattern id="city-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" className="text-secondary/5" strokeWidth="1" />
            <path d="M 25 0 L 25 50 M 0 25 L 50 25" fill="none" stroke="currentColor" className="text-secondary/5" strokeWidth="0.5" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="12" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <rect width="1000" height="1000" fill="url(#city-grid)" />

        {/* Abstract city shapes */}
        {loc.mapType === 'amsterdam' && (
          <g fill="none" stroke="currentColor" className="text-secondary/20" strokeWidth="16" strokeLinecap="round" filter="url(#glow)">
            <path d="M 300,1200 A 600,600 0 0,1 900,-100" />
            <path d="M 100,1200 A 800,800 0 0,1 1100,-100" />
            <path d="M -100,1200 A 1000,1000 0 0,1 1300,-100" />
            <path d="M 500,1200 Q 550,800 900,400" strokeWidth="24" className="text-secondary/25" />
          </g>
        )}
        {loc.mapType === 'rotterdam' && (
          <g fill="none" stroke="currentColor" className="text-secondary/20" strokeWidth="36" filter="url(#glow)">
            <path d="M -200,800 Q 400,700 600,400 T 1300,200" className="text-secondary/25" />
            <path d="M 600,400 Q 700,600 1300,700" strokeWidth="20" />
          </g>
        )}
        {loc.mapType === 'utrecht' && (
           <g fill="none" stroke="currentColor" className="text-secondary/20" strokeWidth="20" filter="url(#glow)">
            <path d="M 400,-200 Q 500,500 300,800 T 600,1300" className="text-secondary/25" />
            <path d="M 200,200 Q 800,200 800,800 Q 200,800 200,200" strokeWidth="12" strokeDasharray="40 20" />
          </g>
        )}
        {loc.mapType === 'denhaag' && (
          <g>
            <path d="M 300,-200 Q 200,500 400,1300" fill="none" stroke="currentColor" className="text-secondary/20" strokeWidth="80" filter="url(#glow)" />
            <path d="M -200,-200 L 300,-200 Q 200,500 400,1300 L -200,1300 Z" fill="currentColor" className="text-secondary/5" />
          </g>
        )}
        {loc.mapType === 'eindhoven' && (
          <g fill="none" stroke="currentColor" className="text-secondary/20" strokeWidth="16">
            <circle cx="500" cy="500" r="350" strokeDasharray="50 30" filter="url(#glow)" />
            <path d="M 500 0 L 500 1000 M 0 500 L 1000 500" strokeWidth="8" strokeDasharray="20 20" />
            <path d="M 150 150 L 850 850 M 150 850 L 850 150" strokeWidth="6" className="text-secondary/15" />
          </g>
        )}

        {/* Neighbourhood Labels */}
        {cityLabels[loc.mapType].map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={lbl.y}
            fill="currentColor"
            className="text-secondary font-extrabold text-5xl uppercase tracking-[0.2em] pointer-events-none"
            style={{ opacity: 0.15 }}
          >
            {lbl.text}
          </text>
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}

const CATEGORY_ICONS = { Businesses: Briefcase, Events: Calendar, Specials: Sparkles };
const DETAIL_ICONS = { Businesses: Clock, Events: Calendar, Specials: Tag };

function MapPin({
  language,
  marker,
  isSelected,
  onClick,
}: {
  language: Language;
  marker: Marker;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[marker.category];
  const t = translations[language];

  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute transform -translate-x-1/2 -translate-y-1/2 z-10 group outline-none rounded-full",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        isSelected ? "scale-[1.35] z-30" : "scale-100 hover:scale-[1.15] hover:z-20"
      )}
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
       aria-label={t.selectMarker(marker.name)}
    >
      <div className={cn(
        "relative flex items-center justify-center w-11 h-11 rounded-full shadow-lg backdrop-blur-md border-2 transition-colors duration-300",
        isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card/95 text-foreground border-border group-hover:border-primary/50 group-focus-visible:ring-4 group-focus-visible:ring-primary/30",
      )}>
        <Icon className="w-5 h-5" />
        {isSelected && (
          <span className="absolute flex h-full w-full rounded-full">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
          </span>
        )}
      </div>
      <div className={cn(
        "absolute top-full mt-3 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-xl bg-card shadow-xl border border-border whitespace-nowrap pointer-events-none transition-all duration-300 ease-out",
        isSelected ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
      )}>
        <p className="text-sm font-bold text-foreground">{marker.name}</p>
         <p className="text-xs font-semibold text-muted-foreground mt-0.5">{t.categories[marker.category]}</p>
      </div>
    </button>
  );
}

function MarkerCard({
  language,
  marker,
  isSelected,
  onClick,
}: {
  language: Language;
  marker: Marker;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[marker.category];
  const DetailIcon = DETAIL_ICONS[marker.category];
  const copy = getMarkerCopy(marker, language);

  return (
    <button
      onClick={onClick}
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
          </div>
          <p className="text-muted-foreground text-sm mb-3 line-clamp-2 leading-relaxed">{copy.description}</p>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary bg-secondary/5 w-fit px-2.5 py-1 rounded-md">
            <DetailIcon className="w-3.5 h-3.5 opacity-70" />
            {copy.details}
          </div>
        </div>
      </div>
    </button>
  );
}

function DiscoveryState({
  language,
  locationId,
  onBack,
  onLanguageChange,
}: {
  language: Language;
  locationId: string;
  onBack: () => void;
  onLanguageChange: (language: Language) => void;
}) {
  const location = LOCATIONS.find(l => l.id === locationId);
  const t = translations[language];
  const [categories, setCategories] = useState<Record<Category, boolean>>({
    Businesses: true,
    Events: true,
    Specials: true
  });
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');

  if (!location) return null;

  const toggleCategory = (cat: Category) => {
    setCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    setSelectedMarker(null);
  };

  const filteredMarkers = MARKERS.filter(
    m => m.locationId === location.id && categories[m.category]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
      {/* Sidebar List */}
      <div className={cn(
        "w-full md:w-[420px] h-full flex flex-col bg-card/95 backdrop-blur-xl md:bg-card border-r border-border shadow-2xl z-20 absolute md:relative transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        view === 'list' ? "translate-y-0" : "translate-y-full md:translate-y-0"
      )}>
        <div className="p-6 border-b border-border shrink-0 bg-card">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={onBack} 
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
               aria-label={t.backToSearch}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{getLocationName(location, language)}</h2>
              <p className="text-sm text-muted-foreground font-medium">{t.discoveriesNearby(filteredMarkers.length)}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2.5">
            {(['Businesses', 'Events', 'Specials'] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                aria-pressed={categories[cat]}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  categories[cat]
                    ? "bg-foreground text-background border-foreground shadow-md"
                    : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80 hover:text-foreground"
                )}
              >
                {t.categories[cat]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="flex flex-col gap-4 pb-20 md:pb-0">
            {filteredMarkers.map((m, i) => (
              <div 
                key={m.id} 
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <MarkerCard 
                  language={language}
                  marker={m}
                  isSelected={selectedMarker === m.id} 
                  onClick={() => setSelectedMarker(m.id)} 
                />
              </div>
            ))}
            
            {filteredMarkers.length === 0 && (
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
        <SchematicMap locationId={location.id} />
        
        {filteredMarkers.map(m => (
          <MapPin
            key={m.id}
            language={language}
            marker={m}
            isSelected={selectedMarker === m.id}
            onClick={() => setSelectedMarker(m.id)}
          />
        ))}

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

// --- Main App Route ---

function MainApp() {
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'nl';
    return window.localStorage.getItem('buurtplaza-language') === 'en' ? 'en' : 'nl';
  });

  useEffect(() => {
    window.localStorage.setItem('buurtplaza-language', language);
    document.documentElement.lang = language;
  }, [language]);

  if (!activeLocationId) {
    return (
      <SearchState
        language={language}
        onLanguageChange={setLanguage}
        onSearch={setActiveLocationId}
      />
    );
  }

  return (
    <DiscoveryState 
      language={language}
      locationId={activeLocationId} 
      onBack={() => setActiveLocationId(null)} 
      onLanguageChange={setLanguage}
    />
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Switch>
        <Route path="/" component={MainApp} />
        <Route>
          <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-2">404</h1>
              <p className="text-muted-foreground">Page not found</p>
            </div>
          </div>
        </Route>
      </Switch>
    </WouterRouter>
  );
}
