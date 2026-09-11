import React from 'react';
import { Redirect, Link } from 'wouter';
import { useAuth, useClerk } from '@clerk/react';
import { UserProfile } from '@clerk/react';
import { ArrowLeft, LockKeyhole, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function AccountPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  if (!isLoaded) {
    return (
      <main data-testid="status-account-loading" className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
        <div className="w-full max-w-md animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-5 w-72 rounded bg-muted" />
          <div className="h-96 rounded-3xl bg-muted" />
        </div>
      </main>
    );
  }

  if (!isSignedIn) return <Redirect to="/sign-in" />;

  return (
    <main data-testid="page-account" className="min-h-[100dvh] bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" data-testid="link-account-back" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-primary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Terug naar Buurtplaza
            </Link>
            <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.16em] text-primary">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              Account & beveiliging
            </p>
            <h1 data-testid="heading-account" className="mt-2 font-serif text-4xl font-semibold text-foreground sm:text-5xl">Jouw account</h1>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Beheer je profiel, e-mailadres en beveiliging veilig via Clerk. Je wachtwoord wijzigen doe je hier.
                <span className="ml-1">Manage your profile and security settings here.</span>
              </p>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-2"
                onClick={() => void signOut({ redirectUrl: basePath || '/' })}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Uitloggen
              </Button>
            </div>
          </div>
        </header>

        <div data-testid="account-profile-panel" className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-xl shadow-secondary/5">
          <UserProfile routing="path" path={`${basePath}/account`} />
        </div>
      </div>
    </main>
  );
}