import React, { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Clock, Loader2, Lock, Send, ShieldAlert, Trash2 } from 'lucide-react';
import {
  getGetBusinessRevisionWorkspaceQueryKey,
  useDiscardBusinessRevision,
  useGetBusinessRevisionWorkspace,
  useSubmitBusinessRevision,
  useUpdateBusinessRevision,
  type ApiError,
  type BusinessRevisionContent,
  type BusinessRevisionUpdateInput,
  type BusinessRevisionWorkspace,
} from '@workspace/api-client-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { businessPublicationTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';

/**
 * Owner-facing bilingual profile editor and status dashboard. Everything the
 * owner types lands in a private draft revision; the public page only ever
 * shows the approved snapshot, so the editor never has to guard against
 * accidental publication itself.
 */

type TextKey = 'tagline' | 'description' | 'openingHours';
type FactKey = 'websiteUrl' | 'phone' | 'email' | 'address' | 'logoUrl' | 'coverUrl';
const TEXT_KEYS: TextKey[] = ['tagline', 'description', 'openingHours'];
const FACT_KEYS: FactKey[] = ['websiteUrl', 'phone', 'email', 'address', 'logoUrl', 'coverUrl'];

type FormState = {
  nl: Record<TextKey, string>;
  en: Record<TextKey, string>;
  facts: Record<FactKey, string>;
};

function emptyForm(): FormState {
  return {
    nl: { tagline: '', description: '', openingHours: '' },
    en: { tagline: '', description: '', openingHours: '' },
    facts: { websiteUrl: '', phone: '', email: '', address: '', logoUrl: '', coverUrl: '' },
  };
}

function formFromContent(content: BusinessRevisionContent | null | undefined): FormState {
  const form = emptyForm();
  if (!content) return form;
  for (const key of TEXT_KEYS) {
    form.nl[key] = content.nl[key] ?? '';
    form.en[key] = content.en[key] ?? '';
  }
  for (const key of FACT_KEYS) form.facts[key] = content.facts[key] ?? '';
  return form;
}

/** Only changed fields travel; empty strings clear a field explicitly. */
function diffForm(base: FormState, next: FormState): Omit<BusinessRevisionUpdateInput, 'expectedVersion'> {
  const patch: Omit<BusinessRevisionUpdateInput, 'expectedVersion'> = {};
  for (const language of ['nl', 'en'] as const) {
    for (const key of TEXT_KEYS) {
      if (base[language][key] !== next[language][key]) {
        patch[language] = { ...(patch[language] ?? {}), [key]: next[language][key] };
      }
    }
  }
  for (const key of FACT_KEYS) {
    if (base.facts[key] !== next.facts[key]) patch.facts = { ...(patch.facts ?? {}), [key]: next.facts[key] };
  }
  return patch;
}

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && 'code' in data ? (data as ApiError) : null;
}

function stateTone(state: string): string {
  switch (state) {
    case 'published':
    case 'approved':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
    case 'submitted':
      return 'bg-sky-500/10 text-sky-700 border-sky-500/30';
    case 'changes_requested':
    case 'stale':
      return 'bg-amber-500/10 text-amber-800 border-amber-500/30';
    case 'suspended':
    case 'unpublished':
      return 'bg-red-500/10 text-red-700 border-red-500/30';
    default:
      return 'bg-muted text-foreground border-border';
  }
}

