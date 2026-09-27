import { useState, type FormEvent } from 'react';
import { Link, Redirect, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Store } from 'lucide-react';

import {
  getGetAccountMeQueryKey,
  getListBusinessMembersQueryKey,
  useChangeBusinessMemberRole,
  useGetAccountMe,
  useInviteBusinessMember,
  useListBusinessMembers,
  useRemoveBusinessMember,
  useRevokeBusinessInvitation,
  useTransferBusinessOwnership,
  type ApiError,
  type BusinessMember,
  type BusinessMemberRole,
} from '@workspace/api-client-react';

import { AccountShell, AccountUnavailable } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/button';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { accountErrorMessage, accountTranslations, formatCopy, type Language } from '@/lib/i18n';
import { withReturnPath } from '@/lib/returnPath';
import { useAppLanguage } from '@/lib/useAppLanguage';

/**
 * Business team page (v0.5.2, BMEM-001…004). Owners invite, change roles,
 * transfer and remove; every member may leave. The server is the only
 * authority: buttons are hidden by role for clarity, and every refusal it
 * returns (last owner, duplicate invitation) is shown as-is.
 */

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  return data as ApiError;
}

function formatDate(value: string, language: Language): string {
  return new Date(value).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function roleLabel(role: BusinessMemberRole, language: Language): string {
  const copy = accountTranslations[language].members;
  return role === 'owner' ? copy.roleOwner : copy.roleManager;
}

export default function BusinessMembersPage() {
  const [language, setLanguage] = useAppLanguage();
  const copy = accountTranslations[language];
  const members = copy.members;
  const params = useParams<{ id: string }>();
  const businessId = Number(params.id);
  const auth = useAccountAuth();
  const queryClient = useQueryClient();
  const enabled = featureFlags.businessOnboarding && auth.isLoaded && auth.isSignedIn && Number.isInteger(businessId) && businessId > 0;

  const meQuery = useGetAccountMe({ query: { enabled, queryKey: getGetAccountMeQueryKey(), retry: false } });
  const teamQuery = useListBusinessMembers(businessId, { query: { enabled, queryKey: getListBusinessMembersQueryKey(businessId), retry: false } });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BusinessMemberRole>('manager');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [left, setLeft] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListBusinessMembersQueryKey(businessId) }),
      queryClient.invalidateQueries({ queryKey: getGetAccountMeQueryKey() }),
    ]);

  const invite = useInviteBusinessMember();
  const revoke = useRevokeBusinessInvitation();
  const changeRole = useChangeBusinessMemberRole();
  const remove = useRemoveBusinessMember();
  const transfer = useTransferBusinessOwnership();

  if (!auth.isLoaded) {
    return (
      <AccountShell language={language} onLanguageChange={setLanguage} eyebrow={members.eyebrow} title={members.eyebrow} testId="page-business-members" headingTestId="heading-business-members">
        <p role="status" className="text-sm text-muted-foreground">{members.loading}</p>
      </AccountShell>
    );
  }
  if (!auth.isSignedIn) return <Redirect to={withReturnPath('/sign-in', `/account/bedrijf/${params.id}/team`)} />;
  if (left) return <Redirect to="/account" />;

  const business = meQuery.data?.businesses.find((entry) => entry.id === businessId) ?? null;
  const team = teamQuery.data;
  const teamError = apiErrorFrom(teamQuery.error);
  const title = business ? formatCopy(members.title, { business: business.name }) : members.eyebrow;
  const isOwner = team?.viewerRole === 'owner';
  const closed = business?.status === 'closed';

  function failureText(error: unknown): string {
    const api = apiErrorFrom(error);
    const fieldCode = api?.fieldErrors?.[0]?.code;
    if (fieldCode === 'last_owner') return members.lastOwner;
    if (fieldCode === 'already_invited') return members.inviteAlready;
    if (fieldCode === 'already_member') return members.inviteMember;
    if (fieldCode === 'invalid_transition') return members.inviteClosed;
    if (api?.code === 'VALIDATION_FAILED') return members.inviteInvalid;
    return accountErrorMessage(error, language);
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setNotice({ tone: 'error', text: members.inviteInvalid });
      return;
    }
    try {
      await invite.mutateAsync({ id: businessId, data: { email: trimmed, role } });
      setEmail('');
      setNotice({ tone: 'ok', text: formatCopy(members.inviteSent, { email: trimmed }) });
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: failureText(error) });
    }
  }

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setNotice(null);
    try {
      await action();
      await refresh();
      after?.();
    } catch (error) {
      setNotice({ tone: 'error', text: failureText(error) });
    }
  }

  function memberName(member: BusinessMember): string {
    const name = member.displayName ?? members.unnamed;
    return member.isSelf ? `${name} (${members.you})` : name;
  }

  return (
    <AccountShell
      language={language}
      onLanguageChange={setLanguage}
      eyebrow={members.eyebrow}
      title={title}
      intro={members.intro}
      backHref="/account"
      testId="page-business-members"
      headingTestId="heading-business-members"
    >
      {!featureFlags.businessOnboarding || teamError?.code === 'FEATURE_DISABLED' ? (
        <AccountUnavailable language={language} />
      ) : teamQuery.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">{members.loading}</p>
      ) : teamQuery.isError ? (
        <div role="alert" data-testid="status-members-error" className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-900">
          {teamError?.code === 'NOT_FOUND' ? members.notFound : accountErrorMessage(teamQuery.error, language)}
        </div>
      ) : team ? (
        <>
          {notice ? (
            <p
              role={notice.tone === 'error' ? 'alert' : 'status'}
              data-testid={notice.tone === 'error' ? 'status-members-action-error' : 'status-members-action-ok'}
              className={`mb-6 rounded-2xl border p-4 text-sm font-bold ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
            >
              {notice.text}
            </p>
          ) : null}
          {closed ? (
            <p role="status" data-testid="status-business-closed" className="mb-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm font-bold text-foreground">
              {members.closedBadge}
            </p>
          ) : null}

          <section data-testid="members-list" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
            <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
              {members.membersTitle}
            </h2>
            <ul className="mt-4 divide-y divide-border/70">
              {team.members.map((member) => (
                <li key={member.id} data-testid={`member-row-${member.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{memberName(member)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span data-testid={`member-role-${member.id}`} className="font-bold text-foreground">{roleLabel(member.role, language)}</span>
                      {' · '}
                      {formatCopy(members.joined, { date: formatDate(member.joinedAt, language) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isOwner && !member.isSelf && !closed ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`button-member-role-${member.id}`}
                          disabled={changeRole.isPending}
                          onClick={() => void run(() => changeRole.mutateAsync({ id: businessId, memberId: member.id, data: { role: member.role === 'owner' ? 'manager' : 'owner' } }))}
                        >
                          {member.role === 'owner' ? members.makeManager : members.makeOwner}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`button-member-transfer-${member.id}`}
                          disabled={transfer.isPending}
                          onClick={() => {
                            if (window.confirm(formatCopy(members.transferConfirm, { name: member.displayName ?? members.unnamed }))) {
                              void run(() => transfer.mutateAsync({ id: businessId, data: { memberId: member.id } }));
                            }
                          }}
                        >
                          {members.transfer}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-800 hover:bg-red-50"
                          data-testid={`button-member-remove-${member.id}`}
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(formatCopy(members.removeConfirm, { name: member.displayName ?? members.unnamed }))) {
                              void run(() => remove.mutateAsync({ id: businessId, memberId: member.id }));
                            }
                          }}
                        >
                          {members.remove}
                        </Button>
                      </>
                    ) : null}
                    {member.isSelf ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="button-member-leave"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(members.leaveConfirm)) {
                            void run(() => remove.mutateAsync({ id: businessId, memberId: member.id }), () => setLeft(true));
                          }
                        }}
                      >
                        {members.leave}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {!isOwner ? <p className="mt-2 text-xs text-muted-foreground">{members.managerNote}</p> : null}
          </section>

          {isOwner ? (
            <>
              <section data-testid="invitations-panel" className="mb-6 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
                <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {members.inviteTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{members.inviteBody}</p>
                {!closed ? (
                  <form onSubmit={(event) => void onInvite(event)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
                    <label className="flex flex-1 flex-col gap-1 text-sm font-bold text-foreground">
                      {members.inviteEmail}
                      <input
                        type="email"
                        name="email"
                        autoComplete="off"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        data-testid="input-invite-email"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-bold text-foreground">
                      {members.inviteRole}
                      <select
                        name="role"
                        value={role}
                        onChange={(event) => setRole(event.target.value as BusinessMemberRole)}
                        data-testid="select-invite-role"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"
                      >
                        <option value="manager">{members.roleManager}</option>
                        <option value="owner">{members.roleOwner}</option>
                      </select>
                    </label>
                    <Button type="submit" data-testid="button-invite-send" disabled={invite.isPending}>
                      {invite.isPending ? members.inviteSending : members.inviteAction}
                    </Button>
                  </form>
                ) : null}
                <h3 className="mt-6 text-sm font-bold text-foreground">{members.invitationsTitle}</h3>
                {team.invitations.length === 0 ? (
                  <p data-testid="status-no-invitations" className="mt-2 text-sm text-muted-foreground">{members.noInvitations}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border/70">
                    {team.invitations.map((invitation) => (
                      <li key={invitation.id} data-testid={`invitation-row-${invitation.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-foreground">{invitation.email}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {roleLabel(invitation.role, language)}
                            {' · '}
                            <span data-testid={`invitation-status-${invitation.id}`}>
                              {invitation.status === 'open'
                                ? formatCopy(members.statusOpen, { date: formatDate(invitation.expiresAt, language) })
                                : invitation.status === 'accepted'
                                  ? members.statusAccepted
                                  : invitation.status === 'revoked'
                                    ? members.statusRevoked
                                    : members.statusExpired}
                            </span>
                          </p>
                        </div>
                        {invitation.status === 'open' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-testid={`button-invitation-revoke-${invitation.id}`}
                            disabled={revoke.isPending}
                            onClick={() => void run(() => revoke.mutateAsync({ id: businessId, invitationId: invitation.id }))}
                          >
                            {members.revoke}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {!closed ? (
                <section data-testid="close-link-panel" className="mb-6 flex flex-col gap-4 rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
                      <Store className="h-4 w-4" aria-hidden="true" />
                      {members.closeLink}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{members.closeLinkBody}</p>
                  </div>
                  <Link
                    href={`/account/bedrijf/${businessId}/sluiten`}
                    data-testid="link-business-close"
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-50"
                  >
                    {members.closeLink}
                  </Link>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </AccountShell>
  );
}
