import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type RequestHandler, type Response } from "express";

import {
  OPEN_CLAIM_STATUSES,
  SELF_REPORTED_LISTING_SOURCE,
  businessClaimsTable,
  businessMembersTable,
  businessProfilesTable,
  db,
  externalResultsTable,
  type BusinessClaim,
  type BusinessProfile,
} from "@workspace/db";
import {
  CreateBusinessIntakeDraftBody,
  CreateBusinessIntakeDraftResponse,
  GetBusinessClaimParams,
  GetBusinessClaimResponse,
  LookupBusinessesQueryParams,
  LookupBusinessesResponse,
  SubmitBusinessClaimBody,
  SubmitBusinessClaimParams,
  SubmitBusinessClaimResponse,
  UpdateBusinessClaimBody,
  UpdateBusinessClaimParams,
  UpdateBusinessClaimResponse,
  WithdrawBusinessClaimBody,
  WithdrawBusinessClaimParams,
  WithdrawBusinessClaimResponse,
  type ApiFieldError,
} from "@workspace/api-zod";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import {
  ClaimConflictError,
  EDITABLE_CLAIM_STATUSES,
  WITHDRAWABLE_CLAIM_STATUSES,
  isUniqueViolation,
  listingSlug,
  serialiseClaim,
} from "../lib/businessClaims";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import type { IdentityResolver } from "../lib/permissions";
import { requireAppUser } from "../middlewares/requireAppUser";
import { requireFlag } from "../middlewares/requireFlag";
import { resolveClaimableBusinessListing, type ClaimableBusinessListing } from "./listings";

/**
 * Business intake: bounded public lookup, private claim drafts for existing
 * listings or new businesses, submit / withdraw with optimistic versions.
 *
 * Every route is gated behind the `businessIntake` flag and answers with the
 * standard ApiError envelope. Nothing here ever grants ownership; approval is
 * a separate reviewer decision on the moderation route.
 */

export type BusinessLookupMatch = {
  kind: "listing" | "profile";
  cityId: string;
  listingSource: string;
  listingId: string;
  name: string;
  neighborhood: string | null;
  category: string | null;
  sourceUrl: string | null;
  isClaimed: boolean;
};

export type LookupListing = ClaimableBusinessListing & { businessCategory?: string };
export type LookupListingsLoader = (query: string, limit: number) => Promise<LookupListing[]>;
export type ResolveListing = typeof resolveClaimableBusinessListing;

export type BusinessIntakeRouterOptions = {
  resolveIdentity?: IdentityResolver;
  flags?: FeatureFlagSource;
  /** Public listing search used by lookup; defaults to the stored provider results. */
  lookupListings?: LookupListingsLoader;
  /** Re-resolves an existing listing from the approved provider by identity. */
  resolveListing?: ResolveListing;
  /** Per-account lookup budget per window. */
  lookupRateLimit?: { limit: number; windowMs: number };
  now?: () => number;
};

const LOOKUP_CITY = "dhg";
const LOOKUP_RESULT_LIMIT = 8;
const LOOKUP_SCAN_LIMIT = 40;
const DEFAULT_LOOKUP_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

const NO_FIELDS: ReadonlySet<string> = new Set();
const LOOKUP_QUERY_FIELDS: ReadonlySet<string> = new Set(["q"]);
const DRAFT_FIELDS: ReadonlySet<string> = new Set([
  "kind",
  "listing",
  "business",
  "contactName",
  "contactEmail",
  "relationship",
  "authorityDeclaration",
  "evidenceReference",
  "message",
]);
const UPDATE_FIELDS: ReadonlySet<string> = new Set([
  "expectedVersion",
  "contactName",
  "contactEmail",
  "relationship",
  "authorityDeclaration",
  "evidenceReference",
  "message",
  "business",
]);
const TRANSITION_FIELDS: ReadonlySet<string> = new Set(["expectedVersion"]);
const SUBMIT_FIELDS: ReadonlySet<string> = new Set(["expectedVersion", "confirmNoDuplicate"]);
const BUSINESS_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "category",
  "neighborhood",
  "address",
  "websiteUrl",
]);
const LISTING_FIELDS: ReadonlySet<string> = new Set(["cityId", "listingSource", "listingId"]);

function normaliseLookupQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
}

/**
 * Default lookup source: the most recent stored provider results for the
 * city's business sections. Reading stored results keeps lookup cheap and
 * independent from live provider quotas; it fails loudly (503) when the store
 * itself cannot be read.
 */
