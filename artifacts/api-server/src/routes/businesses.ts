import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  Router,
  type IRouter,
  type Request,
  type RequestHandler,
} from "express";

import {
  businessClaimsTable,
  businessMembersTable,
  businessProfilesTable,
  db,
  dealsTable,
  type BusinessClaim,
  type BusinessProfile,
  type Deal,
} from "@workspace/db";
import {
  CreateBusinessClaimBody,
  CreateBusinessClaimResponse,
  CreateBusinessDealBody,
  CreateBusinessDealParams,
  CreateBusinessDealResponse,
  DecideBusinessClaimBody,
  DecideBusinessClaimParams,
  DecideBusinessClaimResponse,
  DecideBusinessDealBody,
  DecideBusinessDealParams,
  DecideBusinessDealResponse,
  GetBusinessClaimModerationQueryParams,
  GetBusinessClaimModerationResponse,
  GetBusinessProfileParams,
  GetBusinessProfileResponse,
  GetDealModerationQueryParams,
  GetDealModerationResponse,
  GetDealsQueryParams,
  GetDealsResponse,
  GetMyBusinessClaimsResponse,
  GetMyBusinessProfilesResponse,
  UpdateBusinessDealBody,
  UpdateBusinessDealParams,
  UpdateBusinessDealResponse,
  UpdateBusinessProfileBody,
  UpdateBusinessProfileParams,
  UpdateBusinessProfileResponse,
} from "@workspace/api-zod";
import {
  ClaimConflictError,
  REVIEWABLE_CLAIM_STATUSES,
  isUniqueViolation,
  listingSlug,
  serialiseProfile,
  serialiseClaim,
} from "../lib/businessClaims";
import { applyClaimDecision } from "../lib/claimDecisions";
import {
  approvedRevisionFor,
  factChecksFor,
  freshnessFor,
  latestRevisionFor,
  normaliseContent,
  projectApprovedContent,
  serialisePublicCheck,
} from "../lib/businessRevisions";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { upsertDraftRevision } from "./business-publication";
import { requireEditor } from "../middlewares/requireEditor.js";
import { resolveClaimableBusinessListing } from "./listings.js";

export type BusinessesRouterOptions = {
  /** Resolves the signed-in subject; defaults to Clerk. */
  getUserId?: (req: Request) => string | null;
  /** Editor gate; defaults to the Clerk role check. */
  requireEditor?: RequestHandler;
  /** Rollout flags; `businessPublication` routes owner edits through draft revisions. */
  flags?: FeatureFlagSource;
};

