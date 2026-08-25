import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { db } from "@workspace/db";
import { communityPostsTable, type CommunityPost } from "@workspace/db/schema";
import {
  CreateCommunityPostBody,
  DecideCommunityPostBody,
  GetCommunityPostsQueryParams,
} from "@workspace/api-zod";
import { requireEditor } from "../middlewares/requireEditor.js";

const router: IRouter = Router();

const supportedCities = new Set(["ams", "rot", "utr", "dhg", "ein"]);

function activeDate() {
  return new Date().toISOString().slice(0, 10);
}

function publicPost(post: CommunityPost) {
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
  res.json(posts.map(publicPost));
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
  res.json(posts.map(publicPost));
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
  res.json(publicPost(post));
});

export default router;