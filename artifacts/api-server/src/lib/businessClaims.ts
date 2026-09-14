import type { BusinessClaim, BusinessProfile } from "@workspace/db";
import { SELF_REPORTED_LISTING_SOURCE } from "@workspace/db";
import type { BusinessIntakeKind, ClaimNextAction, ClaimStatus } from "@workspace/api-zod";

/** Statuses a claimant may still withdraw from. */
export const WITHDRAWABLE_CLAIM_STATUSES: ReadonlySet<string> = new Set<ClaimStatus>([
  "draft",
  "pending",
  "submitted",
  "changes_requested",
  "disputed",
]);

/** Statuses in which the claimant may still edit and (re)submit the claim. */
export const EDITABLE_CLAIM_STATUSES: ReadonlySet<string> = new Set<ClaimStatus>([
  "draft",
  "changes_requested",
]);

/** Statuses a reviewer can decide on. `changes_requested` waits for the claimant. */
export const REVIEWABLE_CLAIM_STATUSES: ReadonlySet<string> = new Set<ClaimStatus>([
  "pending",
  "submitted",
  "disputed",
]);

export class ClaimConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimConflictError";
  }
}

/** True for a Postgres unique violation, also when drizzle wraps it as `error.cause`. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function claimNextAction(status: string): ClaimNextAction {
  switch (status) {
    case "draft":
      return "submit";
    case "pending":
    case "submitted":
    case "disputed":
      return "wait_for_review";
    case "changes_requested":
      return "provide_changes";
    default:
      return "none";
  }
}

export function claimKind(profile: Pick<BusinessProfile, "listingSource">): BusinessIntakeKind {
  return profile.listingSource === SELF_REPORTED_LISTING_SOURCE ? "new_business" : "existing_listing";
}

export function listingSlug(name: string, listingId: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 54) || "local-business";
  let hash = 0;
  for (const character of listingId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `${base}-${Math.abs(hash).toString(36)}`;
}

export function serialiseProfile(profile: BusinessProfile) {
  return {
    id: profile.id,
    slug: profile.slug,
    cityId: profile.cityId,
    name: profile.name,
    address: profile.address,
    neighborhood: profile.neighborhood,
    latitude: profile.latitude,
    longitude: profile.longitude,
    sourceUrl: profile.sourceUrl,
    tagline: profile.tagline,
    description: profile.description,
    websiteUrl: profile.websiteUrl,
    phone: profile.phone,
    email: profile.email,
    openingHours: profile.openingHours,
    logoUrl: profile.logoUrl,
    coverUrl: profile.coverUrl,
    isClaimed: profile.isClaimed,
    claimedAt: profile.claimedAt?.toISOString() ?? null,
    publicationStatus: profile.publicationStatus,
    category: profile.category,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/**
 * Claim representation for its creator or a reviewer. Authority evidence is
 * private to those two parties; callers must never serialise one claimant's
 * claim for another claimant.
 */
export function serialiseClaim(claim: BusinessClaim, profile: BusinessProfile) {
  return {
    id: claim.id,
    businessProfileId: claim.businessProfileId,
    claimantId: claim.claimantId,
    contactName: claim.contactName,
    contactEmail: claim.contactEmail,
    relationship: claim.relationship,
    evidenceUrl: claim.evidenceUrl,
    message: claim.message,
    status: claim.status,
    reviewNote: claim.reviewNote,
    reviewedAt: claim.reviewedAt?.toISOString() ?? null,
    version: claim.version,
    nextAction: claimNextAction(claim.status),
    kind: claimKind(profile),
    authorityDeclaration: claim.authorityDeclaration,
    evidenceReference: claim.evidenceReference,
    withdrawnAt: claim.withdrawnAt?.toISOString() ?? null,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
    profile: serialiseProfile(profile),
  };
}