export async function lookupStoredListings(query: string, limit: number): Promise<LookupListing[]> {
  const needle = `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  const rows = await db.execute<{
    id: string;
    location_id: string;
    name: string;
    address: string | null;
    neighborhood: string | null;
    lat: number | null;
    lng: number | null;
    source_url: string | null;
    source: string | null;
    business_category: string | null;
  }>(sql`
    with recent as (
      select ${externalResultsTable.payload} as payload
      from ${externalResultsTable}
      where ${externalResultsTable.normalizedKey} like ${`{"cityId":"${LOOKUP_CITY}","section":"businesses"%`}
         or ${externalResultsTable.normalizedKey} like ${`{"cityId":"${LOOKUP_CITY}","section":"food-drink"%`}
      order by ${externalResultsTable.fetchedAt} desc, ${externalResultsTable.id} desc
      limit ${LOOKUP_SCAN_LIMIT}
    ),
    listings as (
      select elem
      from recent, jsonb_array_elements(recent.payload) as elem
      where lower(elem->>'name') like ${needle}
    )
    select distinct on (elem->>'id')
      elem->>'id' as id,
      elem->>'locationId' as location_id,
      elem->>'name' as name,
      elem->>'address' as address,
      elem->>'neighborhood' as neighborhood,
      (elem->>'lat')::double precision as lat,
      (elem->>'lng')::double precision as lng,
      elem->>'sourceUrl' as source_url,
      elem->>'source' as source,
      elem->>'businessCategory' as business_category
    from listings
    where elem->>'id' is not null and elem->>'name' is not null
    order by elem->>'id'
    limit ${limit}
  `);
  return rows.rows.map((row) => ({
    id: row.id,
    locationId: row.location_id || LOOKUP_CITY,
    name: row.name,
    address: row.address ?? undefined,
    neighborhood: row.neighborhood ?? undefined,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    sourceUrl: row.source_url ?? undefined,
    source: (row.source ?? undefined) as ClaimableBusinessListing["source"],
    businessCategory: row.business_category ?? undefined,
  }));
}

/** Public-only projection; add nothing here without a privacy review. */
/**
 * Resolves one listing from the stored provider results by identity. Every
 * listing that lookup (or the map) can offer comes from this store, so a
 * claim never depends on a live provider round-trip or on a provider that is
 * currently disabled.
 */
export async function resolveStoredListing(
  cityId: string,
  listingSource: string,
  listingId: string,
): Promise<ClaimableBusinessListing | null> {
  if (cityId !== LOOKUP_CITY) return null;
  const rows = await db.execute<{
    id: string;
    location_id: string;
    name: string;
    address: string | null;
    neighborhood: string | null;
    lat: number | null;
    lng: number | null;
    source_url: string | null;
    source: string | null;
    business_category: string | null;
  }>(sql`
    with recent as (
      select ${externalResultsTable.payload} as payload
      from ${externalResultsTable}
      where ${externalResultsTable.normalizedKey} like ${`{"cityId":"${LOOKUP_CITY}","section":"businesses"%`}
         or ${externalResultsTable.normalizedKey} like ${`{"cityId":"${LOOKUP_CITY}","section":"food-drink"%`}
      order by ${externalResultsTable.fetchedAt} desc, ${externalResultsTable.id} desc
      limit ${LOOKUP_SCAN_LIMIT}
    )
    select
      elem->>'id' as id,
      elem->>'locationId' as location_id,
      elem->>'name' as name,
      elem->>'address' as address,
      elem->>'neighborhood' as neighborhood,
      (elem->>'lat')::double precision as lat,
      (elem->>'lng')::double precision as lng,
      elem->>'sourceUrl' as source_url,
      elem->>'source' as source,
      elem->>'businessCategory' as business_category
    from recent, jsonb_array_elements(recent.payload) as elem
    where elem->>'id' = ${listingId}
      and coalesce(elem->>'source', 'openstreetmap') = ${listingSource}
      and elem->>'name' is not null
    limit 1
  `);
  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    locationId: row.location_id || LOOKUP_CITY,
    name: row.name,
    address: row.address ?? undefined,
    neighborhood: row.neighborhood ?? undefined,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    sourceUrl: row.source_url ?? undefined,
    source: row.source as ClaimableBusinessListing["source"],
    businessCategory: row.business_category ?? undefined,
  } as ClaimableBusinessListing;
}

/**
 * Production resolver: stored results first (covers every source lookup can
 * offer, including providers whose live queries are disabled), then the live
 * provider resolution used by the legacy claim form.
 */
export async function resolveOfferedListing(
  cityId: string,
  listingSource: string,
  listingId: string,
): Promise<ClaimableBusinessListing | null> {
  // 1. A published profile is the trusted record for its own listing identity, so
  //    every profile-kind lookup match resolves even when provider results aged out
  //    or the business was self-reported.
  const published = await resolvePublishedProfileListing(cityId, listingSource, listingId);
  if (published) return published;
  // 2. Stored provider results cover every listing-kind match lookup can offer.
  const stored = await resolveStoredListing(cityId, listingSource, listingId);
  if (stored) return stored;
  // 3. Live provider resolution as used by the legacy claim form.
  return resolveClaimableBusinessListing(cityId, listingSource, listingId);
}

async function resolvePublishedProfileListing(
  cityId: string,
  listingSource: string,
  listingId: string,
): Promise<ClaimableBusinessListing | null> {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(
      and(
        eq(businessProfilesTable.cityId, cityId),
        eq(businessProfilesTable.listingSource, listingSource),
        eq(businessProfilesTable.listingId, listingId),
        eq(businessProfilesTable.publicationStatus, "published"),
      ),
    )
    .limit(1);
  if (!profile) return null;
  return {
    id: profile.listingId,
    locationId: profile.cityId,
    name: profile.name,
    address: profile.address ?? undefined,
    neighborhood: profile.neighborhood ?? undefined,
    lat: 0,
    lng: 0,
    sourceUrl: profile.sourceUrl ?? undefined,
    source: profile.listingSource as ClaimableBusinessListing["source"],
    businessCategory: profile.category ?? undefined,
  } as ClaimableBusinessListing;
}

function publicProfileMatch(profile: BusinessProfile): BusinessLookupMatch {
  return {
    kind: "profile",
    cityId: profile.cityId,
    listingSource: profile.listingSource,
    listingId: profile.listingId,
    name: profile.name,
    neighborhood: profile.neighborhood,
    category: profile.category,
    sourceUrl: profile.sourceUrl,
    isClaimed: profile.isClaimed,
  };
}

function publicListingMatch(listing: LookupListing, isClaimed: boolean): BusinessLookupMatch {
  return {
    kind: "listing",
    cityId: listing.locationId,
    listingSource: listing.source ?? "openstreetmap",
    listingId: listing.id,
    name: listing.name,
    neighborhood: listing.neighborhood ?? null,
    category: listing.businessCategory ?? null,
    sourceUrl: listing.sourceUrl ?? null,
    isClaimed,
  };
}

class LookupRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /** Returns false when the account has used its budget for the window. */
  take(key: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [otherKey, otherHits] of this.hits) {
        if (otherHits.every((at) => now - at >= this.windowMs)) this.hits.delete(otherKey);
      }
    }
    return true;
  }
}

function zodFieldErrors(issues: { path: PropertyKey[]; code: string }[]): ApiFieldError[] {
  return issues.map((issue) => ({
    field: issue.path.map(String).join(".") || "body",
    code: issue.code,
  }));
}

function rejectClientFields(
  req: Request,
  res: Response,
  allowedBodyFields: ReadonlySet<string>,
  allowedQueryFields: ReadonlySet<string> = NO_FIELDS,
): boolean {
  const fieldErrors = [
    ...unknownFieldErrors(req.body, allowedBodyFields),
    ...unknownFieldErrors(req.query, allowedQueryFields),
  ];
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (body.business && typeof body.business === "object") {
      fieldErrors.push(
        ...unknownFieldErrors(body.business, BUSINESS_FIELDS).map((error) => ({
          ...error,
          field: `business.${error.field}`,
        })),
      );
    }
    if (body.listing && typeof body.listing === "object") {
      fieldErrors.push(
        ...unknownFieldErrors(body.listing, LISTING_FIELDS).map((error) => ({
          ...error,
          field: `listing.${error.field}`,
        })),
      );
    }
  }
  if (fieldErrors.length === 0) return false;
  sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors });
  return true;
}

function rejectUnverified(req: Request, res: Response): boolean {
  if (req.account!.identity.emailVerified) return false;
  sendApiError(req, res, "EMAIL_UNVERIFIED");
  return true;
}

function validPublicUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Digest of the request payload, stored next to the raw key so key reuse with other input is detectable. */
function idempotencyDigest(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/** Finds the claim previously created by this claimant with exactly this raw key. */
async function findIdempotentClaim(claimantId: string, rawKey: string): Promise<BusinessClaim | null> {
  const [existing] = await db
    .select()
    .from(businessClaimsTable)
    .where(and(eq(businessClaimsTable.claimantId, claimantId), eq(businessClaimsTable.idempotencyKey, rawKey)))
    .limit(1);
  return existing ?? null;
}

type ClaimRow = { claim: BusinessClaim; profile: BusinessProfile };

async function findOwnClaim(claimId: number, claimantId: string): Promise<ClaimRow | null> {
  const [row] = await db
    .select({ claim: businessClaimsTable, profile: businessProfilesTable })
    .from(businessClaimsTable)
    .innerJoin(businessProfilesTable, eq(businessClaimsTable.businessProfileId, businessProfilesTable.id))
    .where(and(eq(businessClaimsTable.id, claimId), eq(businessClaimsTable.claimantId, claimantId)))
    .limit(1);
  return row ?? null;
}

type IntakeTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lock order shared with every review decision: business profile row first,
 * then the claim. The unlocked preflight read only discovers the profile id;
 * the claim is re-read under its own lock afterwards so a concurrent reviewer
 * decision and a claimant mutation serialise instead of deadlocking.
 */
async function lockClaimantClaim(
  tx: IntakeTx,
  claimId: number,
  claimantId: string,
): Promise<{ locked: BusinessClaim; profile: BusinessProfile } | null> {
  const [preflight] = await tx
    .select({ businessProfileId: businessClaimsTable.businessProfileId })
    .from(businessClaimsTable)
    .where(and(eq(businessClaimsTable.id, claimId), eq(businessClaimsTable.claimantId, claimantId)))
    .limit(1);
  if (!preflight) return null;
  const [profile] = await tx
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, preflight.businessProfileId))
    .for("update");
  const [locked] = await tx
    .select()
    .from(businessClaimsTable)
    .where(and(eq(businessClaimsTable.id, claimId), eq(businessClaimsTable.claimantId, claimantId)))
    .for("update");
  if (!profile || !locked || locked.businessProfileId !== profile.id) return null;
  return { locked, profile };
}

export function createBusinessIntakeRouter(options: BusinessIntakeRouterOptions = {}): IRouter {
  const flags = options.flags ?? getFeatureFlags;
  const lookupListings = options.lookupListings ?? lookupStoredListings;
  const resolveListing = options.resolveListing ?? resolveOfferedListing;
  const rate = options.lookupRateLimit ?? DEFAULT_LOOKUP_RATE_LIMIT;
  const limiter = new LookupRateLimiter(rate.limit, rate.windowMs, options.now ?? Date.now);
  const router: IRouter = Router();

  // Applied per route (not via a `/business-claims/:id` prefix) so the legacy
  // `/business-claims/moderation` routes are never shadowed by the gate.
  const guarded: RequestHandler[] = [
    requireFlag("businessIntake", flags),
    requireAppUser({ resolveIdentity: options.resolveIdentity }),
  ];
  // Lookup and draft creation expose (bounded) business data or create private
  // records, so they additionally require a verified identity.
  const verifiedGuarded: RequestHandler[] = [
    requireFlag("businessIntake", flags),
    requireAppUser({ resolveIdentity: options.resolveIdentity, requireVerified: true }),
  ];

  type PublicMatches = { matches: BusinessLookupMatch[]; truncated: boolean } | "unavailable";

  /**
   * Bounded, public-only match search shared by the lookup route and the
   * new-business duplicate re-check at submission. `excludeProfileId` keeps a
   * representative's own draft out of its duplicate candidates.
   */
  async function findPublicMatches(query: string, excludeProfileId?: number): Promise<PublicMatches> {
    let listings: LookupListing[];
    try {
      listings = await lookupListings(query, LOOKUP_RESULT_LIMIT + 1);
    } catch (error) {
      return "unavailable";
    }

    const profiles = await db
      .select()
      .from(businessProfilesTable)
      .where(
        and(
          eq(businessProfilesTable.cityId, LOOKUP_CITY),
          eq(businessProfilesTable.publicationStatus, "published"),
          sql`lower(${businessProfilesTable.name}) like ${`%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`}`,
        ),
      )
      .orderBy(businessProfilesTable.name)
      .limit(LOOKUP_RESULT_LIMIT + 1);

    const seen = new Set<string>();
    const matches: BusinessLookupMatch[] = [];
    for (const profile of profiles) {
      if (profile.id === excludeProfileId) continue;
      seen.add(`${profile.listingSource}:${profile.listingId}`);
      matches.push(publicProfileMatch(profile));
    }
    // Claim state for listings that are not yet published profiles (e.g. draft rows) is
    // still authoritative on the profile table.
    const listingKeys = listings.map((listing) => listing.id);
    const knownProfiles = listingKeys.length
      ? await db
          .select({
            listingSource: businessProfilesTable.listingSource,
            listingId: businessProfilesTable.listingId,
            isClaimed: businessProfilesTable.isClaimed,
          })
          .from(businessProfilesTable)
          .where(and(eq(businessProfilesTable.cityId, LOOKUP_CITY), inArray(businessProfilesTable.listingId, listingKeys)))
      : [];
    const claimedByKey = new Map(knownProfiles.map((row) => [`${row.listingSource}:${row.listingId}`, row.isClaimed]));
    for (const listing of listings) {
      const key = `${listing.source ?? "openstreetmap"}:${listing.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(publicListingMatch(listing, claimedByKey.get(key) ?? false));
    }

    matches.sort((a, b) => {
      const aStarts = a.name.toLocaleLowerCase("nl-NL").startsWith(query) ? 0 : 1;
      const bStarts = b.name.toLocaleLowerCase("nl-NL").startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, "nl-NL");
    });
    return { matches: matches.slice(0, LOOKUP_RESULT_LIMIT), truncated: matches.length > LOOKUP_RESULT_LIMIT };
  }

  router.get("/businesses/lookup", verifiedGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS, LOOKUP_QUERY_FIELDS)) return;
    const parsed = LookupBusinessesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(parsed.error.issues) });
      return;
    }
    const account = req.account!;
    if (!limiter.take(account.user.id.toString())) {
      req.log?.warn?.({ event: "business_intake.lookup_rate_limited", accountId: account.user.id }, "Lookup rate limited");
      sendApiError(req, res, "RATE_LIMITED");
      return;
    }
    const query = normaliseLookupQuery(parsed.data.q);
    if (query.length < 2) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "q", code: "too_small" }] });
      return;
    }

    const found = await findPublicMatches(query);
    if (found === "unavailable") {
      req.log?.error?.({ event: "business_intake.lookup_failed" }, "Business lookup source failed");
      sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
      return;
    }
    res.json(
      LookupBusinessesResponse.parse({
        query: parsed.data.q.trim(),
        matches: found.matches,
        truncated: found.truncated,
      }),
    );
  });

  router.post("/businesses", verifiedGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, DRAFT_FIELDS)) return;
    if (rejectUnverified(req, res)) return;
    const account = req.account!;
    const claimantId = account.identity.userId;
    const parsed = CreateBusinessIntakeDraftBody.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(parsed.error.issues) });
      return;
    }
    const input = parsed.data;
    const fieldErrors: ApiFieldError[] = [];
    if (input.kind === "existing_listing" && !input.listing) fieldErrors.push({ field: "listing", code: "required" });
    if (input.kind === "new_business" && !input.business) fieldErrors.push({ field: "business", code: "required" });
    if (!validPublicUrl(input.business?.websiteUrl)) fieldErrors.push({ field: "business.websiteUrl", code: "invalid_url" });
    if (fieldErrors.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors });
      return;
    }

    const rawKey = req.header("idempotency-key")?.trim();
    if (rawKey !== undefined && (rawKey.length < 8 || rawKey.length > 128)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "Idempotency-Key", code: "invalid_length" }] });
      return;
    }
    const digest = rawKey ? idempotencyDigest(input) : null;
    /** Replays the stored result for this key, or answers 409 when the key was reused with other input. */
    const replayIdempotent = async (): Promise<boolean> => {
      if (!rawKey) return false;
      const existing = await findIdempotentClaim(claimantId, rawKey);
      if (!existing) return false;
      if (existing.idempotencyDigest !== digest) {
        sendApiError(req, res, "IDEMPOTENCY_CONFLICT");
        return true;
      }
      const row = await findOwnClaim(existing.id, claimantId);
      if (!row) return false;
      res.status(200).json(CreateBusinessIntakeDraftResponse.parse(serialiseClaim(row.claim, row.profile)));
      return true;
    };
    if (await replayIdempotent()) return;

    // Existing listings are re-resolved from the approved provider by identity only;
    // the browser never supplies the business facts that end up on the profile.
    let canonical: ClaimableBusinessListing | null = null;
    if (input.kind === "existing_listing") {
      const listing = input.listing!;
      try {
        canonical = await resolveListing(listing.cityId, listing.listingSource, listing.listingId);
      } catch (error) {
        req.log?.warn?.({ err: error, event: "business_intake.listing_unresolved" }, "Could not resolve the claimed listing");
        sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
        return;
      }
      if (!canonical || !canonical.source || canonical.source !== listing.listingSource) {
        sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "listing", code: "not_claimable" }] });
        return;
      }
    }

    const claimValues = {
      claimantId,
      contactName: input.contactName.trim(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      relationship: input.relationship.trim(),
      authorityDeclaration: input.authorityDeclaration.trim(),
      evidenceReference: trimmedOrNull(input.evidenceReference),
      message: trimmedOrNull(input.message),
      status: "draft" as const,
      idempotencyKey: rawKey ?? null,
      idempotencyDigest: digest,
    };

    const publicationEnabled = flags().businessPublication;
    let result: ClaimRow;
    try {
      result = await db.transaction(async (tx) => {
        let profile: BusinessProfile | undefined;
        if (canonical) {
          const source = canonical.source!;
          const where = and(
            eq(businessProfilesTable.cityId, canonical.locationId),
            eq(businessProfilesTable.listingSource, source),
            eq(businessProfilesTable.listingId, canonical.id),
          );
          // Lock the profile row first (same order as every review decision) so a
          // claim cannot slip in between a reviewer's interested-party check and commit.
          [profile] = await tx.select().from(businessProfilesTable).where(where).for("update");
          if (!profile) {
            await tx
              .insert(businessProfilesTable)
              .values({
                slug: listingSlug(canonical.name, canonical.id),
                cityId: canonical.locationId,
                listingSource: source,
                listingId: canonical.id,
                name: canonical.name,
                address: canonical.address ?? null,
                neighborhood: canonical.neighborhood ?? null,
                latitude: canonical.lat,
                longitude: canonical.lng,
                sourceUrl: canonical.sourceUrl ?? null,
                // Once publication review is live nothing goes public without an explicit
                // publish decision; before that listing pages keep serving the columns.
                publicationStatus: publicationEnabled ? "draft" : "published",
              })
              .onConflictDoNothing();
            [profile] = await tx.select().from(businessProfilesTable).where(where).for("update");
          }
          if (!profile) throw new Error("Listing profile was not readable after insert.");
          // One open claim or draft per claimant and business.
          const [mine] = await tx
            .select({ id: businessClaimsTable.id })
            .from(businessClaimsTable)
            .where(
              and(
                eq(businessClaimsTable.businessProfileId, profile.id),
                eq(businessClaimsTable.claimantId, claimantId),
                inArray(businessClaimsTable.status, ["draft", ...OPEN_CLAIM_STATUSES]),
              ),
            )
            .limit(1);
          if (mine) throw new ClaimConflictError("You already have a draft or open claim for this business.");
        } else {
          const business = input.business!;
          const listingId = randomUUID();
          [profile] = await tx
            .insert(businessProfilesTable)
            .values({
              slug: listingSlug(business.name, listingId),
              cityId: LOOKUP_CITY,
              listingSource: SELF_REPORTED_LISTING_SOURCE,
              listingId,
              name: business.name.trim(),
              category: business.category.trim(),
              neighborhood: business.neighborhood.trim(),
              address: trimmedOrNull(business.address),
              websiteUrl: trimmedOrNull(business.websiteUrl),
              publicationStatus: "draft",
              createdByUserId: claimantId,
            })
            .returning();
        }
        const [claim] = await tx
          .insert(businessClaimsTable)
          .values({ ...claimValues, businessProfileId: profile.id })
          .returning();
        return { claim, profile };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Concurrent requests with the same key: the loser replays the winner's result.
        if (await replayIdempotent()) return;
        sendApiError(req, res, "IDEMPOTENCY_CONFLICT");
        return;
      }
      if (error instanceof ClaimConflictError) {
        sendApiError(req, res, "IDEMPOTENCY_CONFLICT");
        return;
      }
      throw error;
    }

    req.log?.info?.(
      { event: "business_intake.draft_created", accountId: account.user.id, claimId: result.claim.id, kind: input.kind },
      "Business intake draft created",
    );
    res.status(201).json(CreateBusinessIntakeDraftResponse.parse(serialiseClaim(result.claim, result.profile)));
  });

  router.get("/business-claims/:id", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS)) return;
    const params = GetBusinessClaimParams.safeParse(req.params);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const row = await findOwnClaim(params.data.id, req.account!.identity.userId);
    if (!row) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    res.json(GetBusinessClaimResponse.parse(serialiseClaim(row.claim, row.profile)));
  });

  router.patch("/business-claims/:id", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, UPDATE_FIELDS)) return;
    if (rejectUnverified(req, res)) return;
    const params = UpdateBusinessClaimParams.safeParse(req.params);
    const body = UpdateBusinessClaimBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(body.error.issues) });
      return;
    }
    const input = body.data;
    if (!Number.isInteger(input.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid_type" }] });
      return;
    }
    if (!validPublicUrl(input.business?.websiteUrl)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "business.websiteUrl", code: "invalid_url" }] });
      return;
    }
    const claimantId = req.account!.identity.userId;

    let result: ClaimRow | "not_found" | "not_editable" | { conflict: number };
    result = await db.transaction(async (tx) => {
      const held = await lockClaimantClaim(tx, params.data.id, claimantId);
      if (!held) return "not_found";
      const { locked, profile } = held;
      if (locked.version !== input.expectedVersion) return { conflict: locked.version };
      if (!EDITABLE_CLAIM_STATUSES.has(locked.status)) return "not_editable";

      if (input.business !== undefined) {
        if (profile.listingSource !== SELF_REPORTED_LISTING_SOURCE) return "not_editable";
        const business = input.business;
        await tx
          .update(businessProfilesTable)
          .set({
            name: business.name.trim(),
            category: business.category.trim(),
            neighborhood: business.neighborhood.trim(),
            address: trimmedOrNull(business.address),
            websiteUrl: trimmedOrNull(business.websiteUrl),
          })
          .where(eq(businessProfilesTable.id, profile.id));
      }
      const [claim] = await tx
        .update(businessClaimsTable)
        .set({
          ...(input.contactName !== undefined ? { contactName: input.contactName.trim() } : {}),
          ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail.trim().toLowerCase() } : {}),
          ...(input.relationship !== undefined ? { relationship: input.relationship.trim() } : {}),
          ...(input.authorityDeclaration !== undefined ? { authorityDeclaration: input.authorityDeclaration.trim() } : {}),
          ...(input.evidenceReference !== undefined ? { evidenceReference: trimmedOrNull(input.evidenceReference) } : {}),
          ...(input.message !== undefined ? { message: trimmedOrNull(input.message) } : {}),
          version: locked.version + 1,
        })
        .where(eq(businessClaimsTable.id, locked.id))
        .returning();
      const [freshProfile] = await tx.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profile.id));
      return { claim, profile: freshProfile };
    });

    if (result === "not_found") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (result === "not_editable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_editable" }] });
      return;
    }
    if ("conflict" in result) {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: result.conflict });
      return;
    }
    res.json(UpdateBusinessClaimResponse.parse(serialiseClaim(result.claim, result.profile)));
  });

  router.post("/business-claims/:id/submit", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, SUBMIT_FIELDS)) return;
    if (rejectUnverified(req, res)) return;
    const params = SubmitBusinessClaimParams.safeParse(req.params);
    const body = SubmitBusinessClaimBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid_type" }] });
      return;
    }
    const claimantId = req.account!.identity.userId;
    const expectedVersion = body.data.expectedVersion;

    // New-business drafts are re-checked against public listings and published
    // profiles at submission. Candidates are shown to the representative, who must
    // either claim one instead or explicitly confirm that the business is new.
    if (body.data.confirmNoDuplicate !== true) {
      const current = await findOwnClaim(params.data.id, claimantId);
      if (current && current.profile.listingSource === SELF_REPORTED_LISTING_SOURCE && EDITABLE_CLAIM_STATUSES.has(current.claim.status)) {
        const query = normaliseLookupQuery(current.profile.name);
        const found = query.length >= 2 ? await findPublicMatches(query, current.profile.id) : { matches: [], truncated: false };
        if (found === "unavailable") {
          sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
          return;
        }
        if (found.matches.length > 0) {
          req.log?.info?.(
            { event: "business_intake.duplicate_candidates", claimId: current.claim.id, candidates: found.matches.length },
            "New-business submission has duplicate candidates",
          );
          sendApiError(req, res, "DUPLICATE_CANDIDATES", { duplicateCandidates: found.matches });
          return;
        }
      }
    }

    type Outcome = ClaimRow | "not_found" | "not_submittable" | "slot_taken" | { conflict: number };
    let outcome: Outcome;
    try {
      outcome = await db.transaction(async (tx): Promise<Outcome> => {
        const held = await lockClaimantClaim(tx, params.data.id, claimantId);
        if (!held) return "not_found";
        const { locked, profile } = held;
        if (locked.version !== expectedVersion) return { conflict: locked.version };
        if (!EDITABLE_CLAIM_STATUSES.has(locked.status)) return "not_submittable";
        if (profile.publicationStatus === "archived") return "not_found";

        // Duplicate re-check at submission time: exactly one open claim per business.
        const [otherOpen] = await tx
          .select({ id: businessClaimsTable.id })
          .from(businessClaimsTable)
          .where(
            and(
              eq(businessClaimsTable.businessProfileId, profile.id),
              inArray(businessClaimsTable.status, [...OPEN_CLAIM_STATUSES]),
              sql`${businessClaimsTable.id} <> ${locked.id}`,
            ),
          )
          .limit(1);
        if (otherOpen) return "slot_taken";

        // A business that already has a verified owner turns the submission into a
        // dispute for manual review; nothing is granted or transferred here.
        const [owner] = await tx
          .select({ id: businessMembersTable.id })
          .from(businessMembersTable)
          .where(and(eq(businessMembersTable.businessProfileId, profile.id), eq(businessMembersTable.role, "owner")))
          .limit(1);
        const nextStatus = owner || profile.isClaimed ? "disputed" : "submitted";

        const [claim] = await tx
          .update(businessClaimsTable)
          .set({
            status: nextStatus,
            version: locked.version + 1,
            reviewNote: null,
            reviewedAt: null,
            reviewedBy: null,
          })
          .where(eq(businessClaimsTable.id, locked.id))
          .returning();
        return { claim, profile };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        outcome = "slot_taken";
      } else {
        throw error;
      }
    }

    if (outcome === "not_found") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (outcome === "not_submittable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_submittable" }] });
      return;
    }
    if (outcome === "slot_taken") {
      sendApiError(req, res, "IDEMPOTENCY_CONFLICT", { fieldErrors: [{ field: "business", code: "claim_in_review" }] });
      return;
    }
    if ("conflict" in outcome) {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.conflict });
      return;
    }
    req.log?.info?.(
      { event: "business_intake.claim_submitted", claimId: outcome.claim.id, status: outcome.claim.status },
      "Business claim submitted",
    );
    res.json(SubmitBusinessClaimResponse.parse(serialiseClaim(outcome.claim, outcome.profile)));
  });

  router.post("/business-claims/:id/withdraw", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, TRANSITION_FIELDS)) return;
    const params = WithdrawBusinessClaimParams.safeParse(req.params);
    const body = WithdrawBusinessClaimBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid_type" }] });
      return;
    }
    const claimantId = req.account!.identity.userId;
    const expectedVersion = body.data.expectedVersion;

    type Outcome = ClaimRow | "not_found" | "not_withdrawable" | { conflict: number };
    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const held = await lockClaimantClaim(tx, params.data.id, claimantId);
      if (!held) return "not_found";
      const { locked } = held;
      let profile: BusinessProfile | undefined = held.profile;
      if (locked.version !== expectedVersion) return { conflict: locked.version };
      if (!WITHDRAWABLE_CLAIM_STATUSES.has(locked.status)) return "not_withdrawable";
      const [claim] = await tx
        .update(businessClaimsTable)
        .set({ status: "withdrawn", withdrawnAt: new Date(), version: locked.version + 1 })
        .where(and(eq(businessClaimsTable.id, locked.id), eq(businessClaimsTable.version, locked.version)))
        .returning();
      if (!claim) return { conflict: locked.version };
      // A withdrawn new-business draft leaves nothing public behind.
      if (profile && profile.listingSource === SELF_REPORTED_LISTING_SOURCE && profile.publicationStatus === "draft") {
        [profile] = await tx
          .update(businessProfilesTable)
          .set({ publicationStatus: "archived" })
          .where(eq(businessProfilesTable.id, profile.id))
          .returning();
      }
      if (!profile) return "not_found";
      return { claim, profile };
    });

    if (outcome === "not_found") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (outcome === "not_withdrawable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_withdrawable" }] });
      return;
    }
    if ("conflict" in outcome) {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.conflict });
      return;
    }
    req.log?.info?.({ event: "business_intake.claim_withdrawn", claimId: outcome.claim.id }, "Business claim withdrawn");
    res.json(WithdrawBusinessClaimResponse.parse(serialiseClaim(outcome.claim, outcome.profile)));
  });

  return router;
}

/** Newest-first list of one claimant's claims, including private drafts. */
export async function listOwnClaims(claimantId: string): Promise<ClaimRow[]> {
  return db
    .select({ claim: businessClaimsTable, profile: businessProfilesTable })
    .from(businessClaimsTable)
    .innerJoin(businessProfilesTable, eq(businessClaimsTable.businessProfileId, businessProfilesTable.id))
    .where(eq(businessClaimsTable.claimantId, claimantId))
    .orderBy(desc(businessClaimsTable.createdAt));
}

export default createBusinessIntakeRouter();