const supportedCities = new Set(["ams", "rot", "utr", "dhg", "ein"]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function strictDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function serialiseDeal(deal: Deal, profile?: BusinessProfile) {
  return {
    id: deal.id,
    businessProfileId: deal.businessProfileId,
    ...(profile
      ? { businessName: profile.name, businessSlug: profile.slug }
      : {}),
    cityId: deal.cityId,
    title: deal.title,
    description: deal.description,
    category: deal.category,
    offerText: deal.offerText,
    redemptionUrl: deal.redemptionUrl,
    couponCode: deal.couponCode,
    imageUrl: deal.imageUrl,
    validFrom: deal.validFrom,
    validUntil: deal.validUntil,
    status: deal.status,
    reviewNote: deal.reviewNote,
    reviewedAt: deal.reviewedAt?.toISOString() ?? null,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

function clerkUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

function validPublicUrl(value: string | undefined) {
  if (!value?.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findOwnedProfile(profileId: number, userId: string) {
  const [row] = await db
    .select({ profile: businessProfilesTable, role: businessMembersTable.role })
    .from(businessMembersTable)
    .innerJoin(
      businessProfilesTable,
      eq(businessMembersTable.businessProfileId, businessProfilesTable.id),
    )
    .where(
      and(
        eq(businessMembersTable.businessProfileId, profileId),
        eq(businessMembersTable.userId, userId),
        eq(businessMembersTable.role, "owner"),
      ),
    );
  return row;
}

async function claimRows(
  condition?: ReturnType<typeof eq> | ReturnType<typeof inArray>,
) {
  const query = db
    .select({ claim: businessClaimsTable, profile: businessProfilesTable })
    .from(businessClaimsTable)
    .innerJoin(
      businessProfilesTable,
      eq(businessClaimsTable.businessProfileId, businessProfilesTable.id),
    );
  return condition
    ? query.where(condition).orderBy(desc(businessClaimsTable.createdAt))
    : query.orderBy(desc(businessClaimsTable.createdAt));
}

/**
 * Public serialisation. Every editorial field comes from the approved
 * snapshot only (with contradicted fields withheld); the mutable columns are
 * never served while publication is on, so unreviewed owner edits and private
 * drafts cannot appear here. Published profiles get their approved v1 from the
 * startup backfill; one without a snapshot is treated as unavailable (`null`)
 * rather than falling back to columns. With publication off the legacy columns
 * are served unchanged.
 */
async function publicProjection(profile: BusinessProfile, publicationEnabled: boolean) {
  const base = serialiseProfile(profile);
  // Flag off (or rolled back): the legacy columns are the public truth again, even
  // when an approved snapshot exists from an earlier enablement.
  if (!publicationEnabled) return { ...base, approvedRevisionVersion: null, content: null, provenance: null };
  const approved = await approvedRevisionFor(profile);
  if (!approved) return null;
  const checks = await factChecksFor(approved.id);
  const content = projectApprovedContent(normaliseContent(approved.content), checks);
  return {
    ...base,
    tagline: content.nl.tagline,
    description: content.nl.description,
    openingHours: content.nl.openingHours,
    websiteUrl: content.facts.websiteUrl,
    phone: content.facts.phone,
    email: content.facts.email,
    address: content.facts.address,
    logoUrl: content.facts.logoUrl,
    coverUrl: content.facts.coverUrl,
    approvedRevisionVersion: approved.version,
    content,
    provenance: {
      listingSource: profile.listingSource,
      sourceUrl: profile.sourceUrl,
      approvedVersion: approved.version,
      approvedAt: approved.decidedAt?.toISOString() ?? null,
      freshness: freshnessFor(checks),
      checks: checks.map(serialisePublicCheck),
    },
  };
}

export function createBusinessesRouter(
  options: BusinessesRouterOptions = {},
): IRouter {
  const getUserId = options.getUserId ?? clerkUserId;
  const requireEditorRole = options.requireEditor ?? requireEditor;
  const flags = options.flags ?? getFeatureFlags;
  const router: IRouter = Router();

  function currentUserId(
    req: Request,
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
  ) {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Authentication is required." });
      return null;
    }
    return userId;
  }

  router.get("/business-claims", async (req, res): Promise<void> => {
    const userId = currentUserId(req, res);
    if (!userId) return;
    const rows = await claimRows(eq(businessClaimsTable.claimantId, userId));
    res.json(
      GetMyBusinessClaimsResponse.parse(
        rows.map(({ claim, profile }) => serialiseClaim(claim, profile)),
      ),
    );
  });

  router.post("/business-claims", async (req, res): Promise<void> => {
    const userId = currentUserId(req, res);
    if (!userId) return;
    const parsed = CreateBusinessClaimBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid business claim." });
      return;
    }

    const {
      listing,
      contactName,
      contactEmail,
      relationship,
      evidenceUrl,
      message,
    } = parsed.data;
    if (!validEmail(contactEmail) || !validPublicUrl(evidenceUrl)) {
      res.status(400).json({ error: "Please provide valid contact details." });
      return;
    }

    let canonical;
    try {
      canonical = await resolveClaimableBusinessListing(
        listing.cityId,
        listing.listingSource,
        listing.listingId,
      );
    } catch (error) {
      req.log.warn({ err: error }, "Could not resolve the claimed listing");
      res
        .status(503)
        .json({
          error:
            "The listing could not be verified right now. Please try again shortly.",
        });
      return;
    }
    if (
      !canonical ||
      !canonical.source ||
      !supportedCities.has(canonical.locationId)
    ) {
      res
        .status(400)
        .json({
          error:
            "Select a current business listing from the map before claiming it.",
        });
      return;
    }
    const canonicalSource = canonical.source;

    let claim: BusinessClaim;
    let profile: BusinessProfile;
    try {
      const publicationEnabled = flags().businessPublication;
      ({ claim, profile } = await db.transaction(async (tx) => {
        // Profile row lock first, matching the order used by review decisions.
        let [existingProfile] = await tx
          .select()
          .from(businessProfilesTable)
          .where(
            and(
              eq(businessProfilesTable.cityId, canonical.locationId),
              eq(businessProfilesTable.listingSource, canonicalSource),
              eq(businessProfilesTable.listingId, canonical.id),
            ),
          )
          .for("update");
        if (!existingProfile) {
          await tx
            .insert(businessProfilesTable)
            .values({
              slug: listingSlug(canonical.name, canonical.id),
              cityId: canonical.locationId,
              listingSource: canonicalSource,
              listingId: canonical.id,
              name: canonical.name,
              address: canonical.address ?? null,
              neighborhood: canonical.neighborhood ?? null,
              latitude: canonical.lat,
              longitude: canonical.lng,
              sourceUrl: canonical.sourceUrl ?? null,
              publicationStatus: publicationEnabled ? "draft" : "published",
            })
            .onConflictDoNothing();
          [existingProfile] = await tx
            .select()
            .from(businessProfilesTable)
            .where(
              and(
                eq(businessProfilesTable.cityId, canonical.locationId),
                eq(businessProfilesTable.listingSource, canonicalSource),
                eq(businessProfilesTable.listingId, canonical.id),
              ),
            )
            .for("update");
        }
        if (!existingProfile || existingProfile.isClaimed) {
          throw new ClaimConflictError(
            "This listing has already been claimed.",
          );
        }
        const [newClaim] = await tx
          .insert(businessClaimsTable)
          .values({
            businessProfileId: existingProfile.id,
            claimantId: userId,
            contactName: contactName.trim(),
            contactEmail: contactEmail.trim().toLowerCase(),
            relationship: relationship.trim(),
            evidenceUrl: evidenceUrl?.trim() || null,
            message: message?.trim() || null,
          })
          .returning();
        return { claim: newClaim, profile: existingProfile };
      }));
    } catch (error) {
      if (error instanceof ClaimConflictError || isUniqueViolation(error)) {
        res
          .status(409)
          .json({
            error:
              "A claim for this listing is already under review or it has been claimed.",
          });
        return;
      }
      throw error;
    }

    res
      .status(201)
      .json(CreateBusinessClaimResponse.parse(serialiseClaim(claim, profile)));
  });

  router.get(
    "/business-claims/moderation",
    requireEditorRole,
    async (req, res): Promise<void> => {
      const parsed = GetBusinessClaimModerationQueryParams.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid claim status." });
        return;
      }
      const status = parsed.data.status ?? "pending";
      const rows =
        status === "all"
          ? await claimRows()
          : status === "pending"
            ? await claimRows(
                inArray(businessClaimsTable.status, [...REVIEWABLE_CLAIM_STATUSES]),
              )
            : await claimRows(eq(businessClaimsTable.status, status));
      res.json(
        GetBusinessClaimModerationResponse.parse(
          rows.map(({ claim, profile }) => serialiseClaim(claim, profile)),
        ),
      );
    },
  );

  router.patch(
    "/business-claims/moderation/:id",
    requireEditorRole,
    async (req, res): Promise<void> => {
      const params = DecideBusinessClaimParams.safeParse(req.params);
      const body = DecideBusinessClaimBody.safeParse(req.body);
      const editorId = getUserId(req);
      if (!params.success || !body.success || !editorId) {
        res.status(400).json({ error: "Invalid claim decision." });
        return;
      }
      // A decision is bound to the exact claim version the reviewer looked at.
      if (body.data.expectedVersion === undefined) {
        res.status(400).json({ error: "expectedVersion is required for claim decisions." });
        return;
      }
      const outcome = await applyClaimDecision({
        claimId: params.data.id,
        reviewerId: editorId,
        decision: body.data.decision,
        expectedVersion: body.data.expectedVersion,
        reason: body.data.reviewNote?.trim() || null,
      });
      switch (outcome.kind) {
        case "not_found":
          res.status(404).json({ error: "Business claim not found." });
          return;
        case "not_reviewable":
          res.status(409).json({ error: "This claim has already been decided." });
          return;
        case "stale":
          res.status(409).json({
            error: "This claim changed since you reviewed it. Reload and review the current version.",
            expectedVersion: outcome.currentVersion,
          });
          return;
        case "reason_required":
          res.status(400).json({ error: "This decision requires a reason for the claimant." });
          return;
        case "self_review":
          res.status(403).json({ error: outcome.message });
          return;
        case "conflict":
          res.status(409).json({ error: outcome.message });
          return;
        case "decided":
          break;
      }
      const result = { claim: outcome.claim, profile: outcome.profile };

      res.json(
        DecideBusinessClaimResponse.parse(
          serialiseClaim(result.claim, result.profile),
        ),
      );
    },
  );

  router.get("/business-profiles/mine", async (req, res): Promise<void> => {
    const userId = currentUserId(req, res);
    if (!userId) return;
    const rows = await db
      .select({
        profile: businessProfilesTable,
        role: businessMembersTable.role,
      })
      .from(businessMembersTable)
      .innerJoin(
        businessProfilesTable,
        eq(businessMembersTable.businessProfileId, businessProfilesTable.id),
      )
      .where(eq(businessMembersTable.userId, userId))
      .orderBy(asc(businessProfilesTable.name));
    const profileIds = rows.map((row) => row.profile.id);
    const allDeals = profileIds.length
      ? await db
          .select()
          .from(dealsTable)
          .where(inArray(dealsTable.businessProfileId, profileIds))
          .orderBy(desc(dealsTable.createdAt))
      : [];
    const dealsByProfile = new Map<number, Deal[]>();
    for (const deal of allDeals) {
      dealsByProfile.set(deal.businessProfileId, [
        ...(dealsByProfile.get(deal.businessProfileId) ?? []),
        deal,
      ]);
    }

    res.json(
      GetMyBusinessProfilesResponse.parse(
        rows.map(({ profile, role }) => ({
          ...serialiseProfile(profile),
          role,
          deals: (dealsByProfile.get(profile.id) ?? []).map((deal) =>
            serialiseDeal(deal, profile),
          ),
        })),
      ),
    );
  });

  router.patch("/business-profiles/:id", async (req, res): Promise<void> => {
    const userId = currentUserId(req, res);
    if (!userId) return;
    const params = UpdateBusinessProfileParams.safeParse(req.params);
    const body = UpdateBusinessProfileBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid profile update." });
      return;
    }
    if (Object.keys(body.data).length === 0) {
      res
        .status(400)
        .json({ error: "Include at least one profile field to update." });
      return;
    }
    if (
      !validPublicUrl(body.data.websiteUrl) ||
      !validPublicUrl(body.data.logoUrl) ||
      !validPublicUrl(body.data.coverUrl) ||
      (body.data.email !== undefined && !validEmail(body.data.email))
    ) {
      res
        .status(400)
        .json({ error: "Please use valid email and web addresses." });
      return;
    }
    const owned = await findOwnedProfile(params.data.id, userId);
    if (!owned) {
      res.status(403).json({ error: "Owner access is required." });
      return;
    }
    if (flags().businessPublication) {
      // With publication review on, owner edits never reach the public columns
      // directly: they are merged into a draft revision that a reviewer must approve.
      if (body.data.name !== undefined) {
        res.status(400).json({ error: "The business name cannot be changed while publication review is enabled." });
        return;
      }
      const latest = await latestRevisionFor(owned.profile.id);
      const outcome = await upsertDraftRevision(owned.profile, userId, latest?.version ?? 0, {
        nl: {
          tagline: body.data.tagline,
          description: body.data.description,
          openingHours: body.data.openingHours,
        },
        facts: {
          websiteUrl: body.data.websiteUrl,
          phone: body.data.phone,
          email: body.data.email,
          logoUrl: body.data.logoUrl,
          coverUrl: body.data.coverUrl,
        },
      });
      if (outcome.kind !== "ok") {
        res.status(409).json({
          error: "This profile is under review. Edit it from the profile editor once the review is complete.",
        });
        return;
      }
      res.json(UpdateBusinessProfileResponse.parse(serialiseProfile(owned.profile)));
      return;
    }
    const [profile] = await db
      .update(businessProfilesTable)
      .set(
        Object.fromEntries(
          Object.entries(body.data).map(([key, value]) => [
            key,
            typeof value === "string" ? value.trim() || null : value,
          ]),
        ),
      )
      .where(eq(businessProfilesTable.id, owned.profile.id))
      .returning();
    res.json(UpdateBusinessProfileResponse.parse(serialiseProfile(profile)));
  });

  router.post(
    "/business-profiles/:id/deals",
    async (req, res): Promise<void> => {
      const userId = currentUserId(req, res);
      if (!userId) return;
      const params = CreateBusinessDealParams.safeParse(req.params);
      const body = CreateBusinessDealBody.safeParse(req.body);
      const validFrom = strictDate(req.body?.validFrom);
      const validUntil = strictDate(req.body?.validUntil);
      if (
        !params.success ||
        !body.success ||
        !validFrom ||
        !validUntil ||
        validUntil < validFrom
      ) {
        res.status(400).json({ error: "Invalid deal details." });
        return;
      }
      if (
        !validPublicUrl(body.data.redemptionUrl) ||
        !validPublicUrl(body.data.imageUrl)
      ) {
        res.status(400).json({ error: "Please use valid web addresses." });
        return;
      }
      const owned = await findOwnedProfile(params.data.id, userId);
      if (!owned) {
        res.status(403).json({ error: "Owner access is required." });
        return;
      }
      const [deal] = await db
        .insert(dealsTable)
        .values({
          businessProfileId: owned.profile.id,
          cityId: owned.profile.cityId,
          title: body.data.title.trim(),
          description: body.data.description.trim(),
          category: body.data.category.trim(),
          offerText: body.data.offerText.trim(),
          redemptionUrl: body.data.redemptionUrl?.trim() || null,
          couponCode: body.data.couponCode?.trim() || null,
          imageUrl: body.data.imageUrl?.trim() || null,
          validFrom,
          validUntil,
        } as typeof dealsTable.$inferInsert)
        .returning();
      res
        .status(201)
        .json(
          CreateBusinessDealResponse.parse(serialiseDeal(deal, owned.profile)),
        );
    },
  );

  router.patch(
    "/business-profiles/:id/deals/:dealId",
    async (req, res): Promise<void> => {
      const userId = currentUserId(req, res);
      if (!userId) return;
      const params = UpdateBusinessDealParams.safeParse(req.params);
      const body = UpdateBusinessDealBody.safeParse(req.body);
      if (
        !params.success ||
        !body.success ||
        Object.keys(body.data).length === 0
      ) {
        res.status(400).json({ error: "Invalid deal update." });
        return;
      }
      if (
        !validPublicUrl(body.data.redemptionUrl) ||
        !validPublicUrl(body.data.imageUrl)
      ) {
        res.status(400).json({ error: "Please use valid web addresses." });
        return;
      }
      const owned = await findOwnedProfile(params.data.id, userId);
      if (!owned) {
        res.status(403).json({ error: "Owner access is required." });
        return;
      }
      const [existing] = await db
        .select()
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.id, params.data.dealId),
            eq(dealsTable.businessProfileId, owned.profile.id),
          ),
        );
      if (!existing) {
        res.status(404).json({ error: "Deal not found." });
        return;
      }
      const rawValidFrom =
        req.body?.validFrom === undefined
          ? undefined
          : strictDate(req.body.validFrom);
      const rawValidUntil =
        req.body?.validUntil === undefined
          ? undefined
          : strictDate(req.body.validUntil);
      if (
        (req.body?.validFrom !== undefined && !rawValidFrom) ||
        (req.body?.validUntil !== undefined && !rawValidUntil)
      ) {
        res
          .status(400)
          .json({
            error: "Deal dates must be calendar dates in YYYY-MM-DD format.",
          });
        return;
      }
      const requested = {
        ...body.data,
        ...(rawValidFrom ? { validFrom: rawValidFrom } : {}),
        ...(rawValidUntil ? { validUntil: rawValidUntil } : {}),
      };
      const nextValidFrom = requested.validFrom ?? existing.validFrom;
      const nextValidUntil = requested.validUntil ?? existing.validUntil;
      if (nextValidUntil < nextValidFrom) {
        res
          .status(400)
          .json({ error: "The end date must be after the start date." });
        return;
      }
      const contentChanged = Object.keys(requested).some(
        (key) => key !== "status",
      );
      const update = {
        ...Object.fromEntries(
          Object.entries(requested).map(([key, value]) => [
            key,
            typeof value === "string" ? value.trim() || null : value,
          ]),
        ),
        ...(contentChanged && requested.status !== "withdrawn"
          ? {
              status: "pending",
              reviewNote: null,
              reviewedBy: null,
              reviewedAt: null,
            }
          : {}),
      };
      const [deal] = await db
        .update(dealsTable)
        .set(update)
        .where(eq(dealsTable.id, existing.id))
        .returning();
      res.json(
        UpdateBusinessDealResponse.parse(serialiseDeal(deal, owned.profile)),
      );
    },
  );

  router.get(
    "/business-profiles/public/:slug",
    async (req, res): Promise<void> => {
      const params = GetBusinessProfileParams.safeParse(req.params);
      if (!params.success) {
        res.status(404).json({ error: "Profile not found." });
        return;
      }
      const [profile] = await db
        .select()
        .from(businessProfilesTable)
        .where(
          and(
            eq(businessProfilesTable.slug, params.data.slug),
            eq(businessProfilesTable.isClaimed, true),
            eq(businessProfilesTable.publicationStatus, "published"),
          ),
        );
      if (!profile) {
        res.status(404).json({ error: "Profile not found." });
        return;
      }
      const projection = await publicProjection(profile, flags().businessPublication);
      if (!projection) {
        req.log?.warn?.(
          { event: "business_publication.missing_snapshot", profileId: profile.id },
          "Published profile has no approved snapshot; run the revision backfill",
        );
        res.status(404).json({ error: "Profile not found." });
        return;
      }
      const activeDeals = await db
        .select()
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.businessProfileId, profile.id),
            eq(dealsTable.status, "approved"),
            lte(dealsTable.validFrom, today()),
            gte(dealsTable.validUntil, today()),
          ),
        )
        .orderBy(asc(dealsTable.validUntil));
      res.json(
        GetBusinessProfileResponse.parse({
          ...projection,
          deals: activeDeals.map((deal) => serialiseDeal(deal, profile)),
        }),
      );
    },
  );

  router.get("/deals", async (req, res): Promise<void> => {
    const parsed = GetDealsQueryParams.safeParse(req.query);
    if (!parsed.success || !supportedCities.has(parsed.data.cityId)) {
      res.status(400).json({ error: "Invalid city." });
      return;
    }
    const conditions = [
      eq(dealsTable.cityId, parsed.data.cityId),
      eq(dealsTable.status, "approved"),
      eq(businessProfilesTable.isClaimed, true),
      eq(businessProfilesTable.publicationStatus, "published"),
      lte(dealsTable.validFrom, today()),
      gte(dealsTable.validUntil, today()),
    ];
    if (parsed.data.category?.trim()) {
      conditions.push(eq(dealsTable.category, parsed.data.category.trim()));
    }
    const rows = await db
      .select({ deal: dealsTable, profile: businessProfilesTable })
      .from(dealsTable)
      .innerJoin(
        businessProfilesTable,
        eq(dealsTable.businessProfileId, businessProfilesTable.id),
      )
      .where(and(...conditions))
      .orderBy(asc(dealsTable.validUntil), desc(dealsTable.createdAt));
    res.json(
      GetDealsResponse.parse(
        rows.map(({ deal, profile }) => serialiseDeal(deal, profile)),
      ),
    );
  });

  router.get(
    "/deals/moderation",
    requireEditorRole,
    async (req, res): Promise<void> => {
      const parsed = GetDealModerationQueryParams.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid deal status." });
        return;
      }
      const rows = await db
        .select({ deal: dealsTable, profile: businessProfilesTable })
        .from(dealsTable)
        .innerJoin(
          businessProfilesTable,
          eq(dealsTable.businessProfileId, businessProfilesTable.id),
        )
        .where(
          parsed.data.status === "all"
            ? undefined
            : eq(dealsTable.status, parsed.data.status ?? "pending"),
        )
        .orderBy(desc(dealsTable.createdAt));
      res.json(
        GetDealModerationResponse.parse(
          rows.map(({ deal, profile }) => serialiseDeal(deal, profile)),
        ),
      );
    },
  );

  router.patch(
    "/deals/moderation/:id",
    requireEditorRole,
    async (req, res): Promise<void> => {
      const params = DecideBusinessDealParams.safeParse(req.params);
      const body = DecideBusinessDealBody.safeParse(req.body);
      const editorId = getUserId(req);
      if (!params.success || !body.success || !editorId) {
        res.status(400).json({ error: "Invalid deal decision." });
        return;
      }
      if (body.data.decision === "request_changes") {
        res.status(400).json({ error: "Deals can only be approved or rejected." });
        return;
      }
      const [row] = await db
        .select({ deal: dealsTable, profile: businessProfilesTable })
        .from(dealsTable)
        .innerJoin(
          businessProfilesTable,
          eq(dealsTable.businessProfileId, businessProfilesTable.id),
        )
        .where(eq(dealsTable.id, params.data.id));
      if (!row) {
        res.status(404).json({ error: "Deal not found." });
        return;
      }
      if (row.deal.status !== "pending") {
        res.status(409).json({ error: "This deal has already been decided." });
        return;
      }
      const [deal] = await db
        .update(dealsTable)
        .set({
          status: body.data.decision === "approve" ? "approved" : "rejected",
          reviewNote: body.data.reviewNote?.trim() || null,
          reviewedBy: editorId,
          reviewedAt: new Date(),
        })
        .where(eq(dealsTable.id, row.deal.id))
        .returning();
      res.json(
        DecideBusinessDealResponse.parse(serialiseDeal(deal, row.profile)),
      );
    },
  );

  return router;
}

export default createBusinessesRouter();
