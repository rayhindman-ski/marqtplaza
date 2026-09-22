import { useEffect, useRef, useState } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  getGetBusinessClaimQueryKey,
  getGetMyBusinessClaimsQueryKey,
  type ApiError,
  type BusinessClaim,
  type BusinessIntakeDraftInput,
  type BusinessLookupMatch,
  useCreateBusinessIntakeDraft,
  useGetBusinessClaim,
  useSubmitBusinessClaim,
  useUpdateBusinessClaim,
  useWithdrawBusinessClaim,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Globe2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, businessIntakeTranslations, LANGUAGE_OPTIONS, type Language } from '@/lib/i18n';
import { withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

const schema = z.object({
  name: z.string().max(160),
  category: z.string().max(80),
  neighborhood: z.string().max(120),
  address: z.string().max(240),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(254),
  relationship: z.string().min(2).max(120),
  authorityDeclaration: z.string().min(10).max(1200),
  evidenceReference: z.string().max(400),
  message: z.string().max(1200),
});
const newBusinessSchema = schema.extend({
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(80),
  neighborhood: z.string().min(2).max(120),
});
type Values = z.infer<typeof schema>;
const defaults: Values = { name: '', category: '', neighborhood: '', address: '', websiteUrl: '', contactName: '', contactEmail: '', relationship: '', authorityDeclaration: '', evidenceReference: '', message: '' };

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && 'code' in data ? data as ApiError : null;
}

