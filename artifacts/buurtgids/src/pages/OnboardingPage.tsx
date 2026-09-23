import React, { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { ArrowRight, Check, HeartHandshake, LoaderCircle, ShieldCheck, UserRound } from 'lucide-react';
import { useLocation, Redirect, Link } from 'wouter';
import { LanguageToggle } from '@/components/account/AccountShell';
import { featureFlags } from '@/lib/featureFlags';
import { accountTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';
import {
  getGetRegistrationQueryKey,
  useGetRegistration,
  useSaveRegistration,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type RegistrationType = 'consumer' | 'business';

function OnboardingSkeleton() {
  return (
    <main data-testid="status-onboarding-loading" className="min-h-[100dvh] bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl animate-pulse space-y-6">
        <div className="h-5 w-28 rounded-full bg-muted" />
        <div className="h-12 w-3/4 rounded-xl bg-muted" />
        <div className="h-5 w-full max-w-xl rounded bg-muted" />
        <div className="h-80 rounded-3xl bg-muted" />
      </div>
    </main>
  );
}

/** Browser cache of the server-side research registration status. */
const REGISTRATION_MARKER_KEY = 'buurtplaza-onboarding-complete';

export default function OnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language].onboarding;
  const registrationQuery = useGetRegistration({
    query: {
      enabled: Boolean(isLoaded && isSignedIn && user),
      queryKey: getGetRegistrationQueryKey(),
    },
  });
  const saveRegistration = useSaveRegistration();

  const [name, setName] = useState('');
  const [registrationType, setRegistrationType] = useState<RegistrationType>('consumer');
  const [email, setEmail] = useState('');
  const [usefulnessRating, setUsefulnessRating] = useState<number | null>(null);
  const [referralLikelihood, setReferralLikelihood] = useState<number | null>(null);
  const [desiredFeatures, setDesiredFeatures] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.title = copy.docTitle;
  }, [copy.docTitle]);

  useEffect(() => {
    if (!user) return;
    setName((current) => current || user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '));
    setEmail((current) => current || user.primaryEmailAddress?.emailAddress || '');
  }, [user]);

  // The browser marker only mirrors the server-side registration; the server
  // stays the source of truth so a cleared or foreign browser cannot lie.
  useEffect(() => {
    if (!registrationQuery.data) return;
    if (registrationQuery.data.registered) {
      window.localStorage.setItem(REGISTRATION_MARKER_KEY, 'true');
    } else {
      window.localStorage.removeItem(REGISTRATION_MARKER_KEY);
    }
  }, [registrationQuery.data]);

  useEffect(() => {
    const registration = registrationQuery.data?.registration;
    if (!registration) return;
    setName(registration.name);
    setRegistrationType(registration.registrationType as RegistrationType);
    setEmail(registration.email);
    setUsefulnessRating(registration.usefulnessRating);
    setReferralLikelihood(registration.referralLikelihood);
    setDesiredFeatures(registration.desiredFeatures);
  }, [registrationQuery.data]);

  if (!isLoaded || registrationQuery.isLoading) return <OnboardingSkeleton />;
  if (!isSignedIn || !user) return <Redirect to="/sign-in" />;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaved(false);

    if (!name.trim() || !email.trim() || !usefulnessRating || !referralLikelihood || !desiredFeatures.trim()) {
      setError(copy.errorIncomplete);
      return;
    }

    saveRegistration.mutate({
      data: {
        name: name.trim(),
        registrationType,
        email: email.trim(),
        usefulnessRating,
        referralLikelihood,
        desiredFeatures: desiredFeatures.trim(),
      },
    }, {
      onSuccess: () => {
        setSaved(true);
        window.localStorage.setItem(REGISTRATION_MARKER_KEY, 'true');
      },
      onError: (saveError) => {
        const message = saveError instanceof Error ? saveError.message : '';
        setError(message || copy.errorSave);
      },
    });
  };

  return (
    <main data-testid="page-onboarding" className="min-h-[100dvh] overflow-hidden bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="pointer-events-none fixed -right-36 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none fixed -bottom-48 -left-32 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/"
            data-testid="link-onboarding-logo"
            className="text-lg font-extrabold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            buurt<span className="text-primary">plaza</span>
          </Link>
          <div className="flex items-center gap-3">
            <span data-testid="text-onboarding-step" className="rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-bold text-muted-foreground">
              {copy.step}
            </span>
            <LanguageToggle language={language} onLanguageChange={setLanguage} />
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <section className="pt-2">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HeartHandshake className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mb-3 text-sm font-extrabold uppercase tracking-[0.16em] text-primary">{copy.eyebrow}</p>
            <h1 data-testid="heading-onboarding" className="max-w-md font-serif text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              {copy.intro}
            </p>
            <div className="mt-8 space-y-3 text-sm text-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>{copy.trustClerk}</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>{copy.trustContribute}</span>
              </div>
            </div>
          </section>

          <Card className="overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-xl shadow-secondary/5">
            <CardHeader className="border-b border-border/70 bg-accent/35 px-6 py-6 sm:px-8">
              <CardTitle className="flex items-center gap-2 text-xl">
                <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
                {copy.cardTitle}
              </CardTitle>
              <CardDescription>{copy.cardDescription}</CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-7 sm:px-8">
              <form data-testid="form-onboarding" onSubmit={submit} className="space-y-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="registration-name">{copy.nameLabel}</Label>
                    <Input
                      id="registration-name"
                      data-testid="input-onboarding-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      placeholder={copy.namePlaceholder}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="registration-email">{copy.emailLabel}</Label>
                    <Input
                      id="registration-email"
                      data-testid="input-onboarding-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder={copy.emailPlaceholder}
                      required
                    />
                  </div>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold leading-none">{copy.typeLegend}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      { value: 'consumer' as const, label: copy.typeConsumer, detail: copy.typeConsumerDetail },
                      { value: 'business' as const, label: copy.typeBusiness, detail: copy.typeBusinessDetail },
                    ]).map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        data-testid={`button-registration-type-${option.value}`}
                        aria-pressed={registrationType === option.value}
                        onClick={() => setRegistrationType(option.value)}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          registrationType === option.value
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-background/50 text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        <span className="block text-sm font-bold">{option.label}</span>
                        <span className="mt-1 block text-xs">{option.detail}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <RatingField
                  id="registration-usefulness"
                  label={copy.usefulnessLabel}
                  value={usefulnessRating}
                  onChange={setUsefulnessRating}
                  labels={copy.usefulnessScale}
                  ratingOf={copy.ratingOf}
                  testId="input-usefulness-rating"
                />

                <RatingField
                  id="registration-referral"
                  label={copy.referralLabel}
                  value={referralLikelihood}
                  onChange={setReferralLikelihood}
                  labels={copy.referralScale}
                  ratingOf={copy.ratingOf}
                  testId="input-referral-likelihood"
                />

                <div className="space-y-2">
                  <Label htmlFor="registration-desired-features">{copy.featuresLabel}</Label>
                  <Textarea
                    id="registration-desired-features"
                    data-testid="input-desired-features"
                    value={desiredFeatures}
                    onChange={(event) => setDesiredFeatures(event.target.value)}
                    placeholder={copy.featuresPlaceholder}
                    className="min-h-28 resize-y"
                    maxLength={2000}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{desiredFeatures.length}/2000</p>
                </div>

                {error && (
                  <p data-testid="status-onboarding-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
                {saved && (
                  <div data-testid="status-onboarding-success" role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
                    <p>{copy.savedBody}</p>
                    <Link
                      href={registrationType === 'business' ? '/bedrijf-aanmelden' : '/'}
                      className="mt-2 inline-flex font-bold underline underline-offset-4"
                    >
                      {registrationType === 'business' ? copy.savedContinueBusiness : copy.savedContinueHome}
                    </Link>
                  </div>
                )}

                {featureFlags.accounts && (
                  <p data-testid="text-onboarding-account-scope" className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
                    {accountTranslations[language].account.onboardingScopeBefore}{' '}
                    <Link href="/account/voorkeuren" data-testid="link-onboarding-preferences" className="font-bold text-primary underline-offset-4 hover:underline">
                      {accountTranslations[language].account.onboardingScopeLink}
                    </Link>
                    .
                  </p>
                )}

                <div className="flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <Link href="/account" className="text-sm font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {copy.later}
                  </Link>
                  <Button type="submit" data-testid="button-save-onboarding" disabled={saveRegistration.isPending} className="gap-2 font-bold">
                    {saveRegistration.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {saveRegistration.isPending ? copy.saving : saved ? copy.saveAgain : copy.save}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function RatingField({
  id,
  label,
  value,
  onChange,
  labels,
  ratingOf,
  testId,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  labels: readonly string[];
  ratingOf: (rating: number, detail: string) => string;
  testId: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold leading-6">{label}</legend>
      <div className="grid grid-cols-5 gap-2">
        {labels.map((detail, index) => {
          const rating = index + 1;
          return (
            <button
              type="button"
              key={rating}
              data-testid={`${testId}-${rating}`}
              aria-label={ratingOf(rating, detail)}
              aria-pressed={value === rating}
              onClick={() => onChange(rating)}
              className={`flex min-h-12 items-center justify-center rounded-xl border text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                value === rating
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {rating}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span className="text-right">{labels[labels.length - 1]}</span>
      </div>
    </fieldset>
  );
}