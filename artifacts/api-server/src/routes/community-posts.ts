import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { db } from "@workspace/db";
import {
  communityPostParticipationTable,
  communityPostsTable,
  type CommunityPost,
} from "@workspace/db/schema";
import {
  CreateCommunityPostBody,
  DecideCommunityPostBody,
  GetCommunityPostsQueryParams,
  ToggleCommunityPostParticipationBody,
  ToggleCommunityPostParticipationParams,
} from "@workspace/api-zod";
import { requireEditor } from "../middlewares/requireEditor.js";

const router: IRouter = Router();

const supportedCities = new Set(["ams", "rot", "utr", "dhg", "ein"]);

function activeDate() {
  return new Date().toISOString().slice(0, 10);
}

type ParticipationSummary = {
  interestCount: number;
  attendanceCount: number;
  interestedByMe: boolean;
  attendingByMe: boolean;
};

const emptyParticipation: ParticipationSummary = {
  interestCount: 0,
  attendanceCount: 0,
  interestedByMe: false,
  attendingByMe: false,
};

async function getParticipationSummaries(postIds: number[], userId?: string | null) {
  const summaries = new Map<number, ParticipationSummary>();
  for (const postId of postIds) summaries.set(postId, { ...emptyParticipation });
  if (postIds.length === 0) return summaries;

  const counts = await db
    .select({
      postId: communityPostParticipationTable.postId,
      action: communityPostParticipationTable.action,
      count: sql<number>`count(*)::int`,
    })
    .from(communityPostParticipationTable)
    .where(inArray(communityPostParticipationTable.postId, postIds))
    .groupBy(
      communityPostParticipationTable.postId,
      communityPostParticipationTable.action,
    );

  for (const count of counts) {
    const summary = summaries.get(count.postId);
    if (!summary) continue;
    if (count.action === "interested") summary.interestCount = count.count;
    if (count.action === "attending") summary.attendanceCount = count.count;
  }

  if (!userId) return summaries;

  const ownActions = await db
    .select({
      postId: communityPostParticipationTable.postId,
      action: communityPostParticipationTable.action,
    })
    .from(communityPostParticipationTable)
    .where(
      and(
        inArray(communityPostParticipationTable.postId, postIds),
        eq(communityPostParticipationTable.userId, userId),
      ),
    );

  for (const ownAction of ownActions) {
    const summary = summaries.get(ownAction.postId);
    if (!summary) continue;
    if (ownAction.action === "interested") summary.interestedByMe = true;
    if (ownAction.action === "attending") summary.attendingByMe = true;
  }

  return summaries;
}

function publicPost(
  post: CommunityPost,
  participation: ParticipationSummary = emptyParticipation,
) {
  return {
    id: post.id,
    cityId: post.cityId,
    neighborhood: post.neighborhood,
    type: post.type,
    title: post.title,
    body: post.body,
    startsAt: post.startsAt,
    expiresAt: post.expiresAt,
    status: post.status,
    reviewNote: post.reviewNote,
    createdAt: post.createdAt.toISOString(),
    ...participation,
  };
}

function validateCity(cityId: string, res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (!supportedCities.has(cityId)) {
    res.status(400).json({ error: "Unknown city." });
    return false;
  }
  return true;
}

router.get("/community-posts", async (req, res): Promise<void> => {
  const parsed = GetCommunityPostsQueryParams.safeParse(req.query);
  const cityId = parsed.success ? parsed.data.cityId.trim() : "";
  if (!parsed.success || !validateCity(cityId, res)) {
    if (!parsed.success) res.status(400).json({ error: "Invalid community post filters." });
    return;
  }

  const { neighborhood, type } = parsed.data;
  const conditions = [
    eq(communityPostsTable.cityId, cityId),
    eq(communityPostsTable.status, "approved"),
    gte(communityPostsTable.expiresAt, activeDate()),
  ];
  if (neighborhood?.trim()) conditions.push(eq(communityPostsTable.neighborhood, neighborhood.trim()));
  if (type) conditions.push(eq(communityPostsTable.type, type));

  const posts = await db
    .select()
    .from(communityPostsTable)
    .where(and(...conditions))
    .orderBy(asc(communityPostsTable.startsAt), desc(communityPostsTable.createdAt))
    .limit(100);
  const participation = await getParticipationSummaries(
    posts.map((post) => post.id),
    getAuth(req).userId,
  );
  res.json(posts.map((post) => publicPost(post, participation.get(post.id))));
});

