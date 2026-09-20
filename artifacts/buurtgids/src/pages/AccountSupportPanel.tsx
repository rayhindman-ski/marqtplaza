import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, RotateCcw, X } from 'lucide-react';
import {
  getGetSupportAccountRequestsQueryKey,
  getGetSupportLifecycleMessagesQueryKey,
  useDecideSupportAccountRequest,
  useGetSupportAccountRequests,
  useGetSupportLifecycleMessages,
  useResendSupportLifecycleMessage,
  type AccountRequestResolution,
  type ApiError,
  type SupportAccountRequest,
  type SupportAccountRequestDecisionInput,
  type SupportLifecycleMessage,
} from '@workspace/api-client-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { accountSupportTranslations } from '@/lib/i18n';

type Copy = (typeof accountSupportTranslations)[keyof typeof accountSupportTranslations];
type Decision = SupportAccountRequestDecisionInput['decision'];
type BlockerResolution = Extract<AccountRequestResolution, 'ownership_transferred' | 'business_closed' | 'business_unpublished'>;

const BLOCKER_RESOLUTIONS: readonly BlockerResolution[] = ['ownership_transferred', 'business_closed', 'business_unpublished'];

/**
 * Support surface for account deletion requests and permanently failed
 * lifecycle messages. Every decision carries the exact request version the
 * editor looked at; a 409 refreshes the queue instead of overwriting newer
 * work. Self-review is refused by the API and surfaced with its error copy.
 * Message rows show delivery metadata only — payloads never reach this screen.
 */

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && 'code' in data ? (data as ApiError) : null;
}

function describeFailure(error: unknown, copy: Copy): string {
  const code = apiErrorFrom(error)?.code;
  return (code && copy.errors[code]) || copy.errors.default;
}

function formatDate(value: string | null, language: 'nl' | 'en'): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

type PendingDecision =
  | { kind: 'decision'; request: SupportAccountRequest; decision: Exclude<Decision, 'resolve_blocker'> }
  | { kind: 'decision'; request: SupportAccountRequest; decision: 'resolve_blocker'; businessProfileId: number; businessName: string }
  | { kind: 'resend'; message: SupportLifecycleMessage };

