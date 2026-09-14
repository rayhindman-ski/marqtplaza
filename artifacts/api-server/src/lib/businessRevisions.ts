import { and, desc, eq, inArray, or } from "drizzle-orm";

import {
  businessProfileRevisionsTable,
  businessReviewsTable,
  db,
  factChecksTable,
  type BusinessProfile,
  type BusinessProfileRevision,
  type BusinessReview,
  type FactCheck,
} from "@workspace/db";
import type { ApiFieldError } from "@workspace/api-zod";

/**
 * Immutable profile revisions: what an owner may edit, what a reviewer
 * approves, and how the approved snapshot is projected publicly.
 *
 * The approved revision is the only source for public editorial fields once
 * it exists. Nothing here reads `business_profiles` text columns for a
 * business that has an approved revision, so owner edits can never leak to
 * the public page before review.
 */

export const TEXT_FIELDS = ["tagline", "description", "openingHours"] as const;
export const FACT_FIELDS = ["websiteUrl", "phone", "email", "address", "logoUrl", "coverUrl"] as const;
export const LANGUAGES = ["nl", "en"] as const;
export const CHECKABLE_FIELDS: ReadonlySet<string> = new Set([...TEXT_FIELDS, ...FACT_FIELDS]);

export type TextField = (typeof TEXT_FIELDS)[number];
export type FactField = (typeof FACT_FIELDS)[number];
export type Language = (typeof LANGUAGES)[number];

export type RevisionText = Record<TextField, string | null>;
export type RevisionFacts = Record<FactField, string | null>;
export type RevisionContent = { nl: RevisionText; en: RevisionText; facts: RevisionFacts };

/** Newest confirmation older than this is reported as `stale`; nothing is hidden by it. */
export const FRESHNESS_STALE_AFTER_DAYS = 180;
/** A fresh confirmation that will turn stale within this many days is flagged so a re-check can be scheduled. */
export const FRESHNESS_RECHECK_WINDOW_DAYS = 30;

export const EDITABLE_REVISION_STATUSES: ReadonlySet<string> = new Set(["draft"]);
export const OPEN_REVISION_STATUSES: ReadonlySet<string> = new Set(["draft", "submitted", "changes_requested"]);

