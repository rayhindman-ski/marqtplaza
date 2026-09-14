import React, { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ExternalLink, Loader2, ShieldAlert, X } from 'lucide-react';
import {
  getAuthorityQueue,
  getEditorialQueue,
  getPublicationQueue,
  useReviewBusinessClaim,
  useReviewBusinessRevision,
  useSetBusinessPublication,
  type ApiError,
  type AuthorityQueueItem,
  type BusinessFactCheckInput,
  type BusinessRevision,
  type EditorialQueueItem,
  type PublicationQueueItem,
} from '@workspace/api-client-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { businessPublicationTranslations, businessReviewTranslations } from '@/lib/i18n';

type ReviewCopy = (typeof businessReviewTranslations)[keyof typeof businessReviewTranslations];
type PublicationCopy = (typeof businessPublicationTranslations)[keyof typeof businessPublicationTranslations];

/**
 * Reviewer surfaces for the three independent review dimensions. Each action
 * carries the exact version the reviewer looked at; a 409 means the queue is
 * refreshed rather than silently overwriting newer work.
 */

const PAGE_SIZE = 20;
const CHECKABLE_FIELDS = ['tagline', 'description', 'openingHours', 'websiteUrl', 'phone', 'email', 'address', 'logoUrl', 'coverUrl'] as const;
const CHECK_STATUSES = ['unchecked', 'confirmed', 'contradicted', 'unavailable'] as const;

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && 'code' in data ? (data as ApiError) : null;
}

function describeFailure(error: unknown, copy: ReviewCopy): string {
  const code = apiErrorFrom(error)?.code;
  return (code && copy.errors[code]) || copy.errors.default;
}

function useQueue<T>(key: string, fetcher: (cursor?: string) => Promise<{ items: T[]; pageInfo: { hasMore: boolean; nextCursor: string | null } }>, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['business-review', key],
    queryFn: ({ pageParam }) => fetcher(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.pageInfo.hasMore && last.pageInfo.nextCursor ? last.pageInfo.nextCursor : undefined),
    enabled,
  });
}

