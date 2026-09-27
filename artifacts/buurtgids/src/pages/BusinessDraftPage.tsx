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
import { accountErrorMessage, businessIntakeTranslations, LANGUAGE_OPTIONS, translations, type Language } from '@/lib/i18n';
import { BUSINESS_CATEGORIES, FOOD_TYPES, LOCATIONS, type BusinessCategory, type FoodType } from '@/lib/data';
import { RETURN_PATH_PARAM, sanitizeReturnPath, withReturnPath } from '@/lib/returnPath';
import { journeyContextFromSearch, type BusinessIntentContext } from '@/lib/businessIntent';
import { BusinessJourneySteps } from '@/components/BusinessJourneySteps';
import { useAppLanguage } from '@/lib/useAppLanguage';

const RELATIONSHIP_KINDS = ['owner', 'manager', 'representative'] as const;
const FOOD_DRINK: BusinessCategory = 'Food & Drink';
const HAGUE_NEIGHBORHOODS: readonly string[] = LOCATIONS.find((location) => location.id === 'dhg')?.neighborhoods ?? [];
const PHONE = /^[+0-9][0-9 ()-]{6,24}$/;
/** Field-level codes the server may return (BPROF-003/004); anything else falls back to the generic message. */
type FieldErrorCode = 'required' | 'invalid' | 'postcode_required' | 'phone_or_website_required' | 'unknown_neighborhood' | 'invalid_url';
const SERVER_FIELDS: Record<string, keyof Values> = {
  'business.name': 'name', 'business.category': 'category', 'business.subcategory': 'subcategory', 'business.neighborhood': 'neighborhood',
  'business.address': 'address', 'business.websiteUrl': 'websiteUrl', 'business.phone': 'phone', contactName: 'contactName', contactEmail: 'contactEmail',
  relationshipKind: 'relationshipKind', relationship: 'relationship', authorityDeclaration: 'authorityDeclaration',
  evidenceKvk: 'evidenceKvk', evidenceDomain: 'evidenceDomain', evidenceReference: 'evidenceReference', message: 'message',
};
const KVK = /^[0-9]{8}$/;
const DOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const schema = z.object({
  name: z.string().max(160),
  category: z.string().max(80),
  subcategory: z.string().max(80),
  neighborhood: z.string().max(120),
  address: z.string().max(240),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  phone: z.string().regex(PHONE, 'phone').or(z.literal('')),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(254),
  // The role is an explicit choice (BVER-001): nothing is pre-selected on the claimant's behalf.
  relationshipKind: z.enum(RELATIONSHIP_KINDS, { errorMap: () => ({ message: 'role' }) }),
  relationship: z.string().max(120),
  authorityDeclaration: z.string().min(10).max(1200),
  evidenceReference: z.string().max(400),
  evidenceKvk: z.string().regex(KVK, 'kvk').or(z.literal('')),
  evidenceDomain: z.string().max(253).regex(DOMAIN, 'domain').or(z.literal('')),
  message: z.string().max(1200),
});
// Drafts may be partial (BPROF-009): the server enforces the required facts at submit.
const newBusinessSchema = schema.extend({
  name: z.string().min(2).max(160),
  category: z.enum(BUSINESS_CATEGORIES as [BusinessCategory, ...BusinessCategory[]], { errorMap: () => ({ message: 'category' }) }),
  neighborhood: z.string().min(2).max(120),
});
type Values = z.infer<typeof schema>;
const defaults: Values = { name: '', category: '', subcategory: '', neighborhood: '', address: '', websiteUrl: '', phone: '', contactName: '', contactEmail: '', relationshipKind: '' as Values['relationshipKind'], relationship: '', authorityDeclaration: '', evidenceReference: '', evidenceKvk: '', evidenceDomain: '', message: '' };