router.post("/community-posts", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to post something local." });
    return;
  }

  const parsed = CreateCommunityPostBody.safeParse(req.body);
  const cityId = parsed.success ? parsed.data.cityId.trim() : "";
  if (!parsed.success || !supportedCities.has(cityId)) {
    res.status(400).json({ error: "Please provide a valid city, title, description, and expiry date." });
    return;
  }
  const startsAt = parsed.data.startsAt?.trim() || null;
  const expiresAt = parsed.data.expiresAt.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || (startsAt && !/^\d{4}-\d{2}-\d{2}$/.test(startsAt))) {
    res.status(400).json({ error: "Dates must use the format YYYY-MM-DD." });
    return;
  }
  if (startsAt && startsAt > expiresAt) {
    res.status(400).json({ error: "The start date must be before the expiry date." });
    return;
  }

  const [post] = await db.insert(communityPostsTable).values({
    cityId,
    neighborhood: parsed.data.neighborhood?.trim() || null,
    type: parsed.data.type,
    title: parsed.data.title.trim(),
    body: parsed.data.body.trim(),
    startsAt,
    expiresAt,
    authorId: auth.userId,
    status: "pending",
  }).returning();

  req.log.info({ postId: post.id, cityId: post.cityId, type: post.type }, "Community post submitted for review");
  res.status(201).json({
    id: post.id,
    status: post.status,
    message: "Your post was submitted for review.",
  });
});

router.get("/community-posts/moderation", requireEditor, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  if (!["pending", "approved", "rejected", "all"].includes(status)) {
    res.status(400).json({ error: "Invalid moderation status." });
    return;
  }

  const posts = await db
    .select()
    .from(communityPostsTable)
    .where(status === "all" ? undefined : eq(communityPostsTable.status, status))
    .orderBy(desc(communityPostsTable.createdAt))
    .limit(200);
  const participation = await getParticipationSummaries(posts.map((post) => post.id));
  res.json(posts.map((post) => publicPost(post, participation.get(post.id))));
});

router.patch("/community-posts/moderation/:id", requireEditor, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = DecideCommunityPostBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid moderation decision." });
    return;
  }

  const auth = getAuth(req);
  const [post] = await db
    .update(communityPostsTable)
    .set({
      status: parsed.data.decision === "approve" ? "approved" : "rejected",
      reviewNote: parsed.data.reviewNote ?? null,
      reviewedAt: new Date(),
      reviewedBy: auth.userId,
      updatedAt: new Date(),
    })
    .where(eq(communityPostsTable.id, id))
    .returning();

  if (!post) {
    res.status(404).json({ error: "Community post not found." });
    return;
  }
  req.log.info({ postId: id, decision: parsed.data.decision }, "Community post moderation decision");
  const participation = await getParticipationSummaries([post.id]);
  res.json(publicPost(post, participation.get(post.id)));
});

router.put("/community-posts/:id/participation", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to show your interest." });
    return;
  }

  const params = ToggleCommunityPostParticipationParams.safeParse(req.params);
  const parsed = ToggleCommunityPostParticipationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a valid participation action." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [post] = await tx
      .select({ id: communityPostsTable.id, type: communityPostsTable.type })
      .from(communityPostsTable)
      .where(
        and(
          eq(communityPostsTable.id, params.data.id),
          eq(communityPostsTable.status, "approved"),
          gte(communityPostsTable.expiresAt, activeDate()),
        ),
      )
      .limit(1)
      .for("update");

    if (!post) return { kind: "not-found" } as const;
    if (parsed.data.action === "attending" && post.type !== "event") {
      return { kind: "invalid-action" } as const;
    }

    if (parsed.data.active) {
      await tx
        .insert(communityPostParticipationTable)
        .values({
          postId: post.id,
          userId: auth.userId,
          action: parsed.data.action,
        })
        .onConflictDoNothing({
          target: [
            communityPostParticipationTable.postId,
            communityPostParticipationTable.userId,
            communityPostParticipationTable.action,
          ],
        });
    } else {
      await tx
        .delete(communityPostParticipationTable)
        .where(
          and(
            eq(communityPostParticipationTable.postId, post.id),
            eq(communityPostParticipationTable.userId, auth.userId),
            eq(communityPostParticipationTable.action, parsed.data.action),
          ),
        );
    }
    return { kind: "updated", postId: post.id } as const;
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Approved active community post not found." });
    return;
  }
  if (result.kind === "invalid-action") {
    res.status(400).json({ error: "Attendance is available only for event posts." });
    return;
  }

  const participation = await getParticipationSummaries([result.postId], auth.userId);
  const summary = participation.get(result.postId) ?? emptyParticipation;
  req.log.info(
    { postId: result.postId, action: parsed.data.action, active: parsed.data.active },
    "Community post participation updated",
  );
  res.json({
    postId: result.postId,
    action: parsed.data.action,
    active: parsed.data.active,
    ...summary,
  });
});

export default router;