function RevisionPreview({ revision, label, copy, fields }: { revision: BusinessRevision | null; label: string; copy: ReviewCopy; fields: PublicationCopy }) {
  if (!revision) return <p className="text-sm italic text-muted-foreground">{label}: {copy.none}</p>;
  const { nl, en, facts } = revision.content;
  return (
    <div className="text-sm space-y-2">
      <p className="font-bold text-xs uppercase tracking-wide text-muted-foreground">{label} · v{revision.version}</p>
      {(['nl', 'en'] as const).map((lang) => {
        const block = lang === 'nl' ? nl : en;
        const filled = Object.values(block).some(Boolean);
        return (
          <div key={lang} className="rounded-lg bg-muted/40 p-3 space-y-1">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">{lang === 'nl' ? copy.languageNl : copy.languageEn}</p>
            {filled ? (
              <>
                {block.tagline && <p className="font-semibold">{block.tagline}</p>}
                {block.description && <p className="whitespace-pre-wrap text-muted-foreground">{block.description}</p>}
                {block.openingHours && <p className="whitespace-pre-wrap text-xs">{block.openingHours}</p>}
              </>
            ) : (
              <p className="italic text-muted-foreground text-xs">{copy.empty}</p>
            )}
          </div>
        );
      })}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {Object.entries(facts).map(([field, value]) => (
          <React.Fragment key={field}>
            <dt className="text-muted-foreground">{(fields as Record<string, unknown>)[field] as string ?? field}</dt>
            <dd className="truncate">{value ?? <span className="italic text-muted-foreground">—</span>}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

function LoadMore({ query, copy }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }; copy: ReviewCopy }) {
  if (!query.hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
        {query.isFetchingNextPage ? copy.loading : copy.loadMore}
      </Button>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="text-center py-16 bg-card rounded-2xl border border-border/50 shadow-sm">
      <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-60" />
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
    </div>
  );
}

type PendingAction =
  | { kind: 'claim'; item: AuthorityQueueItem; decision: 'approve' | 'reject' | 'request_changes' }
  | { kind: 'revision'; item: EditorialQueueItem; decision: 'approve' | 'reject' | 'request_changes' }
  | { kind: 'publication'; item: PublicationQueueItem; action: 'publish' | 'unpublish' | 'suspend' };

export function BusinessReviewPanel({ section, enabled }: { section: 'authority' | 'editorial' | 'publication'; enabled: boolean }) {
  const queryClient = useQueryClient();
  const [language] = useAppLanguage();
  const copy = businessReviewTranslations[language];
  const fields = businessPublicationTranslations[language];
  const authority = useQueue('authority', (cursor) => getAuthorityQueue({ limit: PAGE_SIZE, cursor }), enabled && section === 'authority');
  const editorial = useQueue('editorial', (cursor) => getEditorialQueue({ limit: PAGE_SIZE, cursor }), enabled && section === 'editorial');
  const publication = useQueue('publication', (cursor) => getPublicationQueue({ limit: PAGE_SIZE, cursor }), enabled && section === 'publication');
  const reviewClaim = useReviewBusinessClaim();
  const reviewRevision = useReviewBusinessRevision();
  const setPublication = useSetBusinessPublication();

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [checks, setChecks] = useState<Record<string, { status: (typeof CHECK_STATUSES)[number]; sourceUrl: string }>>({});

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['business-review'] });
  const busy = reviewClaim.isPending || reviewRevision.isPending || setPublication.isPending;
  const reasonRequired = pending
    ? pending.kind === 'publication'
      ? pending.action !== 'publish'
      : pending.decision !== 'approve'
    : false;

  const open = (action: PendingAction) => {
    setPending(action);
    setReason('');
    setChecks({});
  };

  const confirm = async () => {
    if (!pending) return;
    const trimmed = reason.trim();
    try {
      if (pending.kind === 'claim') {
        await reviewClaim.mutateAsync({
          id: pending.item.id,
          data: { decision: pending.decision, expectedVersion: pending.item.version, reason: trimmed || undefined },
        });
      } else if (pending.kind === 'revision') {
        const factChecks: BusinessFactCheckInput[] = Object.entries(checks)
          .filter(([, value]) => value.status !== 'unchecked')
          .map(([field, value]) => ({ field: field as BusinessFactCheckInput['field'], status: value.status, sourceUrl: value.sourceUrl.trim() || undefined }));
        await reviewRevision.mutateAsync({
          id: pending.item.revision.id,
          data: {
            decision: pending.decision,
            expectedVersion: pending.item.revision.version,
            reason: trimmed || undefined,
            factChecks: pending.decision === 'approve' && factChecks.length > 0 ? factChecks : undefined,
          },
        });
      } else {
        await setPublication.mutateAsync({
          id: pending.item.profile.id,
          data: {
            action: pending.action,
            expectedRevisionVersion: pending.item.approvedRevision?.version ?? 0,
            reason: trimmed || undefined,
          },
        });
      }
      toast.success(copy.saved);
      setPending(null);
    } catch (error) {
      toast.error(describeFailure(error, copy));
      if (apiErrorFrom(error)?.code === 'VERSION_CONFLICT') setPending(null);
    } finally {
      void refreshAll();
    }
  };

  const authorityItems = authority.data?.pages.flatMap((page) => page.items) ?? [];
  const editorialItems = editorial.data?.pages.flatMap((page) => page.items) ?? [];
  const publicationItems = publication.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6" data-testid={`review-${section}`}>
      {section === 'authority' && (
        authority.isLoading ? <QueueSkeleton /> : authorityItems.length === 0 ? <EmptyState title={copy.emptyAuthority} /> : (
          <>
            {authorityItems.map((item) => (
              <Card key={item.id} className="border-border/60 shadow-sm" data-testid={`authority-item-${item.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{item.profile.name}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="outline">{item.kind === 'new_business' ? copy.newBusiness : copy.existingListing}</Badge>
                      <Badge variant="secondary">{copy.claimStatus[item.status] ?? item.status} · v{item.version}</Badge>
                    </div>
                  </div>
                  <CardDescription>{[item.profile.neighborhood, item.profile.category, item.profile.listingSource].filter(Boolean).join(' · ')}</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs font-bold uppercase text-muted-foreground">{copy.contactName}</p><p>{item.contactName}</p></div>
                  <div><p className="text-xs font-bold uppercase text-muted-foreground">{copy.relationship}</p><p>{item.relationship}</p></div>
                  <div className="sm:col-span-2"><p className="text-xs font-bold uppercase text-muted-foreground">{copy.authorityDeclaration}</p><p className="whitespace-pre-wrap">{item.authorityDeclaration}</p></div>
                  {item.evidenceReference && <div><p className="text-xs font-bold uppercase text-muted-foreground">{copy.evidenceReference}</p><p>{item.evidenceReference}</p></div>}
                  {item.message && <div className="sm:col-span-2"><p className="text-xs font-bold uppercase text-muted-foreground">{copy.message}</p><p className="whitespace-pre-wrap">{item.message}</p></div>}
                  {item.profile.sourceUrl && (
                    <a href={item.profile.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {copy.source} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2 justify-end border-t border-border/40 pt-4">
                  {item.canDecide ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => open({ kind: 'claim', item, decision: 'request_changes' })}>{copy.requestChanges}</Button>
                      <Button variant="outline" size="sm" className="text-destructive gap-1" onClick={() => open({ kind: 'claim', item, decision: 'reject' })}><X className="w-4 h-4" /> {copy.reject}</Button>
                      <Button size="sm" className="gap-1" onClick={() => open({ kind: 'claim', item, decision: 'approve' })}><Check className="w-4 h-4" /> {copy.approve}</Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1" data-testid="self-review-blocked"><ShieldAlert className="w-3.5 h-3.5" /> {copy.selfReviewBlocked}</span>
                  )}
                </CardFooter>
              </Card>
            ))}
            <LoadMore query={authority} copy={copy} />
          </>
        )
      )}

      {section === 'editorial' && (
        editorial.isLoading ? <QueueSkeleton /> : editorialItems.length === 0 ? <EmptyState title={copy.emptyEditorial} /> : (
          <>
            {editorialItems.map((item) => (
              <Card key={item.revision.id} className="border-border/60 shadow-sm" data-testid={`editorial-item-${item.revision.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{item.profile.name}</CardTitle>
                    <Badge variant="secondary">{copy.submitted} · v{item.revision.version}</Badge>
                  </div>
                  <CardDescription>{[item.profile.neighborhood, item.profile.listingSource, `${copy.publicationLabel}: ${copy.publicationStatus[item.profile.publicationStatus] ?? item.profile.publicationStatus}`].filter(Boolean).join(' · ')}</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                  <RevisionPreview revision={item.revision} label={copy.submitted} copy={copy} fields={fields} />
                  <RevisionPreview revision={item.approvedRevision} label={copy.currentApproved} copy={copy} fields={fields} />
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2 justify-end border-t border-border/40 pt-4">
                  {item.canDecide ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => open({ kind: 'revision', item, decision: 'request_changes' })}>{copy.requestChanges}</Button>
                      <Button variant="outline" size="sm" className="text-destructive gap-1" onClick={() => open({ kind: 'revision', item, decision: 'reject' })}><X className="w-4 h-4" /> {copy.reject}</Button>
                      <Button size="sm" className="gap-1" onClick={() => open({ kind: 'revision', item, decision: 'approve' })}><Check className="w-4 h-4" /> {copy.approve}</Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1" data-testid="self-review-blocked"><ShieldAlert className="w-3.5 h-3.5" /> {copy.selfReviewBlocked}</span>
                  )}
                </CardFooter>
              </Card>
            ))}
            <LoadMore query={editorial} copy={copy} />
          </>
        )
      )}

      {section === 'publication' && (
        publication.isLoading ? <QueueSkeleton /> : publicationItems.length === 0 ? <EmptyState title={copy.emptyPublication} /> : (
          <>
            {publicationItems.map((item) => (
              <Card key={item.profile.id} className="border-border/60 shadow-sm" data-testid={`publication-item-${item.profile.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{item.profile.name}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant={item.profile.publicationStatus === 'published' ? 'secondary' : 'outline'}>{copy.publicationStatus[item.profile.publicationStatus] ?? item.profile.publicationStatus}</Badge>
                      <Badge variant="outline">{fields.freshness[item.freshness.status] ?? item.freshness.status}</Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {item.approvedRevision ? `${copy.approvedVersion} v${item.approvedRevision.version}` : copy.noApprovedVersion}
                    {item.latestDecision?.reason ? ` · ${copy.latestReason}: ${item.latestDecision.reason}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex flex-wrap gap-2 justify-end border-t border-border/40 pt-4">
                  {item.canDecide ? (
                    <>
                      {item.profile.publicationStatus !== 'suspended' && (
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => open({ kind: 'publication', item, action: 'suspend' })}>{copy.suspend}</Button>
                      )}
                      {(item.profile.publicationStatus === 'published' || item.profile.publicationStatus === 'suspended') && (
                        <Button variant="ghost" size="sm" onClick={() => open({ kind: 'publication', item, action: 'unpublish' })}>{copy.unpublish}</Button>
                      )}
                      {item.profile.publicationStatus !== 'published' && item.approvedRevision && (
                        <Button size="sm" onClick={() => open({ kind: 'publication', item, action: 'publish' })}>{copy.publish}</Button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1" data-testid="self-review-blocked"><ShieldAlert className="w-3.5 h-3.5" /> {copy.selfReviewBlocked}</span>
                  )}
                </CardFooter>
              </Card>
            ))}
            <LoadMore query={publication} copy={copy} />
          </>
        )
      )}

      <Dialog open={pending !== null} onOpenChange={(openState) => !openState && setPending(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.confirmTitle}</DialogTitle>
            <DialogDescription>
              {pending?.kind === 'publication'
                ? `${copy.decisions[pending.action]} · ${pending.item.profile.name} · ${copy.snapshot} v${pending.item.approvedRevision?.version ?? 0}`
                : pending
                  ? `${copy.decisions[pending.decision]} · ${pending.item.profile.name} · v${pending.kind === 'claim' ? pending.item.version : pending.item.revision.version}`
                  : ''}
            </DialogDescription>
          </DialogHeader>
          {pending?.kind === 'revision' && pending.decision === 'approve' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{copy.factChecksOptional}</p>
              <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                {CHECKABLE_FIELDS.map((field) => (
                  <div key={field} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-xs">
                    <span>{fields[field]}</span>
                    <select
                      aria-label={`${copy.statusFor} ${fields[field]}`}
                      className="border rounded-md px-2 py-1 bg-background"
                      value={checks[field]?.status ?? 'unchecked'}
                      onChange={(event) =>
                        setChecks((current) => ({
                          ...current,
                          [field]: { status: event.target.value as (typeof CHECK_STATUSES)[number], sourceUrl: current[field]?.sourceUrl ?? '' },
                        }))
                      }
                    >
                      {CHECK_STATUSES.map((status) => <option key={status} value={status}>{fields.checkStatus[status] ?? status}</option>)}
                    </select>
                    <input
                      aria-label={`${copy.sourceFor} ${fields[field]}`}
                      className="border rounded-md px-2 py-1 bg-background"
                      placeholder={copy.sourcePlaceholder}
                      value={checks[field]?.sourceUrl ?? ''}
                      onChange={(event) =>
                        setChecks((current) => ({
                          ...current,
                          [field]: { status: current[field]?.status ?? 'unchecked', sourceUrl: event.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="review-reason" className="text-sm font-semibold">{copy.reason} {reasonRequired ? copy.required : copy.optional}</label>
            <Textarea id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>{copy.cancel}</Button>
            <Button onClick={() => void confirm()} disabled={busy || (reasonRequired && reason.trim().length === 0)} data-testid="confirm-decision">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl border border-border/50" />)}
    </div>
  );
}
