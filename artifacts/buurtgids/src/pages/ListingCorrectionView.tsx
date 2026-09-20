import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertCircle, CheckCircle2, ChevronLeft, Send } from 'lucide-react';
import { useSubmitListingCorrection, type ListingCorrectionReceipt } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const NOTICE_VERSION = '2026-09-18';
const SOURCES = new Set(['google_maps', 'openstreetmap', 'curated', 'source_scan']);
const FIELD_KEYS = ['name', 'address', 'neighborhood', 'website_url', 'opening_hours', 'category', 'accessibility', 'dietary', 'price'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

function createIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `correction_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function ListingCorrectionView() {
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const locale = params.get('locale') === 'nl' ? 'nl' : 'en';
  const cityId = params.get('cityId') ?? '';
  const listingId = params.get('listingId') ?? '';
  const rawSource = params.get('listingSource') ?? '';
  const listingSource = SOURCES.has(rawSource)
    ? rawSource as 'google_maps' | 'openstreetmap' | 'curated' | 'source_scan'
    : null;
  const displayName = params.get('name')?.slice(0, 160) || (locale === 'nl' ? 'Deze vermelding' : 'This listing');
  const [fieldKey, setFieldKey] = useState<FieldKey>('name');
  const [proposedValue, setProposedValue] = useState('');
  const [explanation, setExplanation] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [receipt, setReceipt] = useState<ListingCorrectionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useSubmitListingCorrection({
    request: { headers: { 'Idempotency-Key': idempotencyKey } },
  });
  const nl = locale === 'nl';
  const fields: Record<FieldKey, string> = {
    name: nl ? 'Naam' : 'Name',
    address: nl ? 'Adres' : 'Address',
    neighborhood: nl ? 'Buurt' : 'Neighbourhood',
    website_url: nl ? 'Website' : 'Website',
    opening_hours: nl ? 'Openingstijden' : 'Opening hours',
    category: nl ? 'Categorie' : 'Category',
    accessibility: nl ? 'Toegankelijkheid' : 'Accessibility',
    dietary: nl ? 'Dieet- of allergie-informatie' : 'Dietary or allergy information',
    price: nl ? 'Prijs' : 'Price',
  };

  if (!cityId || !listingId || !listingSource) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-amber-700" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-extrabold">{nl ? 'Vermelding niet gevonden' : 'Listing not found'}</h1>
        <p className="mt-2 text-muted-foreground">
          {nl ? 'Open het correctieformulier opnieuw vanuit een zoekresultaat.' : 'Open the correction form again from a search result.'}
        </p>
        <Button className="mt-6" onClick={() => navigate('/')}>{nl ? 'Terug naar zoeken' : 'Back to search'}</Button>
      </main>
    );
  }

  if (receipt) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Card className="border-emerald-300">
          <CardHeader>
            <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-700" aria-hidden="true" />
            <CardTitle><h1>{nl ? 'Correctie ontvangen' : 'Correction received'}</h1></CardTitle>
            <CardDescription>
              {nl
                ? 'De inzending wacht op beoordeling. De openbare vermelding is niet automatisch gewijzigd.'
                : 'The submission is pending review. The public listing was not changed automatically.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-lg bg-muted px-3 py-2 font-mono text-sm">
              {nl ? 'Referentie' : 'Reference'}: {receipt.receipt}
            </p>
            <Button className="mt-6" onClick={() => navigate('/')}>{nl ? 'Terug naar resultaten' : 'Back to results'}</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!proposedValue.trim() || !consent) {
      setError(nl ? 'Vul de voorgestelde correctie in en bevestig de privacyverklaring.' : 'Enter the proposed correction and confirm the privacy notice.');
      return;
    }
    mutation.mutate({
      cityId,
      listingSource,
      data: {
        listingId,
        fieldKey,
        proposedValue: proposedValue.trim(),
        explanation: explanation.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
        locale,
        consentNoticeVersion: NOTICE_VERSION,
      },
    }, {
      onSuccess: setReceipt,
      onError: () => setError(nl
        ? 'De correctie kon niet worden verzonden. Je invoer blijft staan; probeer het opnieuw.'
        : 'The correction could not be submitted. Your input is preserved; please retry.'),
    });
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {nl ? 'Terug naar resultaten' : 'Back to results'}
      </Link>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle><h1>{nl ? 'Meld een correctie' : 'Report a correction'}</h1></CardTitle>
          <CardDescription>
            {displayName}. {nl
              ? 'De redactie controleert je melding voordat iets openbaar verandert.'
              : 'The editorial team reviews your report before anything public changes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="correction-field">{nl ? 'Welk veld klopt niet?' : 'Which field is incorrect?'}</Label>
              <Select value={fieldKey} onValueChange={(value) => setFieldKey(value as FieldKey)}>
                <SelectTrigger id="correction-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_KEYS.map((key) => <SelectItem key={key} value={key}>{fields[key]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposed-value">{nl ? 'Voorgestelde juiste waarde' : 'Proposed correct value'}</Label>
              <Textarea id="proposed-value" required maxLength={2000} value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="explanation">{nl ? 'Toelichting (optioneel)' : 'Explanation (optional)'}</Label>
              <Textarea id="explanation" maxLength={4000} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidence-url">{nl ? 'Openbare bronlink (optioneel)' : 'Public evidence link (optional)'}</Label>
              <Input id="evidence-url" type="url" pattern="https?://.+" maxLength={2048} placeholder="https://…" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
              <p className="text-xs text-muted-foreground">
                {nl ? 'Deel geen privégegevens. Alleen openbare http- of https-links worden geaccepteerd.' : 'Do not share private information. Only public http or https links are accepted.'}
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>
                {nl
                  ? 'Ik begrijp dat mijn correctie, toelichting en bronlink worden bewaard voor beoordeling en misbruikpreventie. Ze worden niet automatisch gepubliceerd.'
                  : 'I understand that my correction, explanation, and evidence link are retained for review and abuse prevention. They are not published automatically.'}
              </span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => navigate('/')}>{nl ? 'Annuleren' : 'Cancel'}</Button>
              <Button type="submit" disabled={mutation.isPending}>
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                {mutation.isPending ? (nl ? 'Verzenden…' : 'Submitting…') : (nl ? 'Correctie verzenden' : 'Submit correction')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}