function relationshipKindOf(value: string | null | undefined): Values['relationshipKind'] {
  // Legacy claims without a structured kind stay unselected; the claimant decides.
  return (RELATIONSHIP_KINDS as readonly string[]).includes(value ?? '') ? (value as Values['relationshipKind']) : ('' as Values['relationshipKind']);
}

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
  // Journey (v0.5.2): the entry context is recorded on the draft; the return path leads back after the receipt.
  const journeyContext: BusinessIntentContext | null = journeyContextFromSearch(window.location.search);
  const journeyReturn = sanitizeReturnPath(params.get(RETURN_PATH_PARAM));
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
      subcategory: item.kind === 'new_business' ? item.profile.subcategory ?? '' : '',
      neighborhood: item.kind === 'new_business' ? item.profile.neighborhood ?? '' : '',
      address: item.kind === 'new_business' ? item.profile.address ?? '' : '',
      websiteUrl: item.kind === 'new_business' ? item.profile.websiteUrl ?? '' : '',
      phone: item.kind === 'new_business' ? item.profile.phone ?? '' : '',
      contactName: item.contactName,
      contactEmail: item.contactEmail,
      relationshipKind: relationshipKindOf(item.relationshipKind),
      // Legacy wording is kept unless it merely echoes a role label, which the select now carries.
      relationship: (Object.values(businessIntakeTranslations) as { relationshipKinds: Record<string, string> }[]).some((t) => Object.values(t.relationshipKinds).includes(item.relationship)) ? '' : item.relationship,
      authorityDeclaration: item.authorityDeclaration ?? '',
      evidenceReference: item.evidenceReference ?? '',
      evidenceKvk: item.evidenceKvk ?? '',
      evidenceDomain: item.evidenceDomain ?? '',
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
    if (error?.code === 'VALIDATION_FAILED' && error.fieldErrors?.length) {
      // Server-side facts checks land on the field they concern (BPROF-003/004).
      let mapped = false;
      for (const fieldError of error.fieldErrors) {
        const field = SERVER_FIELDS[fieldError.field];
        if (!field) continue;
        mapped = true;
        form.setError(field, { type: 'server', message: fieldError.code }, { shouldFocus: !mapped });
      }
      toast.error(mapped ? copy.fieldErrorsToast : accountErrorMessage(failure, language));
      return;
    }
    toast.error(accountErrorMessage(failure, language));
  };

  const save = async (values: Values): Promise<BusinessClaim> => {
    // `relationship` stays the human wording (required by the intake); the structured kind travels alongside.
    const relationship = values.relationship.trim().length >= 2 ? values.relationship.trim() : copy.relationshipKinds[values.relationshipKind];
    const authority = {
      relationship, relationshipKind: values.relationshipKind,
      authorityDeclaration: values.authorityDeclaration,
    };
    const business = {
      name: values.name, category: values.category as BusinessCategory, neighborhood: values.neighborhood,
      subcategory: values.category === FOOD_DRINK && values.subcategory ? values.subcategory : null,
      address: values.address || null, websiteUrl: values.websiteUrl || null, phone: values.phone || null,
    };
    if (claim) {
      const saved = await update.mutateAsync({
        id: claim.id,
        data: {
          expectedVersion: claim.version ?? 1,
          contactName: values.contactName, contactEmail: values.contactEmail, ...authority,
          evidenceReference: values.evidenceReference || null, message: values.message || null,
          evidenceKvk: values.evidenceKvk || null, evidenceDomain: values.evidenceDomain || null,
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
      contactName: values.contactName, contactEmail: values.contactEmail, ...authority,
      evidenceReference: values.evidenceReference || undefined, message: values.message || undefined,
      evidenceKvk: values.evidenceKvk || undefined, evidenceDomain: values.evidenceDomain || undefined,
      ...(journeyContext ? { onboardingContext: journeyContext } : {}),
    };
    const saved = await create.mutateAsync({ data });
    setCurrent(saved);
    queryClient.setQueryData(getGetBusinessClaimQueryKey(saved.id), saved);
    const testParam = auth.isTestAuth ? '&e2eAccountAuth=1' : '';
    const journeyParams = `${journeyContext ? `&context=${journeyContext}` : ''}${journeyReturn ? `&${RETURN_PATH_PARAM}=${encodeURIComponent(journeyReturn)}` : ''}`;
    setLocation(`/bedrijf-nieuw?claim=${saved.id}&locale=${language}${testParam}${journeyParams}`, { replace: true });
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
        {journeyContext ? <BusinessJourneySteps language={language} current="review" /> : null}
        <Card><CardHeader><CardTitle>{copy.receiptTitle}</CardTitle></CardHeader><CardContent className="space-y-5">
          <Badge>{copy.status[claim.status]}</Badge>
          <p>{claim.status === 'withdrawn' ? copy.withdrawn : copy.receiptBody}</p>
          <div className="flex flex-wrap gap-3"><Button asChild><Link href="/mijn-bedrijf">{copy.myBusiness}</Link></Button>
            <Button asChild variant="outline"><Link href="/bedrijf-zoeken">{copy.backToLookup}</Link></Button>
            {journeyReturn ? <Button asChild variant="ghost"><Link href={journeyReturn} data-testid="link-journey-return">{copy.backToJourney}</Link></Button> : null}
            {open ? <Button variant="destructive" onClick={() => void onWithdraw()} disabled={withdraw.isPending}>{copy.withdraw}</Button> : null}
          </div>
        </CardContent></Card>
      </main>
    );
  }

  const isNew = claim ? claim.kind === 'new_business' : validNew;
  const busy = create.isPending || update.isPending || submit.isPending;
  const selectedCategory = form.watch('category');
  const categoryLabels = translations[language].businessCategories as Record<string, string>;
  const fieldError = (field: keyof Values): string | undefined => {
    const message = form.formState.errors[field]?.message;
    if (!message) return undefined;
    return copy.fieldErrors[message as FieldErrorCode] ?? copy.fieldErrors.invalid;
  };
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12" data-testid="page-business-draft">
      <div className="mb-6 flex justify-end">
        <ClaimLanguageSelector language={language} onLanguageChange={changeLanguage} />
      </div>
      {journeyContext ? <BusinessJourneySteps language={language} current="details" /> : null}
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
              // Claiming a candidate instead keeps the journey origin and return path (v0.5.2).
              const candidateParams = new URLSearchParams({
                kind: 'existing_listing',
                cityId: candidate.cityId,
                listingSource: candidate.listingSource,
                listingId: candidate.listingId,
                locale: language,
                ...(journeyContext ? { context: journeyContext } : {}),
                ...(journeyReturn ? { [RETURN_PATH_PARAM]: journeyReturn } : {}),
                ...(auth.isTestAuth ? { e2eAccountAuth: '1' } : {}),
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
        {isNew ? <><Field label={copy.name} visibility={copy.visibilityPublic} error={fieldError('name')}><Input data-testid="input-business-name" {...form.register('name')} /></Field>
          <Field label={copy.category} visibility={copy.visibilityPublic} error={fieldError('category')}>
            <select data-testid="select-business-category" className={SELECT_CLASS} {...form.register('category')}>
              <option value="">{copy.categoryChoose}</option>
              {BUSINESS_CATEGORIES.map((value) => <option key={value} value={value}>{categoryLabels[value] ?? value}</option>)}
            </select>
          </Field>
          {selectedCategory === FOOD_DRINK ? (
            <Field label={copy.subcategory} visibility={copy.visibilityPublic} error={fieldError('subcategory')}>
              <select data-testid="select-business-subcategory" className={SELECT_CLASS} {...form.register('subcategory')}>
                <option value="">{copy.subcategoryChoose}</option>
                {FOOD_TYPES.map((value) => <option key={value} value={value}>{copy.foodTypes[value as FoodType]}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label={copy.address} visibility={copy.visibilityPublic} help={copy.addressHelp} error={fieldError('address')}><Input data-testid="input-business-address" {...form.register('address')} /></Field>
          <Field label={copy.neighborhood} visibility={copy.visibilityPublic} help={copy.neighborhoodHelp} error={fieldError('neighborhood')}>
            <select data-testid="select-business-neighborhood" className={SELECT_CLASS} {...form.register('neighborhood')}>
              <option value="">{copy.neighborhoodChoose}</option>
              {HAGUE_NEIGHBORHOODS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
          <Field label={copy.phone} visibility={copy.visibilityPublic} help={copy.phoneOrWebsiteHelp} error={fieldError('phone')}><Input type="tel" data-testid="input-business-phone" {...form.register('phone')} /></Field>
          <Field label={copy.websiteUrl} visibility={copy.visibilityPublic} error={fieldError('websiteUrl')}><Input type="url" data-testid="input-business-website" {...form.register('websiteUrl')} /></Field></> : null}
        <Field label={copy.contactName} visibility={copy.visibilityPrivate} error={fieldError('contactName')}><Input {...form.register('contactName')} /></Field>
        <Field label={copy.contactEmail} visibility={copy.visibilityPrivate} error={fieldError('contactEmail')}><Input type="email" {...form.register('contactEmail')} /></Field>
        <Field label={copy.relationshipKind} visibility={copy.visibilityPrivate} help={copy.relationshipKindHelp} error={form.formState.errors.relationshipKind ? copy.relationshipKindRequired : undefined}>
          <select data-testid="select-relationship-kind" className={SELECT_CLASS} {...form.register('relationshipKind')}>
            <option value="">{copy.relationshipKindChoose}</option>
            {RELATIONSHIP_KINDS.map((value) => <option key={value} value={value}>{copy.relationshipKinds[value]}</option>)}
          </select>
        </Field>
        <Field label={copy.relationship} visibility={copy.visibilityPrivate} error={fieldError('relationship')}><Input {...form.register('relationship')} /></Field>
        <Field label={copy.authority} visibility={copy.visibilityPrivate} help={copy.authorityHelp} error={fieldError('authorityDeclaration')}><Textarea {...form.register('authorityDeclaration')} /></Field>
        <Field label={copy.evidenceKvk} visibility={copy.visibilityPrivate} help={copy.evidenceKvkHelp} error={form.formState.errors.evidenceKvk ? copy.evidenceKvkInvalid : undefined}><Input inputMode="numeric" data-testid="input-evidence-kvk" {...form.register('evidenceKvk')} /></Field>
        <Field label={copy.evidenceDomain} visibility={copy.visibilityPrivate} help={copy.evidenceDomainHelp} error={form.formState.errors.evidenceDomain ? copy.evidenceDomainInvalid : undefined}><Input data-testid="input-evidence-domain" {...form.register('evidenceDomain', { setValueAs: (v: string) => v.trim().toLowerCase() })} /></Field>
        <Field label={copy.evidence} visibility={copy.visibilityPrivate} help={copy.evidenceHelp} error={fieldError('evidenceReference')}><Input {...form.register('evidenceReference')} /></Field>
        <Field label={copy.message} visibility={copy.visibilityPrivate} error={fieldError('message')}><Textarea {...form.register('message')} /></Field>
        <p className="text-sm text-muted-foreground" data-testid="text-authority-confirm">{copy.authorityConfirm}</p>
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

const SELECT_CLASS = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/** Every field says whether it ends up on the public profile (BPROF-005). */
function Field({ label, visibility, help, error, children }: { label: string; visibility?: string; help?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm font-medium">
          {label}
          {visibility ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-normal uppercase tracking-wide text-muted-foreground">{visibility}</span> : null}
        </span>
        {children}
      </label>
      {help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null}
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
function Message({ title, body, link }: { title: string; body: string; link?: string }) {
  return <main className="container mx-auto max-w-xl px-4 py-20 text-center"><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p>{body}</p>{link ? <Button asChild className="mt-5"><Link href="/bedrijf-zoeken">{link}</Link></Button> : null}</CardContent></Card></main>;
}