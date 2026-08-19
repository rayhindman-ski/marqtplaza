import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  Search,
  ShieldCheck,
  Tags,
} from 'lucide-react';
import {
  DEN_HAAG_ACTIVITY_SOURCES,
  type ActivitySource,
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

function SourceCard({ source }: { source: ActivitySource }) {
  return (
    <article className="group flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">
            {source.model}
          </p>
          <h2 className="truncate text-xl font-extrabold tracking-tight text-foreground">{source.name}</h2>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${coverageClasses[source.coverage]}`}>
          {coverageLabels[source.coverage]} coverage
        </span>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{source.summary}</p>

      <div className="mb-4 grid gap-2 rounded-2xl bg-muted/55 p-3 text-xs">
        <div className="flex items-start gap-2 text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span><strong className="text-foreground">Area:</strong> {source.area}</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span><strong className="text-foreground">Freshness:</strong> {source.freshness}</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <Tags className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span><strong className="text-foreground">Scope:</strong> {source.activityCount}</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {source.categories.map((category) => (
          <span key={category} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {category}
          </span>
        ))}
      </div>

      <div className="mt-auto border-t border-border/70 pt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Examples</p>
        <p className="mb-3 text-xs leading-relaxed text-foreground">{source.examples.join(' · ')}</p>
        {source.note && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            {source.note}
          </p>
        )}
        <a
          href={source.activityUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-primary transition-colors hover:text-primary/75"
        >
          View source
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

export default function SourceDirectoryView() {
  const [query, setQuery] = useState('');
  const [coverage, setCoverage] = useState<SourceCoverage | 'All'>('All');
  const [model, setModel] = useState('All');

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
            <p className="mb-3 text-sm font-bold text-primary">Initial inventory · reviewed August 19, 2026</p>
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Where can you find reliable activities in The Hague?
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              This inventory separates live calendars, bookable activities, and editorial inspiration.
              That makes it clear which sources are useful for today&apos;s plans and which are better for timeless trip ideas.
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

        <div className="mb-5 flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-foreground">{sources.length} of {DEN_HAAG_ACTIVITY_SOURCES.length} sources shown</p>
          <p className="hidden text-xs text-muted-foreground sm:block">Only activities with confirmed The Hague coverage are included.</p>
        </div>

        {sources.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => <SourceCard key={source.id} source={source} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
            <h2 className="mb-2 text-xl font-extrabold text-foreground">No matching source found</h2>
            <p className="text-sm text-muted-foreground">Adjust the search term or filters to see the full inventory.</p>
          </div>
        )}

        <aside className="mt-8 rounded-3xl border border-secondary/20 bg-secondary/5 p-5 text-sm leading-relaxed text-secondary">
          <strong>Scan transparency.</strong> This initial inventory uses public The Hague index and category pages.
          Listing a source is not permission to republish automatically: check each site&apos;s robots.txt, terms,
          licenses, and available APIs before importing activities at scale.
        </aside>
      </section>
    </main>
  );
}