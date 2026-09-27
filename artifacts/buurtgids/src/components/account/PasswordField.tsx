import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountTranslations, type Language } from '@/lib/i18n';

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  language: Language;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  testId: string;
};

/**
 * Password input with show/hide, hint announced before the field, and the
 * error associated through `aria-describedby` (REG-022, A11Y-007). Password
 * managers get the right `autocomplete` token; the value never leaves the
 * form except to the identity provider.
 */
export function PasswordField({ id, label, value, onChange, language, autoComplete, hint, error, disabled, testId }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const copy = accountTranslations[language].security;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      <div className="flex items-stretch gap-2">
        <Input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          data-testid={testId}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? copy.hidePassword : copy.showPassword}
          data-testid={`${testId}-toggle`}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-border px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? <p id={`${id}-error`} role="alert" data-testid={`${testId}-error`} className="text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
