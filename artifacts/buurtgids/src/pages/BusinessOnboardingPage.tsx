import React, { useEffect } from 'react';
import { Building2, CheckCircle2, ClipboardCheck, ExternalLink, LogIn, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@clerk/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { featureFlags } from '@/lib/featureFlags';

export default function BusinessOnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    document.title = 'Bedrijf aanmelden | Buurtplaza';
  }, []);

  return (
    <main data-testid="page-business-onboarding" className="min-h-[100dvh] overflow-hidden bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="pointer-events-none fixed -right-48 top-0 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-5xl">
        <header className="mb-12 flex items-center justify-between gap-4">
          <Link href="/" data-testid="link-business-logo" className="text-lg font-extrabold tracking-tight text-foreground transition-colors hover:text-primary">
            buurt<span className="text-primary">plaza</span>
          </Link>
          <Link href="/" data-testid="link-business-back" className="text-sm font-bold text-muted-foreground hover:text-primary">
            Naar de gids
          </Link>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Voor lokale ondernemers
            </div>
            <h1 data-testid="heading-business-onboarding" className="max-w-2xl font-serif text-5xl font-semibold leading-[1.02] text-foreground sm:text-6xl">
              Zorg dat jouw zaak klopt in de buurt.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Buurtplaza werkt met gecontroleerde vermeldingen. Gebruik eerst je gedeelde account, zoek daarna je bestaande vermelding en vraag een claim aan voor redactionele beoordeling.
              <span className="mt-2 block text-sm leading-6">First create or use your shared account. Then select an existing verified listing for editorial review.</span>
            </p>

            {!isLoaded ? (
              <div data-testid="status-business-auth-loading" className="mt-8 h-12 w-full max-w-md animate-pulse rounded-xl bg-muted" />
            ) : isSignedIn ? (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild data-testid="button-business-workspace" className="gap-2 font-bold">
                  <Link href="/mijn-bedrijf">
                    Naar mijn bedrijfsruimte
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" data-testid="button-business-claim" className="gap-2 font-bold">
                  <Link href={featureFlags.businessIntake ? '/bedrijf-zoeken' : '/'}>
                    Vermelding zoeken in de gids
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild data-testid="button-business-sign-in" className="gap-2 font-bold">
                  <Link href="/sign-in">
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    Inloggen
                  </Link>
                </Button>
                <Button asChild variant="outline" data-testid="button-business-sign-up" className="font-bold">
                  <Link href="/sign-up">Account maken</Link>
                </Button>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Heb je nog geen account? Dat is hetzelfde account voor je persoonlijke en zakelijke Buurtplaza-activiteiten.
            </p>
          </div>

          <Card className="relative overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-xl shadow-secondary/5">
            <CardContent className="p-6 sm:p-8">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-primary">Zo werkt het</p>
              <div className="mt-7 space-y-7">
                {[
                  {
                    icon: LogIn,
                    title: '1. Eén gedeeld account',
                    text: 'Log in of maak een account aan. Je hoeft geen apart zakelijk profiel te maken.',
                  },
                  {
                    icon: Search,
                    title: '2. Vind je bestaande vermelding',
                    text: 'Kies een al gecontroleerde plek uit de Buurtplaza-gids. Zo blijft de buurtgids betrouwbaar.',
                  },
                  {
                    icon: ClipboardCheck,
                    title: '3. Claim voor beoordeling',
                    text: 'Dien je relatie met de zaak in. De redactie beoordeelt de aanvraag voordat je profielbeheer krijgt.',
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} data-testid={`business-step-${title.slice(0, 1)}`} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-bold text-foreground">{title}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-foreground">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>Geen nieuwe, onbevestigde pagina’s: eerst een bestaande vermelding, dan pas redactioneel beheer.</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="mt-14 flex flex-col gap-4 border-t border-border/70 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" /> Transparant voor ondernemers en buurtbewoners</span>
          <Link href="/account" data-testid="link-business-account" className="font-bold text-primary hover:underline">Account- en beveiligingsinstellingen</Link>
        </footer>
      </div>
    </main>
  );
}