export default function BusinessDraftPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = businessIntakeTranslations[language];
  const auth = useAccountAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const claimValue = params.get('claim');
  const claimId = claimValue && /^\d+$/.test(claimValue) ? Number(claimValue) : null;
  const kind = params.get('kind');
  const identity = { cityId: params.get('cityId'), listingSource: params.get('listingSource'), listingId: params.get('listingId') };
  const validNew = kind === 'new_business';
  const validExisting = kind === 'existing_listing' && Object.values(identity).every(Boolean);
  const valid = claimId !== null || validNew || validExisting;
  const key = useRef(crypto.randomUUID());
  const hydrated = useRef<number | null>(null);
  const claimQuery = useGetBusinessClaim(claimId ?? 0, {
    query: { enabled: featureFlags.businessIntake && auth.isSignedIn && claimId !== null, queryKey: getGetBusinessClaimQueryKey(claimId ?? 0), retry: false },
  });
  const form = useForm<Values>({
    resolver: zodResolver(validNew || claimQuery.data?.kind === 'new_business' ? newBusinessSchema : schema),
    defaultValues: defaults,
  });
  const create = useCreateBusinessIntakeDraft({ request: { headers: { 'Idempotency-Key': key.current } } });
  const update = useUpdateBusinessClaim();
  const submit = useSubmitBusinessClaim();
  const withdraw = useWithdrawBusinessClaim();
  const [current, setCurrent] = useState<BusinessClaim | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<BusinessLookupMatch[]>([]);
  const [duplicateVersion, setDuplicateVersion] = useState<number | null>(null);
  const duplicateHeadingRef = useRef<HTMLHeadingElement>(null);
  const claim = current ?? claimQuery.data ?? null;
  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    const url = new URL(window.location.href);
    url.searchParams.set('locale', nextLanguage);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (!claimQuery.data || hydrated.current === claimQuery.data.id) return;
    hydrated.current = claimQuery.data.id;
    const item = claimQuery.data;
    form.reset({
      name: item.kind === 'new_business' ? item.profile.name : '',
      category: item.kind === 'new_business' ? item.profile.category ?? '' : '',
      neighborhood: item.kind === 'new_business' ? item.profile.neighborhood ?? '' : '',
      address: item.kind === 'new_business' ? item.profile.address ?? '' : '',
      websiteUrl: item.kind === 'new_business' ? item.profile.websiteUrl ?? '' : '',
      contactName: item.contactName,
      contactEmail: item.contactEmail,
      relationship: item.relationship,
      authorityDeclaration: item.authorityDeclaration ?? '',
      evidenceReference: item.evidenceReference ?? '',
      message: item.message ?? '',
    });
  }, [claimQuery.data, form]);

  useEffect(() => {
    if (duplicateCandidates.length > 0) duplicateHeadingRef.current?.focus();
  }, [duplicateCandidates]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setDuplicateCandidates([]);
      setDuplicateVersion(null);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  if (!featureFlags.businessIntake) return <Message title={copy.unavailableTitle} body={copy.unavailableBody} />;
  if (!auth.isLoaded) return <p className="p-10 text-center">{copy.loading}</p>;
  if (!auth.isSignedIn) {
    return <Redirect to={withReturnPath('/sign-in', `${window.location.pathname}${window.location.search}`)} />;
  }
  if (!valid) return <Message title={copy.invalidTitle} body={copy.invalidBody} link={copy.backToLookup} />;
  if (claimId !== null && claimQuery.isLoading) return <p className="p-10 text-center">{copy.loading}</p>;
  if (claimId !== null && claimQuery.isError) return <Message title={copy.invalidTitle} body={accountErrorMessage(claimQuery.error, language)} link={copy.backToLookup} />;

  const handleFailure = async (failure: unknown) => {
    const error = apiErrorFrom(failure);
    if (error?.code === 'VERSION_CONFLICT' && claimId !== null) {
      toast.error(copy.conflict);
      setCurrent(null);
      await claimQuery.refetch();
      return;
    }
    if (error?.code === 'IDEMPOTENCY_CONFLICT') {
      toast.error(error.fieldErrors?.[0]?.code === 'claim_in_review' ? copy.inReview : copy.duplicate);
      return;
    }
    toast.error(accountErrorMessage(failure, language));
  };

  const save = async (values: Values): Promise<BusinessClaim> => {
    const business = {
      name: values.name, category: values.category, neighborhood: values.neighborhood,
      address: values.address || undefined, websiteUrl: values.websiteUrl || undefined,
    };
    if (claim) {
      const saved = await update.mutateAsync({
        id: claim.id,
        data: {
          expectedVersion: claim.version ?? 1,
          contactName: values.contactName, contactEmail: values.contactEmail, relationship: values.relationship,
          authorityDeclaration: values.authorityDeclaration,
          evidenceReference: values.evidenceReference || null, message: values.message || null,
          ...(claim.kind === 'new_business' ? { business } : {}),
        },
      });
      setCurrent(saved);
      queryClient.setQueryData(getGetBusinessClaimQueryKey(saved.id), saved);
      return saved;
    }
    const data: BusinessIntakeDraftInput = {
      kind: validNew ? 'new_business' : 'existing_listing',
      ...(validNew ? { business } : { listing: { cityId: identity.cityId!, listingSource: identity.listingSource!, listingId: identity.listingId! } }),
      contactName: values.contactName, contactEmail: values.contactEmail, relationship: values.relationship,
      authorityDeclaration: values.authorityDeclaration,
      evidenceReference: values.evidenceReference || undefined, message: values.message || undefined,
    };
    const saved = await create.mutateAsync({ data });
    setCurrent(saved);
    queryClient.setQueryData(getGetBusinessClaimQueryKey(saved.id), saved);
    const testParam = auth.isTestAuth ? '&e2eAccountAuth=1' : '';
    setLocation(`/bedrijf-nieuw?claim=${saved.id}&locale=${language}${testParam}`, { replace: true });
    return saved;
  };

  const onSave = form.handleSubmit(async (values) => {
    try { await save(values); toast.success(copy.saved); } catch (failure) { await handleFailure(failure); }
  });
  const onSubmit = form.handleSubmit(async (values) => {
    let savedForSubmit: BusinessClaim | null = null;
    try {
      const saved = await save(values);
      savedForSubmit = saved;
      const submitted = await submit.mutateAsync({ id: saved.id, data: { expectedVersion: saved.version ?? 1 } });
      setCurrent(submitted);
      queryClient.setQueryData(getGetBusinessClaimQueryKey(submitted.id), submitted);
      void queryClient.invalidateQueries({ queryKey: getGetMyBusinessClaimsQueryKey() });
      toast.success(copy.submitted);
    } catch (failure) {
      const error = apiErrorFrom(failure);
      if (error?.code === 'DUPLICATE_CANDIDATES' && error.duplicateCandidates?.length) {
        setDuplicateCandidates(error.duplicateCandidates);
        setDuplicateVersion(savedForSubmit?.version ?? null);
      } else {
        await handleFailure(failure);
      }
    }
  });
  const confirmNewBusiness = async () => {
    if (!claim || duplicateVersion === null) return;
    try {
      const submitted = await submit.mutateAsync({
        id: claim.id,
        data: { expectedVersion: duplicateVersion, confirmNoDuplicate: true },
      });
      setDuplicateCandidates([]);
      setDuplicateVersion(null);
      setCurrent(submitted);
      queryClient.setQueryData(getGetBusinessClaimQueryKey(submitted.id), submitted);
      void queryClient.invalidateQueries({ queryKey: getGetMyBusinessClaimsQueryKey() });
      toast.success(copy.submitted);
    } catch (failure) {
      await handleFailure(failure);
    }
  };
  const onWithdraw = async () => {
    if (!claim || !window.confirm(copy.withdrawConfirm)) return;
    try {
      const result = await withdraw.mutateAsync({ id: claim.id, data: { expectedVersion: claim.version ?? 1 } });
      setCurrent(result);
      queryClient.setQueryData(getGetBusinessClaimQueryKey(result.id), result);
      void queryClient.invalidateQueries({ queryKey: getGetMyBusinessClaimsQueryKey() });
    } catch (failure) { await handleFailure(failure); }
  };
  const editable = !claim || claim.status === 'draft' || claim.status === 'changes_requested';
  const open = claim && ['draft', 'pending', 'submitted', 'changes_requested', 'disputed'].includes(claim.status);

  if (claim && !editable) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-12" data-testid="business-claim-receipt">
        <div className="mb-6 flex justify-end">
          <ClaimLanguageSelector language={language} onLanguageChange={changeLanguage} />
        </div>
        <Card><CardHeader><CardTitle>{copy.receiptTitle}</CardTitle></CardHeader><CardContent className="space-y-5">
          <Badge>{copy.status[claim.status]}</Badge>
          <p>{claim.status === 'withdrawn' ? copy.withdrawn : copy.receiptBody}</p>
          <div className="flex flex-wrap gap-3"><Button asChild><Link href="/mijn-bedrijf">{copy.myBusiness}</Link></Button>
            <Button asChild variant="outline"><Link href="/bedrijf-zoeken">{copy.backToLookup}</Link></Button>
            {open ? <Button variant="destructive" onClick={() => void onWithdraw()} disabled={withdraw.isPending}>{copy.withdraw}</Button> : null}
          </div>
        </CardContent></Card>
      </main>
    );
  }

  const isNew = claim ? claim.kind === 'new_business' : validNew;
  const busy = create.isPending || update.isPending || submit.isPending;
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12" data-testid="page-business-draft">
      <div className="mb-6 flex justify-end">
        <ClaimLanguageSelector language={language} onLanguageChange={changeLanguage} />
      </div>
      <h1 className="font-serif text-4xl font-semibold">{copy.draftTitle}</h1>
      {!isNew ? <p className="mt-2 text-muted-foreground">{copy.existingIntro}</p> : null}
      {claim?.status === 'changes_requested' ? <div role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4"><strong>{copy.changesTitle}</strong><p>{claim.reviewNote}</p></div> : null}
      {duplicateCandidates.length > 0 ? (
        <section data-testid="duplicate-candidates-panel" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="duplicate-candidates-heading">
          <h2 id="duplicate-candidates-heading" ref={duplicateHeadingRef} tabIndex={-1} className="text-xl font-bold text-amber-950">
            {copy.duplicateCandidatesTitle}
          </h2>
          <p className="mt-1 text-sm text-amber-900">{copy.duplicateCandidatesBody}</p>
          <ul className="mt-4 space-y-3">
            {duplicateCandidates.map((candidate) => {
              const candidateParams = new URLSearchParams({
                kind: 'existing_listing',
                cityId: candidate.cityId,
                listingSource: candidate.listingSource,
                listingId: candidate.listingId,
                locale: language,
              });
              return (
                <li key={`${candidate.listingSource}:${candidate.listingId}`} className="rounded-xl border border-amber-200 bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold">{candidate.name}</p>
                      <p className="text-sm text-muted-foreground">{[candidate.neighborhood, candidate.category].filter(Boolean).join(' · ')}</p>
                      {candidate.isClaimed ? <Badge variant="secondary" className="mt-2">{copy.claimed}</Badge> : null}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/bedrijf-nieuw?${candidateParams.toString()}`}>{copy.claimInstead}</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void confirmNewBusiness()} disabled={submit.isPending}>{copy.confirmNew}</Button>
            <Button type="button" variant="ghost" onClick={() => { setDuplicateCandidates([]); setDuplicateVersion(null); }}>{copy.cancelDuplicate}</Button>
          </div>
        </section>
      ) : null}
      <form className="mt-8 space-y-5">
        {isNew ? <><Field label={copy.name} error={form.formState.errors.name?.message}><Input {...form.register('name')} /></Field>
          <Field label={copy.category} error={form.formState.errors.category?.message}><Input list="business-categories" {...form.register('category')} /><datalist id="business-categories"><option value="Horeca" /><option value="Winkel" /><option value="Dienstverlening" /><option value="Zorg" /></datalist></Field>
          <Field label={copy.neighborhood} error={form.formState.errors.neighborhood?.message}><Input {...form.register('neighborhood')} /></Field>
          <Field label={copy.address} error={form.formState.errors.address?.message}><Input {...form.register('address')} /></Field>
          <Field label={copy.websiteUrl} error={form.formState.errors.websiteUrl?.message}><Input type="url" {...form.register('websiteUrl')} /></Field></> : null}
        <Field label={copy.contactName} error={form.formState.errors.contactName?.message}><Input {...form.register('contactName')} /></Field>
        <Field label={copy.contactEmail} error={form.formState.errors.contactEmail?.message}><Input type="email" {...form.register('contactEmail')} /></Field>
        <Field label={copy.relationship} error={form.formState.errors.relationship?.message}><Input {...form.register('relationship')} /></Field>
        <Field label={copy.authority} help={copy.authorityHelp} error={form.formState.errors.authorityDeclaration?.message}><Textarea {...form.register('authorityDeclaration')} /></Field>
        <Field label={copy.evidence} help={copy.evidenceHelp} error={form.formState.errors.evidenceReference?.message}><Input {...form.register('evidenceReference')} /></Field>
        <Field label={copy.message} error={form.formState.errors.message?.message}><Textarea {...form.register('message')} /></Field>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => void onSave()} disabled={busy}>{busy ? copy.saving : copy.save}</Button>
          <Button type="button" onClick={() => void onSubmit()} disabled={busy}>{copy.submit}</Button>
          {open ? <Button type="button" variant="destructive" onClick={() => void onWithdraw()}>{copy.withdraw}</Button> : null}
        </div>
      </form>
    </main>
  );
}

function ClaimLanguageSelector({
  language,
  onLanguageChange,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  const label = language === 'nl' ? 'Taal' : 'Language';
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 pl-3 text-xs font-bold shadow-sm">
      <Globe2 className="h-4 w-4 text-primary" aria-hidden="true" />
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={`button-language-${option.value}`}
          aria-pressed={language === option.value}
          onClick={() => onLanguageChange(option.value)}
          className={`rounded-full px-3 py-1.5 transition-colors ${language === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: React.ReactNode }) {
  return <div><label className="block"><span className="mb-2 block text-sm font-medium">{label}</span>{children}</label>{help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null}{error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}</div>;
}
function Message({ title, body, link }: { title: string; body: string; link?: string }) {
  return <main className="container mx-auto max-w-xl px-4 py-20 text-center"><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p>{body}</p>{link ? <Button asChild className="mt-5"><Link href="/bedrijf-zoeken">{link}</Link></Button> : null}</CardContent></Card></main>;
}