const TEXT_LIMITS: Record<TextField, number> = { tagline: 160, description: 2000, openingHours: 500 };
const FACT_LIMITS: Record<FactField, number> = {
  websiteUrl: 500,
  phone: 40,
  email: 160,
  address: 240,
  logoUrl: 500,
  coverUrl: 500,
};
const URL_FIELDS: ReadonlySet<string> = new Set<FactField>(["websiteUrl", "logoUrl", "coverUrl"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Control characters other than tab/newline are never stored. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function emptyText(): RevisionText {
  return { tagline: null, description: null, openingHours: null };
}

function emptyFacts(): RevisionFacts {
  return { websiteUrl: null, phone: null, email: null, address: null, logoUrl: null, coverUrl: null };
}

export function emptyContent(): RevisionContent {
  return { nl: emptyText(), en: emptyText(), facts: emptyFacts() };
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(CONTROL_CHARACTERS, "").trim();
  return trimmed ? trimmed : null;
}

/** Reads stored jsonb content defensively; unknown keys are dropped. */
export function normaliseContent(raw: unknown): RevisionContent {
  const content = emptyContent();
  if (!raw || typeof raw !== "object") return content;
  const source = raw as Record<string, unknown>;
  for (const language of LANGUAGES) {
    const block = source[language];
    if (!block || typeof block !== "object") continue;
    for (const field of TEXT_FIELDS) {
      content[language][field] = cleanString((block as Record<string, unknown>)[field]);
    }
  }
  const facts = source.facts;
  if (facts && typeof facts === "object") {
    for (const field of FACT_FIELDS) {
      content.facts[field] = cleanString((facts as Record<string, unknown>)[field]);
    }
  }
  return content;
}

export function validPublicUrl(value: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type ContentPatch = {
  nl?: Partial<Record<TextField, string | null | undefined>>;
  en?: Partial<Record<TextField, string | null | undefined>>;
  facts?: Partial<Record<FactField, string | null | undefined>>;
};

/**
 * Merge an owner patch into existing content. `undefined` leaves a field
 * untouched; `null` or an empty string clears it. Returns field errors for
 * anything that cannot be stored (bad URL/e-mail, over limit).
 */
export function mergeContent(
  base: RevisionContent,
  patch: ContentPatch,
): { content: RevisionContent; fieldErrors: ApiFieldError[] } {
  const content: RevisionContent = {
    nl: { ...base.nl },
    en: { ...base.en },
    facts: { ...base.facts },
  };
  const fieldErrors: ApiFieldError[] = [];
  for (const language of LANGUAGES) {
    const block = patch[language];
    if (!block) continue;
    for (const field of TEXT_FIELDS) {
      if (block[field] === undefined) continue;
      const value = cleanString(block[field]);
      if (value && value.length > TEXT_LIMITS[field]) {
        fieldErrors.push({ field: `${language}.${field}`, code: "too_long" });
        continue;
      }
      content[language][field] = value;
    }
  }
  if (patch.facts) {
    for (const field of FACT_FIELDS) {
      if (patch.facts[field] === undefined) continue;
      const value = cleanString(patch.facts[field]);
      if (value && value.length > FACT_LIMITS[field]) {
        fieldErrors.push({ field: `facts.${field}`, code: "too_long" });
        continue;
      }
      if (URL_FIELDS.has(field) && !validPublicUrl(value)) {
        fieldErrors.push({ field: `facts.${field}`, code: "invalid_url" });
        continue;
      }
      if (field === "email" && value && !EMAIL_PATTERN.test(value)) {
        fieldErrors.push({ field: `facts.${field}`, code: "invalid_email" });
        continue;
      }
      content.facts[field] = value;
    }
  }
  return { content, fieldErrors };
}

/** A submission needs at least one stated text in either language. */
export function hasSubmittableContent(content: RevisionContent): boolean {
  return LANGUAGES.some((language) => TEXT_FIELDS.some((field) => content[language][field] !== null));
}

/** Seed the first revision from the legacy public columns so nothing is lost. */
export function contentFromProfileColumns(profile: BusinessProfile): RevisionContent {
  const content = emptyContent();
  content.nl.tagline = cleanString(profile.tagline);
  content.nl.description = cleanString(profile.description);
  content.nl.openingHours = cleanString(profile.openingHours);
  content.facts.websiteUrl = cleanString(profile.websiteUrl);
  content.facts.phone = cleanString(profile.phone);
  content.facts.email = cleanString(profile.email);
  content.facts.address = cleanString(profile.address);
  content.facts.logoUrl = cleanString(profile.logoUrl);
  content.facts.coverUrl = cleanString(profile.coverUrl);
  return content;
}

export function serialiseRevision(revision: BusinessProfileRevision) {
  return {
    id: revision.id,
    businessProfileId: revision.businessProfileId,
    version: revision.version,
    status: revision.status,
    submittedAt: revision.submittedAt?.toISOString() ?? null,
    decidedAt: revision.decidedAt?.toISOString() ?? null,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
    content: normaliseContent(revision.content),
  };
}

export function serialiseReview(review: BusinessReview) {
  return {
    id: review.id,
    targetType: review.targetType,
    targetId: review.targetId,
    targetVersion: review.targetVersion,
    decision: review.decision,
    reasonCode: review.reasonCode,
    reason: review.reason,
    createdAt: review.createdAt.toISOString(),
  };
}

/** Owner/reviewer view of a fact check, including the reviewer note. */
export function serialiseFactCheck(check: FactCheck) {
  return {
    field: check.field,
    status: check.status,
    sourceUrl: check.sourceUrl,
    checkedOn: check.checkedOn?.toISOString() ?? null,
    note: check.note,
  };
}

/** Public view: never the reviewer or their note. */
export function serialisePublicCheck(check: FactCheck) {
  return {
    field: check.field,
    status: check.status,
    sourceUrl: check.sourceUrl,
    checkedOn: check.checkedOn?.toISOString() ?? null,
  };
}

export type Freshness = {
  status: "unverified" | "fresh" | "stale";
  checkedOn: string | null;
  staleAfterDays: number;
  /** Derived from `checkedOn` + `staleAfterDays`; never stored, never guessed. */
  staleOn: string | null;
  /** Whole days until `staleOn` (negative once stale); null when unverified. */
  daysUntilStale: number | null;
  recheckWindowDays: number;
  /** True only while `fresh` and within `recheckWindowDays` of turning stale. */
  recheckDue: boolean;
};

export function freshnessFor(checks: FactCheck[], now: Date = new Date()): Freshness {
  let newest: Date | null = null;
  for (const check of checks) {
    if (check.status !== "confirmed" || !check.checkedOn) continue;
    if (!newest || check.checkedOn > newest) newest = check.checkedOn;
  }
  if (!newest) {
    return {
      status: "unverified",
      checkedOn: null,
      staleAfterDays: FRESHNESS_STALE_AFTER_DAYS,
      staleOn: null,
      daysUntilStale: null,
      recheckWindowDays: FRESHNESS_RECHECK_WINDOW_DAYS,
      recheckDue: false,
    };
  }
  const staleOn = new Date(newest.getTime() + FRESHNESS_STALE_AFTER_DAYS * 86_400_000);
  const ageDays = (now.getTime() - newest.getTime()) / 86_400_000;
  const status = ageDays > FRESHNESS_STALE_AFTER_DAYS ? "stale" : "fresh";
  const daysUntilStale = Math.floor((staleOn.getTime() - now.getTime()) / 86_400_000);
  return {
    status,
    checkedOn: newest.toISOString(),
    staleAfterDays: FRESHNESS_STALE_AFTER_DAYS,
    staleOn: staleOn.toISOString(),
    daysUntilStale,
    recheckWindowDays: FRESHNESS_RECHECK_WINDOW_DAYS,
    recheckDue: status === "fresh" && daysUntilStale <= FRESHNESS_RECHECK_WINDOW_DAYS,
  };
}

/**
 * The public projection of an approved snapshot: every field the reviewer
 * marked `contradicted` is withheld (null) in both languages.
 */
export function projectApprovedContent(content: RevisionContent, checks: FactCheck[]): RevisionContent {
  const withheld = new Set(checks.filter((check) => check.status === "contradicted").map((check) => check.field));
  const projected: RevisionContent = { nl: { ...content.nl }, en: { ...content.en }, facts: { ...content.facts } };
  for (const field of TEXT_FIELDS) {
    if (!withheld.has(field)) continue;
    projected.nl[field] = null;
    projected.en[field] = null;
  }
  for (const field of FACT_FIELDS) {
    if (withheld.has(field)) projected.facts[field] = null;
  }
  return projected;
}

export type OwnerState =
  | "unknown"
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "published"
  | "stale"
  | "suspended"
  | "unpublished";

/**
 * Owner-facing summary. Publication and revision states remain independent
 * underneath; this only picks the single most relevant thing to say.
 */
export function deriveOwnerState(input: {
  publicationStatus: string;
  latest: BusinessProfileRevision | null;
  approved: BusinessProfileRevision | null;
  freshness: Freshness;
}): OwnerState {
  if (input.publicationStatus === "suspended") return "suspended";
  const latestStatus = input.latest?.status;
  if (latestStatus === "draft") return "draft";
  if (latestStatus === "submitted") return "submitted";
  if (latestStatus === "changes_requested") return "changes_requested";
  if (!input.approved) return "unknown";
  if (input.publicationStatus === "published") return input.freshness.status === "stale" ? "stale" : "published";
  if (input.publicationStatus === "unpublished") return "unpublished";
  return "approved";
}

export async function latestRevisionFor(profileId: number): Promise<BusinessProfileRevision | null> {
  const [row] = await db
    .select()
    .from(businessProfileRevisionsTable)
    .where(
      and(
        eq(businessProfileRevisionsTable.businessProfileId, profileId),
        inArray(businessProfileRevisionsTable.status, ["draft", "submitted", "changes_requested", "approved", "rejected"]),
      ),
    )
    .orderBy(desc(businessProfileRevisionsTable.version))
    .limit(1);
  return row ?? null;
}

export async function approvedRevisionFor(profile: BusinessProfile): Promise<BusinessProfileRevision | null> {
  if (profile.approvedRevisionId === null) return null;
  const [row] = await db
    .select()
    .from(businessProfileRevisionsTable)
    .where(
      and(
        eq(businessProfileRevisionsTable.id, profile.approvedRevisionId),
        eq(businessProfileRevisionsTable.status, "approved"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function factChecksFor(revisionId: number | null): Promise<FactCheck[]> {
  if (revisionId === null) return [];
  return db.select().from(factChecksTable).where(eq(factChecksTable.revisionId, revisionId));
}

/** Latest decision on a revision or the business's publication; owner-safe (reason only). */
export async function latestDecisionFor(profileId: number, revisionIds: number[]): Promise<BusinessReview | null> {
  const publication = and(eq(businessReviewsTable.targetType, "publication"), eq(businessReviewsTable.targetId, profileId));
  const revision = revisionIds.length
    ? and(eq(businessReviewsTable.targetType, "revision"), inArray(businessReviewsTable.targetId, revisionIds))
    : undefined;
  const [row] = await db
    .select()
    .from(businessReviewsTable)
    .where(revision ? or(publication, revision) : publication)
    .orderBy(desc(businessReviewsTable.createdAt), desc(businessReviewsTable.id))
    .limit(1);
  return row ?? null;
}
