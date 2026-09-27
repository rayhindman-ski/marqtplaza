# v0.5.2 Prompt Log

## Record metadata

- Branch: `feature/v052-business-onboarding-journey`
- Session date: 2026-09-27
- Log created at: 2026-09-27T15:15:00+02:00
- Time zone: Europe/Amsterdam
- Prompt order: chronological
- Companion log (what was implemented, with evidence): [`release_v052_log.md`](./release_v052_log.md)
- Timing rule: start and end times are recorded as the assistant observes
  them (`date` at start and at each phase commit). Nothing is invented.

## Prompts

### Prompt 1

**Received:** 2026-09-27 ≈14:47 CEST

> Implement release v0.5.2 per `doc/md/v0.5/release_v052.md` and
> `doc/md/v0.5/release_v052-implementation-plan.md` on branch
> `feature/v052-business-onboarding-journey`.

Clarification answered by the user: run all phases 0–6 in sequence, stop only
for blockers; use provisional policy values (KvK optional, 7-day invitations,
no auto-approval, auto sign-in after password creation) and record them as
provisional.

**Response (summary, in progress):**

- Phase 0 (≈14:50 → 15:05): dependency findings and baselines recorded in
  `release_v052_log.md`; password-creation mechanism decided (Clerk sign-up
  with prefilled verified address; no server-side Clerk user creation).
- Phase 1 (≈15:05 → 15:20): consume handoff in the API; sign-up prefill via
  tab-scoped storage; forgot / reset / security pages as app-framed Clerk
  flows with NL/EN copy; live Clerk end-to-end evidence including reset with
  the test code and retired-password refusal; axe gate extended. Deviation
  recorded: no `account.password_changed` outbox template (Clerk sends its
  own notification; no webhook exists).
- Phases 2–6: see later entries.
