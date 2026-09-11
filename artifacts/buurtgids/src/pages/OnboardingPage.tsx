import React, { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { ArrowRight, Check, Globe2, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { useLocation, Redirect, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LANGUAGE_KEY = 'buurtplaza-language';
const NEIGHBORHOOD_KEY = 'buurtplaza-neighborhood-preference';
const ONBOARDING_KEY = 'buurtplaza-onboarding-complete';

type Language = 'nl' | 'en';

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

export default function OnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [language, setLanguage] = useState<Language>('nl');
  const [neighborhood, setNeighborhood] = useState('');
  const [postcode, setPostcode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Welkom bij Buurtplaza';
  }, []);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setLanguage(window.localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'nl');
    const storedPreference = window.localStorage.getItem(NEIGHBORHOOD_KEY);
    if (storedPreference) {
      try {
        const parsed = JSON.parse(storedPreference) as { neighborhood?: string; postcode?: string } | null;
        setNeighborhood(parsed?.neighborhood ?? '');
        setPostcode(parsed?.postcode ?? '');
      } catch {
        window.localStorage.removeItem(NEIGHBORHOOD_KEY);
      }
    }
  }, [user]);

  if (!isLoaded) return <OnboardingSkeleton />;
  if (!isSignedIn || !user) return <Redirect to="/sign-in" />;

  const finish = async (skip = false) => {
    setError('');
    setIsSaving(true);
    try {
      if (!skip) {
        const profileUpdates: { firstName?: string; lastName?: string } = {};
        if (firstName.trim() !== (user.firstName ?? '')) profileUpdates.firstName = firstName.trim();
        if (lastName.trim() !== (user.lastName ?? '')) profileUpdates.lastName = lastName.trim();
        if (Object.keys(profileUpdates).length > 0) await user.update(profileUpdates);
        window.localStorage.setItem(LANGUAGE_KEY, language);
        window.localStorage.setItem(
          NEIGHBORHOOD_KEY,
          JSON.stringify({ neighborhood: neighborhood.trim(), postcode: postcode.trim() }),
        );
        document.documentElement.lang = language;
      }
      window.localStorage.setItem(ONBOARDING_KEY, 'true');
      setLocation('/');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Opslaan is niet gelukt. Probeer het opnieuw.');
    } finally {
      setIsSaving(false);
    }
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
          <span data-testid="text-onboarding-step" className="rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-bold text-muted-foreground">
            Eerste stap · 1 van 1
          </span>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <section className="pt-2">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapPin className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mb-3 text-sm font-extrabold uppercase tracking-[0.16em] text-primary">Welkom in de buurt</p>
            <h1 data-testid="heading-onboarding" className="max-w-md font-serif text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              Maak Buurtplaza persoonlijk voor jou.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Een paar voorkeuren helpen ons om lokale plekken en activiteiten sneller bij jou in de buurt te brengen.
              <span className="mt-2 block text-sm">A few details help us make your local guide feel like home.</span>
            </p>
            <div className="mt-8 space-y-3 text-sm text-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>Je profiel wordt beheerd door Clerk. Buurtvoorkeuren blijven alleen in deze browser.</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>Je kunt alles later aanpassen of overslaan.</span>
              </div>
            </div>
          </section>

          <Card className="overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-xl shadow-secondary/5">
            <CardHeader className="border-b border-border/70 bg-accent/35 px-6 py-6 sm:px-8">
              <CardTitle className="flex items-center gap-2 text-xl">
                <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
                Jouw startpunt
              </CardTitle>
              <CardDescription>
                Deze naam komt uit je Clerk-account. Taal en buurt zijn optionele voorkeuren in je browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-7 sm:px-8">
              <form
                data-testid="form-onboarding"
                onSubmit={(event) => {
                  event.preventDefault();
                  void finish();
                }}
                className="space-y-6"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-first-name">Voornaam / First name</Label>
                    <Input
                      id="onboarding-first-name"
                      data-testid="input-onboarding-first-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      autoComplete="given-name"
                      placeholder="Bijv. Noor"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-last-name">Achternaam / Last name</Label>
                    <Input
                      id="onboarding-last-name"
                      data-testid="input-onboarding-last-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      autoComplete="family-name"
                      placeholder="Bijv. Jansen"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="onboarding-language">Voorkeurstaal / Preferred language</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'nl' as const, label: 'Nederlands', detail: 'Mijn buurt, mijn taal' },
                      { value: 'en' as const, label: 'English', detail: 'My neighborhood, my language' },
                    ]).map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        data-testid={`button-language-${option.value}`}
                        aria-pressed={language === option.value}
                        onClick={() => setLanguage(option.value)}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          language === option.value
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-background/50 text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-bold">
                          <Globe2 className="h-4 w-4 text-primary" aria-hidden="true" />
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs">{option.detail}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="onboarding-neighborhood">Buurt of postcode <span className="font-normal text-muted-foreground">(optioneel)</span></Label>
                    <p className="mt-1 text-xs text-muted-foreground">Alleen opgeslagen in deze browser, niet in je account.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_0.65fr]">
                    <Input
                      id="onboarding-neighborhood"
                      data-testid="input-onboarding-neighborhood"
                      value={neighborhood}
                      onChange={(event) => setNeighborhood(event.target.value)}
                      placeholder="Bijv. Zeeheldenkwartier"
                    />
                    <Input
                      id="onboarding-postcode"
                      data-testid="input-onboarding-postcode"
                      value={postcode}
                      onChange={(event) => setPostcode(event.target.value)}
                      autoComplete="postal-code"
                      placeholder="2518 AB"
                    />
                  </div>
                </div>

                {error && (
                  <p data-testid="status-onboarding-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    data-testid="button-skip-onboarding"
                    onClick={() => void finish(true)}
                    disabled={isSaving}
                    className="text-sm font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Overslaan voor nu
                  </button>
                  <Button type="submit" data-testid="button-save-onboarding" disabled={isSaving} className="gap-2 font-bold">
                    {isSaving ? 'Even opslaan…' : 'Opslaan en ontdekken'}
                    {!isSaving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </form>
              <p className="mt-5 text-center text-xs text-muted-foreground">
                Later je profiel of beveiliging beheren? <Link data-testid="link-onboarding-account" href="/account" className="font-bold text-primary hover:underline">Ga naar account</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}