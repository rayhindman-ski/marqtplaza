import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
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

function serialiseRegistration(registration: UserRegistration) {
  return {
    name: registration.name,
    registrationType: registration.registrationType,
    email: registration.email,
    usefulnessRating: registration.usefulnessRating,
    referralLikelihood: registration.referralLikelihood,
    desiredFeatures: registration.desiredFeatures,
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
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete all registration fields." });
    return;
  }

  const [registration] = await db
    .insert(userRegistrationsTable)
    .values({
      userId,
      name: parsed.data.name.trim(),
      registrationType: parsed.data.registrationType,
      email: parsed.data.email.trim().toLowerCase(),
      usefulnessRating: parsed.data.usefulnessRating,
      referralLikelihood: parsed.data.referralLikelihood,
      desiredFeatures: parsed.data.desiredFeatures.trim(),
    })
    .onConflictDoUpdate({
      target: userRegistrationsTable.userId,
      set: {
        name: parsed.data.name.trim(),
        registrationType: parsed.data.registrationType,
        email: parsed.data.email.trim().toLowerCase(),
        usefulnessRating: parsed.data.usefulnessRating,
        referralLikelihood: parsed.data.referralLikelihood,
        desiredFeatures: parsed.data.desiredFeatures.trim(),
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