export default function BusinessRevisionPage() {
  const [, params] = useRoute('/mijn-bedrijf/:id/profiel');
  const profileId = Number(params?.id);
  const [language] = useAppLanguage();
  const copy = businessPublicationTranslations[language];
  const { isSignedIn, isLoaded } = useAccountAuth();
  const queryClient = useQueryClient();
  const enabled = featureFlags.businessPublication && Number.isInteger(profileId) && profileId > 0 && Boolean(isSignedIn);

  const workspaceQuery = useGetBusinessRevisionWorkspace(profileId, {
    query: { enabled, queryKey: getGetBusinessRevisionWorkspaceQueryKey(profileId), retry: false },
  });
  const workspace = workspaceQuery.data;
  const update = useUpdateBusinessRevision();
  const submit = useSubmitBusinessRevision();
  const discard = useDiscardBusinessRevision();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadedRevisionKey, setLoadedRevisionKey] = useState<string | null>(null);

  const latest = workspace?.latestRevision ?? null;
  // Without any revision the server seeds the first draft from the profile
  // columns, so the editor starts from the same values instead of a blank form.
  const baseForm = useMemo(() => {
    const seeded = latest?.content ?? workspace?.approvedRevision?.content ?? null;
    if (seeded) return formFromContent(seeded);
    const profile = workspace?.profile;
    if (!profile) return emptyForm();
    return formFromContent({
      nl: { tagline: profile.tagline ?? null, description: profile.description ?? null, openingHours: profile.openingHours ?? null },
      en: { tagline: null, description: null, openingHours: null },
      facts: {
        websiteUrl: profile.websiteUrl ?? null, phone: profile.phone ?? null, email: profile.email ?? null,
        address: profile.address ?? null, logoUrl: profile.logoUrl ?? null, coverUrl: profile.coverUrl ?? null,
      },
    });
  }, [latest, workspace?.approvedRevision, workspace?.profile]);
  const revisionKey = workspace ? `${latest?.id ?? 'none'}:${latest?.updatedAt ?? ''}` : null;

  useEffect(() => {
    if (revisionKey && revisionKey !== loadedRevisionKey) {
      setForm(baseForm);
      setFieldErrors({});
      setLoadedRevisionKey(revisionKey);
    }
  }, [revisionKey, loadedRevisionKey, baseForm]);

  useEffect(() => {
    document.title = `${copy.editorTitle} | Buurtplaza`;
  }, [copy.editorTitle]);

  const locked = latest?.status === 'submitted' || workspace?.state === 'suspended';
  const expectedVersion = latest?.version ?? 0;
  const dirty = useMemo(() => Object.keys(diffForm(baseForm, form)).length > 0, [baseForm, form]);
  const busy = update.isPending || submit.isPending || discard.isPending;

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetBusinessRevisionWorkspaceQueryKey(profileId) });

  const handleFailure = (error: unknown) => {
    const apiError = apiErrorFrom(error);
    if (apiError?.code === 'VERSION_CONFLICT') {
      toast.error(apiError.fieldErrors?.some((issue) => issue.code === 'not_editable') ? copy.locked : copy.conflict);
      void refresh();
      return;
    }
    if (apiError?.code === 'VALIDATION_FAILED' || apiError?.code === 'UNKNOWN_FIELD') {
      const next: Record<string, string> = {};
      for (const issue of apiError.fieldErrors ?? []) next[issue.field] = issue.code;
      setFieldErrors(next);
      // Move focus to the first invalid control so keyboard and screen-reader
      // users land on the problem instead of only hearing the toast.
      const firstField = Object.keys(next)[0];
      if (firstField) {
        const controlId = firstField.startsWith('facts.') ? `facts-${firstField.slice(6)}` : firstField.replace('.', '-');
        window.setTimeout(() => document.getElementById(controlId)?.focus(), 0);
      }
      toast.error(next['nl.description'] === 'required' ? copy.emptySubmit : copy.invalid);
      return;
    }
    toast.error(copy.invalid);
  };

  const applyWorkspace = (next: BusinessRevisionWorkspace) => {
    queryClient.setQueryData(getGetBusinessRevisionWorkspaceQueryKey(profileId), next);
  };

  const saveDraft = async (): Promise<BusinessRevisionWorkspace | null> => {
    const patch = diffForm(baseForm, form);
    if (Object.keys(patch).length === 0) return workspace ?? null;
    try {
      const next = await update.mutateAsync({ id: profileId, data: { expectedVersion, ...patch } });
      applyWorkspace(next);
      setFieldErrors({});
      return next;
    } catch (error) {
      handleFailure(error);
      return null;
    }
  };

  const onSave = async () => {
    const next = await saveDraft();
    if (next) toast.success(copy.saved);
  };

  const onSubmit = async () => {
    const saved = await saveDraft();
    if (!saved) return;
    const version = saved.latestRevision?.version ?? 0;
    if (!saved.latestRevision || saved.latestRevision.status !== 'draft') {
      toast.error(copy.emptySubmit);
      return;
    }
    try {
      const next = await submit.mutateAsync({ id: profileId, data: { expectedVersion: version } });
      applyWorkspace(next);
      toast.success(copy.submitted);
    } catch (error) {
      handleFailure(error);
    }
  };

  const onDiscard = async () => {
    if (!latest || latest.status !== 'draft') return;
    try {
      const next = await discard.mutateAsync({ id: profileId, data: { expectedVersion: latest.version } });
      applyWorkspace(next);
      setLoadedRevisionKey(null);
      toast.success(copy.discarded);
    } catch (error) {
      handleFailure(error);
    }
  };

  if (!featureFlags.businessPublication) {
    return <Notice title={copy.unavailable} />;
  }
  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!isSignedIn) {
    return <Notice title={copy.signIn} />;
  }
  if (workspaceQuery.isError) {
    return <Notice title={copy.noAccess} />;
  }
  if (!workspace) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const state = workspace.state;
  const decision = workspace.latestDecision;
  const showDecisionNote = decision?.reason && (state === 'changes_requested' || state === 'suspended' || state === 'unpublished' || decision.decision === 'reject');

  return (
    <div className="min-h-screen bg-accent/20 pb-20" data-testid="business-revision-page">
      <div className="bg-primary/5 py-8 border-b border-primary/10">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6 space-y-3">
          <Link href="/mijn-bedrijf" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" /> {copy.backToWorkspace}
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{workspace.profile.name}</h1>
          <p className="text-muted-foreground">{copy.editorIntro}</p>
        </div>
      </div>

      <div className="container max-w-5xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-3 gap-8">
        <aside className="space-y-4 lg:order-2">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{copy.statusTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Badge variant="outline" className={`font-bold ${stateTone(state)}`} data-testid="owner-state">
                {copy.states[state] ?? state}
              </Badge>
              <p className="text-muted-foreground" data-testid="owner-state-help">{copy.stateHelp[state]}</p>
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{copy.approvedVersion}</dt>
                <dd className="font-semibold text-right">{workspace.approvedRevision ? `v${workspace.approvedRevision.version}` : copy.noVersion}</dd>
                <dt className="text-muted-foreground">{copy.latestVersion}</dt>
                <dd className="font-semibold text-right">{latest ? `v${latest.version}` : copy.noVersion}</dd>
              </dl>
              <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="owner-freshness">
                {workspace.freshness.status === 'fresh' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4" />}
                <span>
                  {copy.freshness[workspace.freshness.status]}
                  {workspace.freshness.checkedOn ? ` · ${copy.checkedOn} ${new Date(workspace.freshness.checkedOn).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB')}` : ''}
                </span>
              </div>
              {showDecisionNote && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="reviewer-note">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-1 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {copy.reviewerNote}</p>
                  <p className="text-sm whitespace-pre-wrap">{decision?.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {workspace.factChecks.length > 0 && (
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{copy.factChecks}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {workspace.factChecks.map((check) => (
                    <li key={check.field} className="flex flex-col gap-0.5">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">{copy[check.field as FactKey | TextKey] ?? check.field}</span>
                        <span className={check.status === 'contradicted' ? 'text-red-700 font-semibold' : 'text-muted-foreground'}>
                          {copy.checkStatus[check.status] ?? check.status}
                        </span>
                      </div>
                      {check.note && <p className="text-xs text-muted-foreground">{check.note}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>

        <form
          className="lg:col-span-2 space-y-6 lg:order-1"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave();
          }}
        >
          {locked && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-900" data-testid="editor-locked">
              <Lock className="w-4 h-4" /> {state === 'suspended' ? copy.stateHelp.suspended : copy.locked}
            </div>
          )}
          <fieldset disabled={locked || busy} className="space-y-6">
            {(['nl', 'en'] as const).map((lang) => (
              <Card key={lang} className="border-border/60 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">{lang === 'nl' ? copy.languageNl : copy.languageEn}</CardTitle>
                  {lang === 'en' && <CardDescription>{copy.languageHint}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  {TEXT_KEYS.map((key) => {
                    const id = `${lang}-${key}`;
                    const error = fieldErrors[`${lang}.${key}`];
                    const Component = key === 'tagline' ? Input : Textarea;
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={id}>{copy[key]}</Label>
                        <Component
                          id={id}
                          value={form[lang][key]}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `${id}-error` : undefined}
                          maxLength={key === 'tagline' ? 160 : key === 'description' ? 2400 : 600}
                          rows={key === 'description' ? 6 : 3}
                          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                            setForm((current) => ({ ...current, [lang]: { ...current[lang], [key]: event.target.value } }))
                          }
                        />
                        {error && <p id={`${id}-error`} className="text-xs text-destructive">{copy.invalid}</p>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">{copy.facts}</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                {FACT_KEYS.map((key) => {
                  const id = `facts-${key}`;
                  const error = fieldErrors[`facts.${key}`];
                  return (
                    <div key={key} className={`space-y-1.5 ${key === 'address' ? 'sm:col-span-2' : ''}`}>
                      <Label htmlFor={id}>{copy[key]}</Label>
                      <Input
                        id={id}
                        type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : key.endsWith('Url') ? 'url' : 'text'}
                        inputMode={key.endsWith('Url') ? 'url' : undefined}
                        value={form.facts[key]}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `${id}-error` : undefined}
                        onChange={(event) => setForm((current) => ({ ...current, facts: { ...current.facts, [key]: event.target.value } }))}
                      />
                      {error && <p id={`${id}-error`} className="text-xs text-destructive" data-testid={`error-${key}`}>{copy.invalid}</p>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </fieldset>

          <div className="flex flex-wrap gap-3 items-center">
            <Button type="submit" variant="outline" disabled={locked || busy || !dirty} className="font-bold" data-testid="save-draft">
              {update.isPending ? copy.saving : copy.save}
            </Button>
            <Button type="button" onClick={() => void onSubmit()} disabled={locked || busy} className="font-bold gap-1.5" data-testid="submit-revision">
              {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {submit.isPending ? copy.submitting : copy.submit}
            </Button>
            {latest?.status === 'draft' && !locked && (
              <Button type="button" variant="ghost" onClick={() => void onDiscard()} disabled={busy} className="gap-1.5 text-muted-foreground" data-testid="discard-draft">
                <Trash2 className="w-4 h-4" /> {copy.discard}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Notice({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-accent/20">
      <h1 className="text-xl font-bold text-foreground mb-4">{title}</h1>
      <Button asChild variant="outline"><Link href="/mijn-bedrijf">Mijn bedrijf</Link></Button>
    </div>
  );
}
