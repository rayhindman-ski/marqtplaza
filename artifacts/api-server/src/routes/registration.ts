import { getAuth } from "@clerk/express";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";

import { db, userRegistrationsTable, type UserRegistration } from "@workspace/db";
import {
  GetRegistrationResponse,
  SaveRegistrationBody,
  SaveRegistrationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type UserIdResolver = (req: Request) => string | null | undefined;

function currentUserId(
  req: Request,
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  resolveUserId: UserIdResolver,
) {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication is required." });
    return null;
  }
  return userId;
}

/** All three survey answers are present; the survey itself is only asked after ~14 days of use. */
export function isSurveyCompleted(
  registration: Pick<UserRegistration, "usefulnessRating" | "referralLikelihood" | "desiredFeatures">,
): boolean {
  return (
    registration.usefulnessRating !== null &&
    registration.referralLikelihood !== null &&
    registration.desiredFeatures !== null
  );
}

function serialiseRegistration(registration: UserRegistration) {
  return {
    name: registration.name,
    registrationType: registration.registrationType,
    email: registration.email,
    usefulnessRating: registration.usefulnessRating,
    referralLikelihood: registration.referralLikelihood,
    desiredFeatures: registration.desiredFeatures,
    surveyCompleted: isSurveyCompleted(registration),
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
  };
}

function response(registration: UserRegistration | undefined) {
  return {
    registered: Boolean(registration),
    canParticipate: Boolean(registration),
    registration: registration ? serialiseRegistration(registration) : null,
  };
}

export async function hasUserRegistration(userId: string): Promise<boolean> {
  const [registration] = await db
    .select({ id: userRegistrationsTable.id })
    .from(userRegistrationsTable)
    .where(eq(userRegistrationsTable.userId, userId))
    .limit(1);
  return Boolean(registration);
}

export function createRegistrationRouter(
  resolveUserId: UserIdResolver = (req) => getAuth(req).userId,
): IRouter {
  const router: IRouter = Router();

  router.get("/registration", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res, resolveUserId);
  if (!userId) return;

  const [registration] = await db
    .select()
    .from(userRegistrationsTable)
    .where(eq(userRegistrationsTable.userId, userId))
    .limit(1);

  res.json(GetRegistrationResponse.parse(response(registration)));
  });

  router.put("/registration", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res, resolveUserId);
  if (!userId) return;

  const parsed = SaveRegistrationBody.safeParse(req.body);
  const integerRatings = parsed.success
    && [parsed.data.usefulnessRating, parsed.data.referralLikelihood]
      .every((rating) => rating === undefined || rating === null || Number.isInteger(rating));
  if (!parsed.success || !integerRatings) {
    res.status(400).json({ error: "Please complete the registration fields." });
    return;
  }

  // Survey answers are optional (asked after ~14 days). A save that omits
  // them never erases answers already stored, so re-saving name or type from
  // the form does not wipe an earlier survey.
  const usefulnessRating = parsed.data.usefulnessRating ?? null;
  const referralLikelihood = parsed.data.referralLikelihood ?? null;
  const desiredFeatures = parsed.data.desiredFeatures?.trim() || null;

  const [registration] = await db
    .insert(userRegistrationsTable)
    .values({
      userId,
      name: parsed.data.name.trim(),
      registrationType: parsed.data.registrationType,
      email: parsed.data.email.trim().toLowerCase(),
      usefulnessRating,
      referralLikelihood,
      desiredFeatures,
    })
    .onConflictDoUpdate({
      target: userRegistrationsTable.userId,
      set: {
        name: parsed.data.name.trim(),
        registrationType: parsed.data.registrationType,
        email: parsed.data.email.trim().toLowerCase(),
        usefulnessRating: sql`coalesce(excluded.${sql.identifier("usefulness_rating")}, ${userRegistrationsTable.usefulnessRating})`,
        referralLikelihood: sql`coalesce(excluded.${sql.identifier("referral_likelihood")}, ${userRegistrationsTable.referralLikelihood})`,
        desiredFeatures: sql`coalesce(excluded.${sql.identifier("desired_features")}, ${userRegistrationsTable.desiredFeatures})`,
        updatedAt: new Date(),
      },
    })
    .returning();

  req.log?.info?.({ userId }, "User registration profile saved");
  res.json(SaveRegistrationResponse.parse(response(registration)));
  });

  return router;
}

export default createRegistrationRouter();