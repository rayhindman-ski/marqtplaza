import { useEffect, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { Search } from 'lucide-react';
import { getLookupBusinessesQueryKey, type ApiError, useLookupBusinesses } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { businessIntakeTranslations } from '@/lib/i18n';
import { accountErrorMessage } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { withReturnPath } from '@/lib/returnPath';

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && 'code' in data ? data as ApiError : null;
}

export default function BusinessLookupPage() {
  const [language] = useAppLanguage();
  const copy = businessIntakeTranslations[language];
  const auth = useAccountAuth();
  const [, setLocation] = useLocation();
  const [value, setValue] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [value]);
  const enabled = featureFlags.businessIntake && auth.isSignedIn && query.length >= 2;
  const lookup = useLookupBusinesses({ q: query }, {
    query: { enabled, queryKey: getLookupBusinessesQueryKey({ q: query }), retry: false },
  });

  if (!featureFlags.businessIntake) return <Unavailable title={copy.unavailableTitle} body={copy.unavailableBody} />;
  if (!auth.isLoaded) return <p className="p-10 text-center">{copy.loading}</p>;
  if (!auth.isSignedIn) {
    const target = withReturnPath('/sign-in', `${window.location.pathname}${window.location.search}`);
    return <Redirect to={target} />;
  }
  const error = apiErrorFrom(lookup.error);
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12" data-testid="page-business-lookup">
      <h1 className="font-serif text-4xl font-semibold" data-testid="heading-business-lookup">{copy.lookupTitle}</h1>
      <p className="mt-2 text-muted-foreground">{copy.lookupIntro}</p>
      <div className="mt-8">
        <Label htmlFor="business-search">{copy.searchLabel}</Label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input id="business-search" data-testid="input-business-search" className="pl-9" value={value}
            placeholder={copy.searchPlaceholder} onChange={(event) => setValue(event.target.value)} />
        </div>
      </div>
      <div className="mt-6 space-y-3" aria-live="polite">
        {query.length < 2 ? <p>{copy.searchIdle}</p> : null}
        {lookup.isLoading ? <p role="status">{copy.searching}</p> : null}
        {error?.code === 'RATE_LIMITED' ? <p role="alert">{copy.lookupRateLimited}</p> : null}
        {error?.code === 'DEPENDENCY_UNAVAILABLE' ? <p role="alert">{copy.dependencyUnavailable}</p> : null}
        {lookup.isError && error?.code !== 'RATE_LIMITED' && error?.code !== 'DEPENDENCY_UNAVAILABLE' ? <p role="alert">{accountErrorMessage(lookup.error, language)}</p> : null}
        {lookup.data?.matches.map((match) => {
          const params = new URLSearchParams({ kind: 'existing_listing', cityId: match.cityId, listingSource: match.listingSource, listingId: match.listingId });
          return (
            <Card key={`${match.listingSource}:${match.listingId}`}>
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-bold">{match.name}</p>
                  <p className="text-sm text-muted-foreground">{[match.neighborhood, match.category].filter(Boolean).join(' · ')}</p>
                  {match.isClaimed ? <Badge className="mt-2" variant="secondary">{copy.claimed}</Badge> : null}
                </div>
                <Button type="button" onClick={() => setLocation(`/bedrijf-nieuw?${params}`)}>{copy.claim}</Button>
              </CardContent>
            </Card>
          );
        })}
        {lookup.data && lookup.data.matches.length === 0 ? <p>{copy.noResults} <Link className="font-bold text-primary underline" href="/bedrijf-nieuw?kind=new_business">{copy.addNew}</Link></p> : null}
        {lookup.data?.truncated ? <p className="text-sm text-muted-foreground">{copy.truncated}</p> : null}
      </div>
      <Button asChild variant="outline" className="mt-8"><Link href="/bedrijf-nieuw?kind=new_business">{copy.addNew}</Link></Button>
    </main>
  );
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return <main className="container mx-auto max-w-xl px-4 py-20 text-center"><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{body}</CardContent></Card></main>;
}