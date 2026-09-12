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
                        onChange={() => toggleNeighborhood(neighborhood)}
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
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300">
                <WifiOff className="w-3 h-3" />
                {language === 'nl' ? 'Geen lokale gegevens' : 'No local data'}
              </span>
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
                   {topLevelCategories.events && eventEvidence && allMarkers.length === 0
                     ? eventEvidence.message
                     : t.noDiscoveriesDescription}
                </p>
              </div>
            )}
          </div>
          </FilterFrame>
        </div>
        
        {/* Mobile close list button */}
        <div className="sticky bottom-0 md:hidden p-4 border-t border-border bg-card/95 backdrop-blur-xl mt-auto shrink-0 pb-safe">
          <button 
            onClick={() => setView('map')} 
            className="w-full py-3.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-bold transition-colors"
          >
            {t.backToMap}
          </button>
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

      {/* Map Area */}
      <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-background">
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
    </div>
  );
}

function EventDetailView({ eventId, listingSection = 'events' }: { eventId: string; listingSection?: ListingSection }) {
  const [, navigate] = useLocation();
  const language: Language = typeof window !== 'undefined' && window.localStorage.getItem('buurtplaza-language') === 'nl'
    ? 'nl'
    : 'en';
  const { data, isLoading, isError } = useGetListings({ cityId: 'dhg', section: listingSection, language });
  const listing = data?.listings.find((item) => item.id === decodeURIComponent(eventId));

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
  const listingSection: ListingSection = requestedSection === 'businesses'
    || requestedSection === 'food-drink'
    || requestedSection === 'social-map'
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
    window.localStorage.setItem('buurtplaza-language', language);
    document.documentElement.lang = language;
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
          <Route path="/account/*?" component={AccountPage} />
          <Route path="/bedrijf-aanmelden" component={BusinessOnboardingPage} />
          <Route path="/nieuws" component={NewsFeedView} />
          <Route path="/nieuws/:id" component={NewsArticleView} />
          <Route path="/deals" component={DealsView} />
          <Route path="/bedrijf/:slug" component={BusinessProfileView} />
          <Route path="/bedrijf-claim" component={BusinessClaimView} />
          <Route path="/mijn-bedrijf" component={MyBusinessWorkspace} />
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
      setSyncRetry(value => value + 1);
    }).catch(() => {
      if (!cancelled) {
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

  return { savedIds, savedMarkers, savedEventAlerts, recordEventRefresh, toggle, savedCount };
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

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/onboarding`}
      />
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
