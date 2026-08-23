import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ExternalLink, Calendar, MapPin, Search, CheckCircle2, XCircle, AlertCircle, LoaderCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';

import {
  useGetEventReviewCandidates,
  getGetEventReviewCandidatesQueryKey,
  useDecideEventReviewCandidate,
  type EventReviewCandidate,
  type GetEventReviewCandidatesStatus,
} from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const REASON_LABELS: Record<string, string> = {
  missing_date: 'Missing explicit date',
  out_of_window: 'Past or far future date',
  missing_locality: 'No Den Haag evidence',
  foreign_location: 'Demonstrably foreign location',
  manual_rejection: 'Manually rejected',
};

const approveSchema = z.object({
  startsAt: z.string().min(1, 'Future date and time required (e.g. YYYY-MM-DDTHH:mm)'),
  venue: z.string().min(1, 'Hague venue name required'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  evidenceUrl: z.string().url('Must provide a valid verification URL'),
});
type ApproveValues = z.infer<typeof approveSchema>;

export default function EventReviewView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GetEventReviewCandidatesStatus>('open');
  const [approvingCandidate, setApprovingCandidate] = useState<EventReviewCandidate | null>(null);

  const { data, isLoading, isError, error } = useGetEventReviewCandidates({ status }, {
    query: {
      queryKey: getGetEventReviewCandidatesQueryKey({ status })
    }
  });

  const decideMutation = useDecideEventReviewCandidate();

  const handleReject = (id: number) => {
    decideMutation.mutate({
      id,
      data: { decision: 'reject' }
    }, {
      onSuccess: () => {
        toast.success('Event definitively rejected');
        queryClient.invalidateQueries({ queryKey: getGetEventReviewCandidatesQueryKey({ status }) });
      },
      onError: () => {
        toast.error('Failed to reject event');
      }
    });
  };

  const closeApprovalDialog = () => setApprovingCandidate(null);

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 sm:px-7">
          <Link data-testid="link-back-to-sources" href="/bronnen" aria-label="Back to sources" className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="h-6 w-6" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">Editorial workspace</p>
            <h1 data-testid="text-event-review-title" className="truncate text-lg font-extrabold tracking-tight text-foreground sm:text-xl">Event Review</h1>
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--accent)),_transparent_62%)]">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">
          <div className="max-w-2xl">
            <h2 className="mb-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Decide on uncertain events.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              These events were scanned but excluded automatically because they lacked a parseable date, Hague location evidence, or fell outside the allowed timeframe. Review them here. Only verify and approve if they are upcoming and definitely located in Den Haag.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {(['open', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`filter-${s}`}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary",
                status === s 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {data && s === status && ` (${data.items.length})`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-semibold">Loading candidates...</p>
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-80" />
            <p className="font-bold">Failed to load candidates</p>
            <p className="mt-1 text-sm opacity-80">{error instanceof Error ? error.message : 'An unknown error occurred.'}</p>
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-sm">
            <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
            <h2 className="mb-2 text-xl font-extrabold text-foreground">No {status} candidates</h2>
            <p className="text-sm text-muted-foreground">You've caught up on the review queue.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {data?.items.map(candidate => (
              <CandidateCard 
                key={candidate.id} 
                candidate={candidate} 
                onApprove={() => setApprovingCandidate(candidate)}
                onReject={() => handleReject(candidate.id)}
                isRejecting={decideMutation.isPending && decideMutation.variables?.id === candidate.id && decideMutation.variables?.data.decision === 'reject'}
              />
            ))}
          </div>
        )}
      </div>

      <ApprovalDialog 
        candidate={approvingCandidate} 
        onClose={closeApprovalDialog} 
        onSuccess={() => {
          closeApprovalDialog();
          queryClient.invalidateQueries({ queryKey: getGetEventReviewCandidatesQueryKey({ status }) });
        }}
      />
    </main>
  );
}