function EmptyState({ title }: { title: string }) {
  return (
    <div className="text-center py-16 bg-card rounded-2xl border border-border/50 shadow-sm">
      <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-60" />
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

export function AccountSupportPanel({ section, enabled }: { section: 'requests' | 'messages'; enabled: boolean }) {
  const queryClient = useQueryClient();
  const [language] = useAppLanguage();
  const copy = accountSupportTranslations[language];

  const requestsQuery = useGetSupportAccountRequests(undefined, { query: { enabled: enabled && section === 'requests', queryKey: getGetSupportAccountRequestsQueryKey() } });
  const messagesQuery = useGetSupportLifecycleMessages({ status: 'failed' }, { query: { enabled: enabled && section === 'messages', queryKey: getGetSupportLifecycleMessagesQueryKey({ status: 'failed' }) } });
  const decide = useDecideSupportAccountRequest();
  const resend = useResendSupportLifecycleMessage();

  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<BlockerResolution>('ownership_transferred');

  const busy = decide.isPending || resend.isPending;
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetSupportAccountRequestsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetSupportLifecycleMessagesQueryKey({ status: 'failed' }) }),
  ]);

  const open = (action: PendingDecision) => {
    setPending(action);
    setNote('');
    setResolution('ownership_transferred');
  };

  const confirm = async () => {
    if (!pending) return;
    try {
      if (pending.kind === 'resend') {
        await resend.mutateAsync({ id: pending.message.id });
        toast.success(copy.resent);
      } else {
        const trimmed = note.trim();
        const data: SupportAccountRequestDecisionInput = {
          expectedVersion: pending.request.version,
          decision: pending.decision,
          note: trimmed || undefined,
          ...(pending.decision === 'resolve_blocker' ? { businessProfileId: pending.businessProfileId, resolutionCode: resolution } : {}),
        };
        await decide.mutateAsync({ id: pending.request.id, data });
        toast.success(copy.saved);
      }
      setPending(null);
    } catch (error) {
      toast.error(describeFailure(error, copy));
      const code = apiErrorFrom(error)?.code;
      if (code === 'VERSION_CONFLICT' || code === 'SELF_REVIEW_FORBIDDEN' || code === 'IDEMPOTENCY_CONFLICT' || code === 'NOT_FOUND') setPending(null);
    } finally {
      void refresh();
    }
  };

  const requests = requestsQuery.data?.requests ?? [];
  const messages = messagesQuery.data?.messages ?? [];

  const dialogDescription = () => {
    if (!pending) return '';
    if (pending.kind === 'resend') return `${copy.message} #${pending.message.id} · ${pending.message.eventCode}`;
    const base = `${copy.decisions[pending.decision]} · ${copy.request} #${pending.request.id} · v${pending.request.version}`;
    return pending.decision === 'resolve_blocker' ? `${base} · ${pending.businessName}` : base;
  };

  return (
    <div className="space-y-6" data-testid={`support-${section}`}>
      {section === 'requests' && (
        requestsQuery.isLoading ? <QueueSkeleton /> : requests.length === 0 ? <EmptyState title={copy.emptyRequests} /> : (
          requests.map((request) => {
            const blockers = request.blocker?.businesses ?? [];
            const unresolved = blockers.filter((business) => !business.resolved);
            const canStart = request.status === 'received' || request.status === 'blocked';
            const canResolve = (request.status === 'blocked' || request.status === 'in_review') && request.blocker?.code === 'blocked_ownership';
            const inReview = request.status === 'in_review';
            const completeHintId = `complete-hint-${request.id}`;
            return (
              <Card key={request.id} className="border-border/60 shadow-sm" data-testid={`account-request-${request.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{copy.type[request.type] ?? request.type} · {copy.request} #{request.id}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant={request.status === 'blocked' ? 'destructive' : 'secondary'} data-testid={`account-request-status-${request.id}`}>
                        {copy.status[request.status] ?? request.status} · v{request.version}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {copy.requester} #{request.userId} · {copy.created} {formatDate(request.createdAt, language)} · {copy.deadline}: {request.deadlineAt ? formatDate(request.deadlineAt, language) : copy.noDeadline}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground">{copy.blockers}</p>
                    {blockers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{copy.noBlockers}</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-2">{copy.blockerHint}</p>
                        <ul className="space-y-2">
                          {blockers.map((business) => (
                            <li key={business.businessProfileId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm" data-testid={`blocker-${request.id}-${business.businessProfileId}`}>
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{business.name}</span>
                                <Badge variant="outline">{copy.publicationStatus[business.publicationStatus] ?? business.publicationStatus}</Badge>
                                <Badge variant={business.resolved ? 'secondary' : 'destructive'}>{business.resolved ? copy.resolved : copy.unresolved}</Badge>
                              </span>
                              {canResolve && !business.resolved && (
                                <Button size="sm" variant="outline" onClick={() => open({ kind: 'decision', request, decision: 'resolve_blocker', businessProfileId: business.businessProfileId, businessName: business.name })}>
                                  {copy.resolveBlocker}
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  {request.events.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-semibold text-muted-foreground">{copy.history} ({request.events.length})</summary>
                      <ol className="mt-2 space-y-1 text-xs">
                        {request.events.map((event) => (
                          <li key={event.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                            <span>{formatDate(event.createdAt, language)}</span>
                            <span>{copy.actor[event.actor] ?? event.actor}</span>
                            <span>{event.fromStatus ? `${copy.status[event.fromStatus] ?? event.fromStatus} → ` : ''}{copy.status[event.toStatus] ?? event.toStatus}</span>
                            {event.resolutionCode && <span>· {copy.resolutionCodes[event.resolutionCode] ?? event.resolutionCode}</span>}
                            {event.note && <span className="text-foreground">· {event.note}</span>}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2 justify-end border-t border-border/40 pt-4">
                  {inReview && unresolved.length > 0 && (
                    <span id={completeHintId} className="text-xs text-muted-foreground inline-flex items-center gap-1 mr-auto"><AlertTriangle className="w-3.5 h-3.5" /> {copy.blockerHint}</span>
                  )}
                  {canStart && (
                    <Button size="sm" onClick={() => open({ kind: 'decision', request, decision: 'start_review' })}>{copy.startReview}</Button>
                  )}
                  {inReview && (
                    <>
                      <Button variant="outline" size="sm" className="text-destructive gap-1" onClick={() => open({ kind: 'decision', request, decision: 'reject' })}><X className="w-4 h-4" /> {copy.reject}</Button>
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={unresolved.length > 0}
                        aria-describedby={unresolved.length > 0 ? completeHintId : undefined}
                        onClick={() => open({ kind: 'decision', request, decision: 'complete' })}
                      >
                        <Check className="w-4 h-4" /> {copy.complete}
                      </Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            );
          })
        )
      )}

      {section === 'messages' && (
        messagesQuery.isLoading ? <QueueSkeleton /> : messages.length === 0 ? <EmptyState title={copy.emptyMessages} /> : (
          messages.map((message) => (
            <Card key={message.id} className="border-border/60 shadow-sm" data-testid={`lifecycle-message-${message.id}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">{message.eventCode}</CardTitle>
                  <Badge variant={message.status === 'failed' ? 'destructive' : 'secondary'} data-testid={`lifecycle-message-status-${message.id}`}>
                    {copy.messageStatus[message.status] ?? message.status}
                  </Badge>
                </div>
                <CardDescription>{copy.message} #{message.id}{message.businessName ? ` · ${message.businessName}` : ''}</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label={copy.recipient}>{message.recipientUserId !== null ? `#${message.recipientUserId}` : '—'}</Field>
                <Field label={copy.locale}>{message.locale}</Field>
                <Field label={copy.attempts}><span data-testid={`lifecycle-message-attempts-${message.id}`}>{message.attempts} / {message.maxAttempts}</span></Field>
                <Field label={copy.lastError}>
                  <code className="text-xs" data-testid={`lifecycle-message-error-${message.id}`}>{message.lastErrorCode ?? copy.noError}</code>
                  {message.lastErrorAt && <span className="block text-xs text-muted-foreground">{formatDate(message.lastErrorAt, language)}</span>}
                </Field>
                <Field label={copy.failedAt}>{formatDate(message.failedAt, language)}</Field>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 justify-end border-t border-border/40 pt-4">
                {message.status === 'failed' && (
                  <Button size="sm" className="gap-1" onClick={() => open({ kind: 'resend', message })}><RotateCcw className="w-4 h-4" /> {copy.resend}</Button>
                )}
              </CardFooter>
            </Card>
          ))
        )
      )}

      <Dialog open={pending !== null} onOpenChange={(openState) => !openState && setPending(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pending?.kind === 'resend' ? copy.resendTitle : copy.confirmTitle}</DialogTitle>
            <DialogDescription>{dialogDescription()}</DialogDescription>
          </DialogHeader>
          {pending?.kind === 'resend' && <p className="text-sm text-muted-foreground">{copy.resendDescription}</p>}
          {pending?.kind === 'decision' && pending.decision === 'resolve_blocker' && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">{copy.resolutionLabel}</legend>
              {BLOCKER_RESOLUTIONS.map((code) => (
                <label key={code} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="resolution" value={code} checked={resolution === code} onChange={() => setResolution(code)} className="mt-1" />
                  <span>{copy.resolutions[code]}</span>
                </label>
              ))}
            </fieldset>
          )}
          {pending?.kind === 'decision' && pending.decision === 'complete' && (
            <p className="text-sm text-destructive inline-flex items-start gap-2" role="alert"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {copy.completeWarning}</p>
          )}
          {pending?.kind === 'decision' && (
            <div className="space-y-1.5">
              <label htmlFor="support-note" className="text-sm font-semibold">{copy.note} {copy.optional}</label>
              <Textarea id="support-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} aria-describedby="support-note-hint" />
              <p id="support-note-hint" className="text-xs text-muted-foreground">{copy.noteHint}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>{copy.cancel}</Button>
            <Button onClick={() => void confirm()} disabled={busy} data-testid="confirm-support-action">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
