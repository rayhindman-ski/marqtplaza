# Processing inventory — v0.5.3 draft (2026-09-29)

**Status:** provisional; product owner approval pending. Owner for every row:
**product owner — approval pending**. Location: application database at the
hosting provider; identity-provider records at Clerk; outbound mail at the
configured mail provider. Confirm regions, subprocessors, legal bases and
retention with the owner before production enablement. “Account rights” means
`/account/privacy/rechten`; export is scheduled for Phase 4 and deletion for
Phase 5. A request-event audit is retained in minimal/anonymised form after
deletion; no retention period has been approved for the other rows marked
“policy pending”. This document does not imply that current deletion routes
already erase every downstream copy.

| Table | Purpose; data categories | Lawful basis (provisional) | Source | Recipients/processors; location | Retention | Deletion route; rights route |
|---|---|---|---|---|---|---|
| `app_users` | Account access; subject id, email, locale, status | Contract | Clerk identity provider | Clerk, hosting; provider region pending | Account lifetime; audit minimum after deletion | `/account/verwijderen`; account rights |
| `consumer_preferences` | Personalisation; interests, area, scope | Contract | Account user | Hosting; region pending | Account lifetime or until changed | `/account/voorkeuren`, `/account/verwijderen`; account rights |
| `account_last_search` | Resume search; criteria, coarse location | Consent/optional account setting (basis review pending) | Account user | Hosting; region pending | 90 days or opt-out/clear | `DELETE /account/last-search`; account rights |
| `account_consent_events` | Evidence of optional choices; purpose, version, locale, decision | Legal obligation / consent evidence (review pending) | Account user | Hosting; region pending | Audit minimum after deletion; period pending | `/account/verwijderen` anonymisation planned; account rights |
| `account_requests` | Process rights requests; status, scope, blocker | Legal obligation | Account user/support | Hosting; region pending | Audit minimum after deletion; period pending | `/account/verwijderen`; account rights |
| `account_request_events` | Immutable rights-request audit; actor, note, status | Legal obligation | Account user/support/system | Hosting; region pending | Audit events retained, anonymised after deletion | `/account/verwijderen` anonymisation planned; account rights |
| `account_exports` | Export lifecycle, private storage keys, size and expiry | Legal obligation / contract (review pending) | Account user | Private App Storage and hosting; regions pending | Files 72 hours after availability; status metadata audit period pending | `/account/gegevens-export`; account rights |
| `lifecycle_outbox` | Transactional delivery; recipient, template, rendered variables | Contract / legitimate interests (security) | Account and business actions | Mail provider, hosting; regions pending | Final outbox body/recipient scrubbed after 30 days; metadata pending | `/account/verwijderen` planned; account rights |
| `lifecycle_delivery_attempts` | Delivery trace; attempt and provider reference | Legitimate interests / legal obligation | Mail provider | Mail provider, hosting; regions pending | Audit metadata, period pending | `/account/verwijderen` planned; account rights |
| `user_registrations` | Research enrolment; identity and contact | Consent | Registrant | Hosting, mail provider; regions pending | Until withdrawal; audit minimum pending | Registration unsubscribe/support; account rights |
| `consumer_registrations` | Pending consumer signup; contact and preferences | Contract (steps at user request) | Registrant | Clerk, mail provider, hosting; regions pending | Pending verification expiry policy pending | Registration support; account rights |
| `consumer_registration_tokens` | Verify pending registration; token digest | Contract | System | Hosting; region pending | Token expiry; purge policy pending | Registration support; account rights |
| `business_profiles` | Directory and owner profile; contact, business data | Legitimate interests / contract | Business representative/public sources | Hosting; region pending; published fields to visitors | Publication lifetime; policy pending | Business closure/review; account rights |
| `business_claims` | Ownership verification; claimant, evidence | Legitimate interests / contract | Representative | Hosting, reviewers; region pending | Review audit, period pending | Support review; account rights |
| `business_members` | Business authority; identity and role | Contract | Representative/inviter | Hosting; region pending | Membership lifetime, audit minimum pending | Membership removal; account rights |
| `business_deals` | Public promotions and author | Contract | Representative | Hosting, site visitors; region pending | Publication lifetime; policy pending | Business workspace; account rights |
| `business_messages` | Community/business messages, authorship | Legitimate interests | Representative | Hosting, site visitors; region pending | Publication lifetime; policy pending | Business workspace; account rights |
| `business_invitations` | Pending invite; contact and inviter | Contract | Business representative | Mail provider, hosting; regions pending | Expiry/revocation; policy pending | Invitation revoke; account rights |
| `business_invitation_tokens` | Invite token digest | Contract | System | Hosting; region pending | Token expiry; purge policy pending | Invitation revoke; account rights |
| `business_member_events` | Membership audit; actor and change | Legitimate interests | System/representative | Hosting; region pending | Audit minimum, period pending | Support; account rights |
| `business_profile_revisions` | Proposed edits; author, contact | Legitimate interests / contract | Representative | Hosting, reviewers; region pending | Review audit, period pending | Review/support; account rights |
| `business_reviews` | Editorial decision; reviewer and note | Legitimate interests | Reviewer | Hosting; region pending | Review audit, period pending | Support; account rights |
| `business_fact_checks` | Fact-check and reviewer identity | Legitimate interests | Reviewer | Hosting; region pending | Review audit, period pending | Support; account rights |
| `listing_corrections` | Submitted correction and contact | Legitimate interests | Visitor | Hosting, reviewers; region pending | Review audit, period pending | Correction/support; account rights |
| `listing_correction_reviews` | Correction decision and reviewer | Legitimate interests | Reviewer | Hosting; region pending | Review audit, period pending | Support; account rights |
| `community_posts` | Community contributions and author | Legitimate interests | Contributor | Hosting, site visitors; region pending | Publication lifetime; policy pending | Support; account rights |
| `community_post_participation` | Participation and user reference | Legitimate interests | Contributor | Hosting; region pending | Until withdrawal; policy pending | Support; account rights |
| `saved_event_snapshots` | Saved event and account reference | Contract | Account user | Hosting; region pending | Until unsaved/account deletion | Account saved events; account rights |
| `saved_event_alerts` | Alert preferences and account reference | Consent (review pending) | Account user | Hosting, mail provider; regions pending | Until revoked/account deletion | Account saved events; account rights |
| `saved_event_tombstones` | Removed save identifiers | Legitimate interests | System | Hosting; region pending | Policy pending | Support; account rights |
| `user_queries` | Search job and pseudonymous visitor reference | Legitimate interests (review pending) | Visitor | Hosting, external search processor; regions pending | Policy pending | Support; account rights |
| `external_queries` | External search criteria and request reference | Legitimate interests (review pending) | Visitor | External search processor, hosting; regions pending | Policy pending | Support; account rights |
| `external_results` | Search results possibly containing personal contact | Legitimate interests (review pending) | External providers | Hosting; region pending | Cache expiry policy pending | Support; account rights |
| `external_result_listings` | Public listing contact/person names | Legitimate interests | External providers | Hosting, site visitors; regions pending | Cache expiry policy pending | Correction route; account rights |
| `capture_results` | Captured business contact and location | Legitimate interests | Public business sources | Hosting, reviewers; region pending | Review/cache policy pending | Correction route; account rights |
| `discovered_events` | Public event contact/organiser details | Legitimate interests | Public event sources | Hosting, site visitors; region pending | Source refresh policy pending | Correction/support; account rights |
| `news_articles` | Public author/source names | Legitimate interests | Public news sources | Hosting, site visitors; region pending | Source refresh policy pending | Support; account rights |
| `social_map_review_reports` | Source-review report possibly containing contact | Legitimate interests | Source scans | Hosting, reviewers; region pending | Review audit, period pending | Support; account rights |

`event_source_statuses`, `news_source_statuses` and `provider_usage` contain
source/provider operational metadata rather than account personal data; if
free-form error text is later stored there, reclassify and redact it.
`posts` in `schema/index.ts` is a commented example, not a deployed table.

Phase 5 implementation note (2026-09-29): A closed account keeps its numeric
`app_users.id` and original unique Clerk subject as an internal tombstone,
but clears the stored e-mail and locale (locale becomes `nl`). A *different*
Clerk subject signing up with the same e-mail creates a new `app_users` row,
never attaching to that tombstone. The 14-day scheduler removes preferences,
last search, saved-event account rows, memberships and export objects; it
anonymises account/request history and research registration contact columns.
Consent decisions retain only purpose/version/locale/time and internal ids.
The completion notice holds the pre-deletion address only in its one-time
delivery outbox row, subject to the existing 30-day final-message purge;
this is a temporary delivery exception, not retained audit contact data.
Additional public contributions and third-party/legal-obligation records
remain subject to owner-approved case-by-case retention decisions. The
processing inventory remains provisional until owner approval.