function CandidateCard({ 
  candidate, 
  onApprove, 
  onReject, 
  isRejecting 
}: { 
  candidate: EventReviewCandidate; 
  onApprove: () => void;
  onReject: () => void;
  isRejecting: boolean;
}) {
  const reasonLabel = candidate.reason ? REASON_LABELS[candidate.reason] || candidate.reason : 'Unknown reason';
  
  return (
    <article data-testid={`candidate-card-${candidate.id}`} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/20 hover:shadow-md sm:flex-row sm:items-start">
      <div className="flex-1 min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide",
            candidate.status === 'pending_review' ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          )}>
            {candidate.status === 'pending_review' ? 'Needs Review' : 'Rejected'}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {candidate.sourceName}
          </span>
          {candidate.category && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {candidate.category}
            </span>
          )}
        </div>
        
        <h3 data-testid={`text-review-title-${candidate.id}`} className="mb-1 text-base font-extrabold leading-tight text-foreground">
          {candidate.title}
        </h3>
        
        <a 
          data-testid={`link-review-source-${candidate.id}`}
          href={candidate.sourceUrl} 
          target="_blank" 
          rel="noreferrer"
          className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          View original source <ExternalLink className="h-3 w-3" />
        </a>

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <div data-testid={`status-review-reason-${candidate.id}`} className="flex flex-col gap-1 rounded-xl bg-muted/40 p-3">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground">Extraction Reason</span>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              {reasonLabel}
            </div>
          </div>
          
          <div data-testid={`text-review-details-${candidate.id}`} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                {candidate.startsAt ? (
                  <span className="font-bold">{format(new Date(candidate.startsAt), 'PPpp')}</span>
                ) : (
                  <span className="italic text-muted-foreground">No date found</span>
                )}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                {candidate.venue ? (
                  <span className="font-bold">{candidate.venue}</span>
                ) : (
                  <span className="italic text-muted-foreground">No venue specified</span>
                )}
              </span>
            </div>
            {(candidate.lat !== 0 || candidate.lng !== 0) && (
              <div className="ml-5 text-[10px] text-muted-foreground font-mono">
                {candidate.lat.toFixed(4)}, {candidate.lng.toFixed(4)}
              </div>
            )}
          </div>
        </div>
        
        {candidate.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {candidate.description}
          </p>
        )}
      </div>

      {candidate.status === 'pending_review' && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-4 sm:w-40 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <Button 
            onClick={onApprove} 
            data-testid={`btn-approve-${candidate.id}`}
            className="w-full justify-center gap-2 font-bold"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button 
            variant="outline" 
            onClick={onReject}
            disabled={isRejecting}
            data-testid={`btn-reject-${candidate.id}`}
            className="w-full justify-center gap-2 font-bold border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {isRejecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}

function ApprovalDialog({ 
  candidate, 
  onClose,
  onSuccess
}: { 
  candidate: EventReviewCandidate | null; 
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mutation = useDecideEventReviewCandidate();
  
  const form = useForm<ApproveValues>({
    resolver: zodResolver(approveSchema),
    defaultValues: {
      startsAt: '',
      venue: '',
      lat: 0,
      lng: 0,
      evidenceUrl: '',
    }
  });

  // Reset form when candidate changes
  useEffect(() => {
    if (candidate) {
      // Format startsAt if valid, else empty
      let defaultStartsAt = '';
      if (candidate.startsAt) {
        try {
          const d = new Date(candidate.startsAt);
          if (!isNaN(d.getTime())) {
            // ISO string format suitable for datetime-local input: YYYY-MM-DDTHH:mm
            defaultStartsAt = d.toISOString().slice(0, 16);
          }
        } catch {
          defaultStartsAt = '';
        }
      }
      
      form.reset({
        startsAt: defaultStartsAt,
        venue: candidate.venue || '',
        lat: candidate.lat || 52.0705, // Default to Den Haag center if 0
        lng: candidate.lng || 4.3007,
        evidenceUrl: candidate.evidenceUrl || candidate.sourceUrl || '',
      });
    }
  }, [candidate, form]);

  const onSubmit = (values: ApproveValues) => {
    if (!candidate) return;
    
    mutation.mutate({
      id: candidate.id,
      data: {
        decision: 'approve',
        startsAt: new Date(values.startsAt).toISOString(),
        venue: values.venue,
        lat: values.lat,
        lng: values.lng,
        evidenceUrl: values.evidenceUrl
      }
    }, {
      onSuccess: () => {
        toast.success('Event approved and published');
        onSuccess();
      },
      onError: () => {
        toast.error('Failed to approve event');
      }
    });
  };

  return (
    <Dialog open={!!candidate} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden gap-0 bg-card border-border">
        <div className="bg-primary/5 px-6 py-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Approve Event
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground mt-1">
              Provide exact details. Only future events located in Den Haag with verifiable proof can be published.
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 flex flex-col gap-4">
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-foreground">Date & Time</FormLabel>
                  <FormControl>
                    <Input data-testid="input-review-date" type="datetime-local" {...field} className="bg-background border-border font-medium" />
                  </FormControl>
                  <FormMessage className="text-xs text-destructive" />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="venue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-foreground">Hague Venue Name</FormLabel>
                  <FormControl>
                    <Input data-testid="input-review-venue" placeholder="e.g. Mauritshuis, Paard" {...field} className="bg-background border-border font-medium" />
                  </FormControl>
                  <FormMessage className="text-xs text-destructive" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-foreground">Latitude</FormLabel>
                    <FormControl>
                      <Input data-testid="input-review-latitude" type="number" step="any" {...field} className="bg-background border-border font-mono text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs text-destructive" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lng"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-foreground">Longitude</FormLabel>
                    <FormControl>
                      <Input data-testid="input-review-longitude" type="number" step="any" {...field} className="bg-background border-border font-mono text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs text-destructive" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="evidenceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-foreground">Verification URL</FormLabel>
                  <FormControl>
                    <Input data-testid="input-review-evidence-url" placeholder="https://..." {...field} className="bg-background border-border font-medium text-sm" />
                  </FormControl>
                  <p className="text-[10px] font-semibold text-muted-foreground">A link that proves the event location and date.</p>
                  <FormMessage className="text-xs text-destructive" />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-4 pt-4 border-t border-border sm:justify-between items-center">
              <Button type="button" variant="ghost" onClick={onClose} data-testid="dialog-cancel" className="font-bold border-border text-foreground hover:bg-muted">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="dialog-submit" className="font-bold gap-2">
                {mutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {mutation.isPending ? 'Publishing...' : 'Approve & Publish'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
