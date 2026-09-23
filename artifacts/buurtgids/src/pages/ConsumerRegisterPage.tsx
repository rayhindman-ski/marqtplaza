import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ShieldCheck } from 'lucide-react';

import { useRequestConsumerRegistration, type ApiError, type ApiFieldError } from '@workspace/api-client-react';

import { AccountShell } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, type Language } from '@/lib/i18n';
import { RETURN_PATH_PARAM, sanitizeReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

/**
 * Consumer registration request (v0.5.1, REG-001 – REG-004). Collects contact
 * data only; no password, no account, no session. The outcome page is neutral
 * about whether the address already has an account (REG-008).
 */

export const REGISTRATION_EMAIL_STORAGE_KEY = 'buurtplaza.registration.email';
export const REGISTRATION_LIFETIME_STORAGE_KEY = 'buurtplaza.registration.linkLifetimeMinutes';

type RegisterCopy = (typeof accountTranslations)[Language]['register'];

export function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  return data as ApiError;
}

function fieldMessage(copy: RegisterCopy, issue: ApiFieldError | undefined): string | null {
  if (!issue) return null;
  const key = `field_${issue.code}` as keyof RegisterCopy;
  return key in copy ? copy[key] : copy.field_invalid;
}

export function RegistrationUnavailable({ language }: { language: Language }) {
  const copy = accountTranslations[language];
  return (
    <section data-testid="status-registration-unavailable" role="status" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
      <h2 className="font-serif text-2xl font-semibold text-foreground">{copy.register.unavailableTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.register.unavailableBody}</p>
      <Link href="/" className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
        {copy.back}
      </Link>
    </section>
  );
}

function rememberForCheckEmail(email: string, minutes: number): void {
  try {
    window.sessionStorage.setItem(REGISTRATION_EMAIL_STORAGE_KEY, email);
    window.sessionStorage.setItem(REGISTRATION_LIFETIME_STORAGE_KEY, String(minutes));
  } catch {
    // Session storage may be unavailable (private mode); the check-email page then asks for the address again.
  }
}

export default function ConsumerRegisterPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const register = copy.register;
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const returnRef = sanitizeReturnPath(params.get(RETURN_PATH_PARAM));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldIssues, setFieldIssues] = useState<ApiFieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useRequestConsumerRegistration();

  if (!featureFlags.consumerRegistration) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={register.eyebrow} title={register.title} testId="page-register" headingTestId="heading-register">
        <RegistrationUnavailable language={language} />
      </AccountShell>
    );
  }

  const issueFor = (field: string) => fieldMessage(register, fieldIssues.find((issue) => issue.field === field));
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  // After a failed submit, move focus to the first invalid field (or the form-level error) so the outcome is announced.
  useEffect(() => {
    if (focusRequest === 0) return;
    const first = ['name', 'email', 'phone'].find((field) => issueFor(field));
    if (first) document.getElementById(`register-${first}`)?.focus();
    else formErrorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldIssues([]);
    const local: ApiFieldError[] = [];
    if (!name.trim()) local.push({ field: 'name', code: 'required' });
    if (!email.trim()) local.push({ field: 'email', code: 'required' });
    if (!phone.trim()) local.push({ field: 'phone', code: 'required' });
    if (local.length > 0) {
      setFieldIssues(local);
      setFocusRequest((n) => n + 1);
      return;
    }
    try {
      const result = await mutation.mutateAsync({
        data: { name: name.trim(), email: email.trim(), phone: phone.trim(), locale: language, ...(returnRef ? { returnRef } : {}) },
      });
      rememberForCheckEmail(email.trim(), result.linkLifetimeMinutes);
      navigate('/account/register/check-email');
    } catch (error) {
      const apiError = apiErrorFrom(error);
      if (apiError?.code === 'FEATURE_DISABLED') {
        setFormError(copy.errors['errors.feature_disabled']);
      } else if ((apiError?.code === 'VALIDATION_FAILED' || apiError?.code === 'UNKNOWN_FIELD') && apiError.fieldErrors?.length) {
        setFieldIssues(apiError.fieldErrors);
      } else {
        setFormError(accountErrorMessage(error, language));
      }
      setFocusRequest((n) => n + 1);
    }
  }

  const disabled = mutation.isPending;

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={register.eyebrow}
      title={register.title}
      intro={register.intro}
      backHref={returnRef ?? '/'}
      testId="page-register"
      headingTestId="heading-register"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <form onSubmit={onSubmit} noValidate data-testid="form-register" className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
          <p className="text-sm leading-6 text-muted-foreground">{register.noAccountYet}</p>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="register-name">{register.nameLabel}</Label>
              <Input
                id="register-name"
                name="name"
                autoComplete="name"
                data-testid="input-register-name"
                placeholder={register.namePlaceholder}
                value={name}
                maxLength={120}
                disabled={disabled}
                aria-invalid={issueFor('name') ? true : undefined}
                aria-describedby={issueFor('name') ? 'register-name-error' : undefined}
                onChange={(event) => setName(event.target.value)}
              />
              {issueFor('name') ? <p id="register-name-error" role="alert" data-testid="error-register-name" className="text-sm font-semibold text-destructive">{issueFor('name')}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-email">{register.emailLabel}</Label>
              <Input
                id="register-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                data-testid="input-register-email"
                placeholder={register.emailPlaceholder}
                value={email}
                maxLength={254}
                disabled={disabled}
                aria-invalid={issueFor('email') ? true : undefined}
                aria-describedby={issueFor('email') ? 'register-email-error' : 'register-email-hint'}
                onChange={(event) => setEmail(event.target.value)}
              />
              {issueFor('email') ? (
                <p id="register-email-error" role="alert" data-testid="error-register-email" className="text-sm font-semibold text-destructive">{issueFor('email')}</p>
              ) : (
                <p id="register-email-hint" className="text-xs text-muted-foreground">{register.emailHint}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-phone">{register.phoneLabel}</Label>
              <Input
                id="register-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                data-testid="input-register-phone"
                placeholder={register.phonePlaceholder}
                value={phone}
                maxLength={32}
                disabled={disabled}
                aria-invalid={issueFor('phone') ? true : undefined}
                aria-describedby={issueFor('phone') ? 'register-phone-error' : 'register-phone-hint'}
                onChange={(event) => setPhone(event.target.value)}
              />
              {issueFor('phone') ? (
                <p id="register-phone-error" role="alert" data-testid="error-register-phone" className="text-sm font-semibold text-destructive">{issueFor('phone')}</p>
              ) : (
                <p id="register-phone-hint" className="text-xs text-muted-foreground">{register.phoneHint}</p>
              )}
            </div>
          </div>

          {formError ? (
            <p ref={formErrorRef} tabIndex={-1} role="alert" data-testid="error-register-form" className="mt-5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" data-testid="button-register-submit" disabled={disabled} className="rounded-full">
              {disabled ? register.submitting : register.submit}
            </Button>
            <Link href="/sign-in" data-testid="link-register-sign-in" className="text-sm font-bold text-primary underline-offset-2 hover:underline">
              {register.signInLink}
            </Link>
          </div>
        </form>

        <aside className="rounded-3xl border border-border/80 bg-muted/40 p-6">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <h2 className="font-serif text-xl font-semibold text-foreground">{register.purposeTitle}</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{register.purposeBody}</p>
          <Link href="/account/privacy" data-testid="link-register-privacy" className="mt-4 inline-flex text-sm font-bold text-primary underline-offset-2 hover:underline">
            {register.privacyLink}
          </Link>
        </aside>
      </div>
    </AccountShell>
  );
}
