import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  getGetSocialMapReviewQueryKey,
  type SocialMapReviewItem,
  useGetSocialMapReview,
  useRunSocialMapReview,
} from '@workspace/api-client-react';
import { toast } from 'sonner';

type QueueFilter = 'attention' | 'all';

const STATUS_STYLE = {
  verified: {
    label: 'Gecontroleerd',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  review_due: {
    label: 'Controle gepland',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: TriangleAlert,
  },
  changed: {
    label: 'Wijziging controleren',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: AlertCircle,
  },
  unavailable: {
    label: 'Bron onbereikbaar',
    className: 'border-red-200 bg-red-50 text-red-800',
    icon: AlertCircle,
  },
} as const;

function displayDate(value: string | null): string {
  if (!value) return 'Nog niet uitgevoerd';
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function needsAttention(item: SocialMapReviewItem): boolean {
  return item.status !== 'verified';
}

export default function SocialMapReviewView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<QueueFilter>('attention');
  const { data, isLoading, isError, error } = useGetSocialMapReview({
    query: { queryKey: getGetSocialMapReviewQueryKey() },
  });
  const reviewMutation = useRunSocialMapReview();

  const items = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.items : data.items.filter(needsAttention);
  }, [data, filter]);
  const attentionCount = data?.items.filter(needsAttention).length ?? 0;

  const runReview = () => {
    reviewMutation.mutate(undefined, {
      onSuccess: (report) => {
        queryClient.setQueryData(getGetSocialMapReviewQueryKey(), report);
        toast.success(
          report.successful
            ? 'Alle broncontroles zijn geslaagd. De publieke snapshot is vernieuwd.'
            : 'Bronnen met aandacht zijn in de reviewqueue gezet. De snapshotdatum blijft ongewijzigd.',
        );
      },
      onError: () => toast.error('De broncontrole kon niet worden uitgevoerd. Probeer het opnieuw.'),
    });
  };

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 sm:px-7">
          <Link href="/beoordelen" aria-label="Terug naar eventbeoordeling" className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="h-6 w-6" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">Redactiewerkplek</p>
            <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground sm:text-xl">Sociale kaart: broncontrole</h1>
          </div>
          <button
            type="button"
            data-testid="button-run-social-map-review"
            onClick={runReview}
            disabled={reviewMutation.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {reviewMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {reviewMutation.isPending ? 'Controleren…' : 'Voer broncontrole uit'}
          </button>
        </div>
      </header>

      <section className="border-b border-border bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--accent)),_transparent_62%)]">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">
          <div className="max-w-3xl">
            <h2 className="mb-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Houd hulpinformatie betrouwbaar.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Elke 30 dagen worden de officiële website en de verificatiebron van alle 14 Haagse locaties gecontroleerd.
              Een gewijzigde link, afwijkend adres of onbereikbare bron blijft hier staan voor redactionele opvolging.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
        {isLoading ? (
          <div className="flex h-52 flex-col items-center justify-center gap-3 text-muted-foreground">
            <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm font-semibold">Reviewstatus laden…</p>
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-80" />
            <p className="font-bold">De reviewstatus kon niet worden geladen</p>
            <p className="mt-1 text-sm opacity-80">{error instanceof Error ? error.message : 'Onbekende fout.'}</p>
          </div>
        ) : data && (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Publieke snapshot</p>
                <p data-testid="text-social-map-snapshot-date" className="mt-2 text-lg font-extrabold text-foreground">{displayDate(data.snapshotDate)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Alleen vernieuwd na een volledig geslaagde controle.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Laatste run</p>
                <p className="mt-2 text-lg font-extrabold text-foreground">{displayDate(data.lastRunAt)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Vaste termijn: elke {data.intervalDays} dagen.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Reviewwerk</p>
                <p className="mt-2 text-lg font-extrabold text-foreground">{attentionCount} {attentionCount === 1 ? 'locatie' : 'locaties'}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.successful ? 'Geen blokkades in de laatste run.' : 'Snapshot is behouden tot alles weer klopt.'}</p>
              </div>
            </section>

            <div className="mb-6 flex flex-wrap items-center gap-2">
              {(['attention', 'all'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    filter === option
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {option === 'attention' ? `Aandacht nodig (${attentionCount})` : `Alle locaties (${data.items.length})`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: getGetSocialMapReviewQueryKey() })}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                Vernieuwen
              </button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-sm">
                <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-emerald-600" />
                <h2 className="mb-2 text-xl font-extrabold text-foreground">Geen open reviewwerk</h2>
                <p className="text-sm text-muted-foreground">Alle locaties zijn gecontroleerd of staan nog binnen hun reviewtermijn.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {items.map((item) => <ReviewCard key={item.id} item={item} />)}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ReviewCard({ item }: { item: SocialMapReviewItem }) {
  const status = STATUS_STYLE[item.status];
  const Icon = status.icon;
  return (
    <article data-testid={`social-map-review-item-${item.id}`} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${status.className}`}>
              <Icon className="h-3.5 w-3.5" />
              {status.label}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">Bron: {item.sourceStatus}</span>
          </div>
          <h3 className="text-lg font-extrabold text-foreground">{item.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{item.address}</p>
          {item.reason && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">{item.reason}</p>}
        </div>
        <div className="shrink-0 text-sm text-muted-foreground sm:text-right">
          <p>Laatste controle: <strong className="text-foreground">{displayDate(item.lastCheckedAt)}</strong></p>
          <p className="mt-1">Volgende controle: <strong className="text-foreground">{displayDate(item.nextReviewAt)}</strong></p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
        <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
          Officiële website <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a href={item.sourcePageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
          Verificatiebron <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}