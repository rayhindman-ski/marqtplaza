import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Filter,
  ListPlus,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ScanSearch,
  Tags,
} from 'lucide-react';
import {
  scanActivitySources,
  type SourceScanResult,
} from '@workspace/api-client-react';
import {
  DEN_HAAG_ACTIVITY_SOURCES,
  type SourceCoverage,
} from '../lib/denHaagSources';

const coverageClasses: Record<SourceCoverage, string> = {
  Hoog: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Gemiddeld: 'border-sky-200 bg-sky-50 text-sky-700',
  Beperkt: 'border-amber-200 bg-amber-50 text-amber-700',
};

const coverageLabels: Record<SourceCoverage, string> = {
  Hoog: 'High',
  Gemiddeld: 'Medium',
  Beperkt: 'Limited',
};

type SourceProgress = 'queued' | 'scanning' | 'complete' | 'blocked' | 'error';

export default function SourceDirectoryView() {
  const [query, setQuery] = useState('');
  const [coverage, setCoverage] = useState<SourceCoverage | 'All'>('All');
  const [model, setModel] = useState('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scanResults, setScanResults] = useState<SourceScanResult[]>([]);
  const [scanError, setScanError] = useState('');
  const [sourceProgress, setSourceProgress] = useState<Record<string, SourceProgress>>({});
  const [isScanning, setIsScanning] = useState(false);

  const models = useMemo(
    () => ['All', ...Array.from(new Set(DEN_HAAG_ACTIVITY_SOURCES.map((source) => source.model)))],
    [],
  );

  const sources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return DEN_HAAG_ACTIVITY_SOURCES.filter((source) => {
      const matchesCoverage = coverage === 'All' || source.coverage === coverage;
      const matchesModel = model === 'All' || source.model === model;
      const searchable = [
        source.name,
        source.summary,
        source.model,
        source.area,
        ...source.categories,
        ...source.examples,
      ].join(' ').toLowerCase();
      return matchesCoverage && matchesModel && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [coverage, model, query]);

  const allVisibleSelected = sources.length > 0 && sources.every((source) => selectedIds.includes(source.id));
  const scanSummary = useMemo(() => scanResults.reduce(
    (summary, scan) => ({
      pagesRead: summary.pagesRead + scan.pagesRead,
      pagesFailed: summary.pagesFailed + scan.pagesFailed,
      pagesSkipped: summary.pagesSkipped + scan.pagesSkipped,
      indexPagesRead: summary.indexPagesRead + scan.indexPagesRead,
      detailPagesRead: summary.detailPagesRead + scan.detailPagesRead,
      sitemapsRead: summary.sitemapsRead + scan.sitemapsRead,
      robotsPagesSkipped: summary.robotsPagesSkipped + scan.robotsPagesSkipped,
      crawlLimitReached: summary.crawlLimitReached || scan.crawlLimitReached,
      eventLinksRead: summary.eventLinksRead + (scan.eventLinksRead ?? scan.events.length),
      eventsCaptured: summary.eventsCaptured + (scan.eventsCaptured ?? scan.events.length),
      eventsAdded: summary.eventsAdded + scan.eventsAdded,
      eventsUpdated: summary.eventsUpdated + scan.eventsUpdated,
      eventsSkipped: summary.eventsSkipped + scan.eventsSkipped,
    }),
    {
      pagesRead: 0,
      pagesFailed: 0,
      pagesSkipped: 0,
      indexPagesRead: 0,
      detailPagesRead: 0,
      sitemapsRead: 0,
      robotsPagesSkipped: 0,
      crawlLimitReached: false,
      eventLinksRead: 0,
      eventsCaptured: 0,
      eventsAdded: 0,
      eventsUpdated: 0,
      eventsSkipped: 0,
    },
  ), [scanResults]);
  const completedSourceCount = Object.values(sourceProgress).filter((status) => status !== 'queued' && status !== 'scanning').length;
  const activeSourceNames = DEN_HAAG_ACTIVITY_SOURCES
    .filter((source) => sourceProgress[source.id] === 'scanning')
    .map((source) => source.name);

  function toggleSource(sourceId: string) {
    setSelectedIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  function toggleVisibleSources() {
    const visibleIds = sources.map((source) => source.id);
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  }

  async function scanSources(sourceIds: string[]) {
    if (sourceIds.length === 0 || isScanning) return;
    setScanError('');
    setScanResults([]);
    setIsScanning(true);
    setSourceProgress(Object.fromEntries(sourceIds.map((sourceId) => [sourceId, 'queued'])));

    let nextSourceIndex = 0;
    let failedSourceCount = 0;
    const workerCount = Math.min(2, sourceIds.length);
    const scanWorker = async () => {
      while (nextSourceIndex < sourceIds.length) {
        const sourceId = sourceIds[nextSourceIndex];
        nextSourceIndex += 1;
        setSourceProgress((current) => ({ ...current, [sourceId]: 'scanning' }));

        try {
          const response = await scanActivitySources({ sourceIds: [sourceId] });
          const scan = response.scans[0];
          if (!scan) throw new Error('No source result was returned.');
          setScanResults((current) => [...current, scan]);
          setSourceProgress((current) => ({
            ...current,
            [sourceId]: scan.status === 'blocked'
              ? 'blocked'
              : scan.status === 'error'
                ? 'error'
                : 'complete',
          }));
        } catch {
          failedSourceCount += 1;
          setSourceProgress((current) => ({ ...current, [sourceId]: 'error' }));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: workerCount }, scanWorker));
      if (failedSourceCount > 0) {
        setScanError(`${failedSourceCount} source${failedSourceCount === 1 ? '' : 's'} could not be scanned. Successful sources are still shown below.`);
      }
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-4 sm:px-7">
          <Link href="/">
            <button
              type="button"
              aria-label="Back to the home page"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">The Hague scanner</p>
            <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground sm:text-xl">Activity sources</h1>
          </div>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            24 sources reviewed
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--accent)),_transparent_62%)]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 sm:py-14">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-bold text-primary">Den Haag reference scanner</p>
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Choose sources, then scan them for events.
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Select approved Den Haag sources. Each scan follows relevant same-source event pages, captures event details, and adds new activities to the Den Haag list.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-7">
        <div className="mb-6 grid gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 focus-within:ring-2 focus-within:ring-primary/40">
            <Search className="h-4 w-4 text-primary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by source, activity, or theme"
              className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3">
            <Filter className="h-4 w-4 text-primary" />
            <span className="sr-only">Filter by coverage</span>
            <select
              value={coverage}
              onChange={(event) => setCoverage(event.target.value as SourceCoverage | 'All')}
              className="w-full bg-transparent py-3 text-sm font-semibold outline-none"
            >
              <option>All</option>
              <option value="Hoog">High</option>
              <option value="Gemiddeld">Medium</option>
              <option value="Beperkt">Limited</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3">
            <Tags className="h-4 w-4 text-primary" />
            <span className="sr-only">Filter by source type</span>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full bg-transparent py-3 text-sm font-semibold outline-none"
            >
              {models.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-foreground">{sources.length} of {DEN_HAAG_ACTIVITY_SOURCES.length} sources shown</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => scanSources(DEN_HAAG_ACTIVITY_SOURCES.map((source) => source.id))}
              disabled={isScanning}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              Scan all {DEN_HAAG_ACTIVITY_SOURCES.length} sources
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-foreground">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleSources}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Select shown
            </label>
            <span className="text-xs font-semibold text-muted-foreground">{selectedIds.length} selected</span>
          </div>
        </div>

        {sources.length > 0 ? (
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="max-h-[480px] divide-y divide-border overflow-y-auto">
              {sources.map((source) => {
                const isSelected = selectedIds.includes(source.id);
                const progress = sourceProgress[source.id];
                const scanResult = scanResults.find((result) => result.sourceId === source.id);
                const completedButtonLabel = scanResult
                  ? scanResult.eventsAdded > 0 || scanResult.eventsUpdated === 0
                    ? `${scanResult.eventsAdded} added`
                    : `0 added · ${scanResult.eventsUpdated} updated`
                  : 'Scan';
                return (
                  <article key={source.id} className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSource(source.id)}
                        aria-label={`Select ${source.name}`}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-base font-extrabold text-foreground">{source.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{source.model} · {source.area}</span>
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {source.categories.slice(0, 3).map((category) => (
                            <span key={category} className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                              {category}
                            </span>
                          ))}
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${coverageClasses[source.coverage]}`}>
                            {coverageLabels[source.coverage]} coverage
                          </span>
                        </span>
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => scanSources([source.id])}
                        disabled={isScanning}
                        className="inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {progress === 'scanning' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
                        {progress === 'scanning' ? 'Scanning…' : progress === 'queued' ? 'Queued' : completedButtonLabel}
                      </button>
                      {progress && (
                        <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${
                          progress === 'complete'
                            ? 'bg-emerald-50 text-emerald-700'
                            : progress === 'blocked' || progress === 'error'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-primary/10 text-primary'
                        }`}>
                          {progress === 'complete' ? 'Complete' : progress}
                        </span>
                      )}
                      <a
                        href={source.activityUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${source.name}`}
                        className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 border-t border-border bg-muted/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                The scanner only reads approved public source pages and relevant same-source activity links. It never follows links to other domains.
              </p>
              <button
                type="button"
                onClick={() => scanSources(selectedIds)}
                disabled={selectedIds.length === 0 || isScanning}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isScanning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                {isScanning ? `Scanning ${completedSourceCount} of ${Object.keys(sourceProgress).length}…` : `Scan selected (${selectedIds.length})`}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
            <h2 className="mb-2 text-xl font-extrabold text-foreground">No matching source found</h2>
            <p className="text-sm text-muted-foreground">Adjust the search term or filters to see the full inventory.</p>
          </div>
        )}

        {isScanning && (
          <div role="status" aria-live="polite" className="mt-5 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 text-primary">
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" />
            <div className="min-w-0">
              <p className="font-extrabold">
                Deep-scanning {completedSourceCount} of {Object.keys(sourceProgress).length} selected source{Object.keys(sourceProgress).length === 1 ? '' : 's'}…
              </p>
              <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                {activeSourceNames.length > 0
                  ? `Reading event and detail pages from ${activeSourceNames.join(', ')}.`
                  : 'Preparing the next approved source.'} Captured events are added to the Den Haag activity list as each source completes.
              </p>
            </div>
          </div>
        )}

        {scanError && (
          <p role="alert" className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            {scanError}
          </p>
        )}

        {scanResults.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-primary">Latest scan</p>
                <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Source scan results</h2>
              </div>
              <span className="text-right text-xs font-semibold text-muted-foreground">
                <span className="block text-sm font-extrabold text-foreground">
                  {scanSummary.eventsCaptured} event{scanSummary.eventsCaptured === 1 ? '' : 's'} captured
                </span>
                {scanSummary.eventsAdded} new · {scanSummary.eventsUpdated} updated · {scanResults.length} source{scanResults.length === 1 ? '' : 's'} scanned
              </span>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <BookOpenCheck className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-2xl font-extrabold leading-none text-foreground">{scanSummary.pagesRead}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">Pages read</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <ScanSearch className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-2xl font-extrabold leading-none text-foreground">{scanSummary.eventLinksRead}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">Links examined</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-2xl font-extrabold leading-none text-foreground">{scanSummary.eventsCaptured}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">Events captured</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <ListPlus className="h-5 w-5 shrink-0 text-secondary" />
                <div>
                  <p className="text-2xl font-extrabold leading-none text-foreground">{scanSummary.eventsAdded}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">Added to list</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <RefreshCw className="h-5 w-5 shrink-0 text-sky-600" />
                <div>
                  <p className="text-2xl font-extrabold leading-none text-foreground">{scanSummary.eventsUpdated}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">Updated</p>
                </div>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-secondary/20 bg-secondary/5 px-4 py-3">
              <p className="text-sm font-semibold text-secondary">
                {scanSummary.eventsAdded} new event{scanSummary.eventsAdded === 1 ? '' : 's'} added to the Den Haag activity list.
                {scanSummary.eventsUpdated > 0 ? ` ${scanSummary.eventsUpdated} existing event${scanSummary.eventsUpdated === 1 ? '' : 's'} refreshed.` : ''}
                {scanSummary.pagesFailed > 0 ? ` ${scanSummary.pagesFailed} page${scanSummary.pagesFailed === 1 ? '' : 's'} could not be read.` : ''}
                {scanSummary.crawlLimitReached ? ` The scan reached a safe coverage limit; ${scanSummary.pagesSkipped} queued page${scanSummary.pagesSkipped === 1 ? '' : 's'} were skipped.` : ''}
              </p>
              <Link href="/activiteiten/den-haag">
                <button type="button" className="rounded-xl bg-secondary px-3 py-2 text-xs font-extrabold text-secondary-foreground transition-colors hover:bg-secondary/90">
                  View Den Haag activities
                </button>
              </Link>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {scanResults.map((scan) => (
                <article key={scan.sourceId} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-foreground">{scan.sourceName}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{scan.message}</p>
                    </div>
                    <span className={scan.status === 'found' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700' : 'rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground'}>
                      {scan.status === 'found' ? `${scan.events.length} found` : scan.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-muted/45 px-3 py-2 text-center sm:grid-cols-5">
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{scan.pagesRead}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pages</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{scan.eventLinksRead}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Links</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{scan.eventsCaptured}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Captured</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{scan.eventsAdded}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Added</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{scan.eventsUpdated}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Updated</p>
                    </div>
                  </div>
                  <p className="mb-3 rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Coverage: {scan.indexPagesRead} index page{scan.indexPagesRead === 1 ? '' : 's'} · {scan.detailPagesRead} detail page{scan.detailPagesRead === 1 ? '' : 's'} · {scan.sitemapsRead} sitemap{scan.sitemapsRead === 1 ? '' : 's'}
                    {scan.pagesSkipped > 0 ? ` · ${scan.pagesSkipped} page${scan.pagesSkipped === 1 ? '' : 's'} skipped at the safe limit` : ''}
                    {scan.robotsPagesSkipped > 0 ? ` · ${scan.robotsPagesSkipped} page${scan.robotsPagesSkipped === 1 ? '' : 's'} protected by robots.txt` : ''}
                  </p>
                  {scan.events.length > 0 ? (
                    <ul className="space-y-2">
                      {scan.events.slice(0, 12).map((event) => (
                        <li key={event.url}>
                          <a href={event.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 text-sm font-semibold text-primary hover:underline">
                            <span>
                              <span className="block">{event.title}</span>
                              {(event.startsAt || event.venue) && (
                                <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                                  {[event.startsAt?.replace('T', ' ').slice(0, 16), event.venue].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          </a>
                        </li>
                      ))}
                      {scan.events.length > 12 && (
                        <li className="text-xs font-semibold text-muted-foreground">
                          + {scan.events.length - 12} more captured event{scan.events.length === 13 ? '' : 's'} — open the source to browse them all.
                        </li>
                      )}
                    </ul>
                  ) : (
                    <a href={scan.scannedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                      Open source manually
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        <aside className="mt-8 rounded-3xl border border-secondary/20 bg-secondary/5 p-5 text-sm leading-relaxed text-secondary">
          <strong>Scan transparency.</strong> Some websites may block automated access or require a dedicated API. A blocked source is reported clearly; it is never silently treated as having no events.
        </aside>
      </section>
    </main>
  );
}