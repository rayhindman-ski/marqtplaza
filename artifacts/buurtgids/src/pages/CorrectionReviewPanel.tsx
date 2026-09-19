import { useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import {
  getGetListingCorrectionQueueQueryKey,
  useDecideListingCorrection,
  useGetListingCorrectionQueue,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAppLanguage } from '@/lib/useAppLanguage';

export function CorrectionReviewPanel({ enabled }: { enabled: boolean }) {
  const [language] = useAppLanguage();
  const nl = language === 'nl';
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const queue = useGetListingCorrectionQueue({
    query: { enabled, queryKey: getGetListingCorrectionQueueQueryKey() },
  });
  const decide = useDecideListingCorrection();

  const submit = (id: number, version: number, decision: 'approve' | 'reject') => {
    decide.mutate({
      correctionId: id,
      data: {
        decision,
        expectedVersion: version,
        reason: reasons[id]?.trim() || undefined,
      },
    }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetListingCorrectionQueueQueryKey() });
      },
    });
  };

  if (queue.isLoading) {
    return <div role="status" className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">{nl ? 'Correcties laden…' : 'Loading corrections…'}</div>;
  }
  if (queue.isError) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <p className="font-bold">{nl ? 'De correctiewachtrij kon niet worden geladen.' : 'The correction queue could not be loaded.'}</p>
        <Button variant="outline" className="mt-3" onClick={() => void queue.refetch()}>{nl ? 'Opnieuw proberen' : 'Retry'}</Button>
      </div>
    );
  }
  if (!queue.data?.length) {
    return <div className="rounded-xl border border-border bg-card p-12 text-center font-semibold text-muted-foreground">{nl ? 'Geen correcties in afwachting.' : 'No corrections are awaiting review.'}</div>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-testid="correction-review-queue">
      {queue.data.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle className="text-lg">{item.fieldKey.replaceAll('_', ' ')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {item.cityId} · {item.listingSource} · {item.listingId} · v{item.version}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{nl ? 'Voorgestelde waarde' : 'Proposed value'}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{item.proposedValue}</p>
            </div>
            {item.explanation && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.explanation}</p>}
            {item.evidenceUrl && (
              <a href={item.evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                {nl ? 'Open openbare bron' : 'Open public evidence'} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <div>
              <label htmlFor={`correction-reason-${item.id}`} className="text-sm font-bold">{nl ? 'Redactionele reden (optioneel)' : 'Editorial reason (optional)'}</label>
              <Textarea
                id={`correction-reason-${item.id}`}
                className="mt-2"
                maxLength={2000}
                value={reasons[item.id] ?? ''}
                onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
              />
            </div>
            <p className="text-xs font-semibold text-amber-800">
              {nl ? 'Goedkeuren wijzigt de openbare vermelding niet automatisch.' : 'Approval does not automatically change the public listing.'}
            </p>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button variant="destructive" className="flex-1" disabled={decide.isPending} onClick={() => submit(item.id, item.version, 'reject')}>
              <X className="mr-1.5 h-4 w-4" /> {nl ? 'Afwijzen' : 'Reject'}
            </Button>
            <Button className="flex-1 bg-emerald-700 hover:bg-emerald-800" disabled={decide.isPending} onClick={() => submit(item.id, item.version, 'approve')}>
              <Check className="mr-1.5 h-4 w-4" /> {nl ? 'Goedkeuren' : 'Approve'}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}