import { eq } from "drizzle-orm";
import { appUsersTable, db } from "@workspace/db";
import type { Request, Response } from "express";

import { sendApiError } from "./apiError";

export type AccountAccess =
  | { kind: "active"; userId: string }
  | { kind: "unauthenticated" }
  | { kind: "suspended"; userId: string }
  | { kind: "deleted"; userId: string };

/**
 * Terminal application account states apply to every authenticated
 * account-owned surface, not only the `/account` routes. A user whose
 * application account is suspended or deleted may still hold a valid Clerk
 * session (credentials are managed separately), so legacy routes that
 * authorise from the Clerk subject must consult this before serving or
 * mutating retained data such as saved events or business memberships.
 *
 * Users without an application row are treated as active: the row is
 * provisioned lazily when the accounts feature is used.
 */
export async function resolveAccountAccess(userId: string | null | undefined): Promise<AccountAccess> {
  if (!userId) return { kind: "unauthenticated" };
  const [row] = await db
    .select({ status: appUsersTable.status })
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, userId))
    .limit(1);
  if (row?.status === "deleted") return { kind: "deleted", userId };
  if (row?.status === "suspended") return { kind: "suspended", userId };
  return { kind: "active", userId };
}

/**
 * Resolve the caller for a legacy account-owned route, answering 401/403 and
 * returning null when the request must not proceed.
 */
export async function requireActiveAccount(
  req: Request,
  res: Response,
  resolveUserId: (req: Request) => string | null | undefined,
): Promise<string | null> {
  const access = await resolveAccountAccess(resolveUserId(req));
  switch (access.kind) {
    case "active":
      return access.userId;
    case "unauthenticated":
      res.status(401).json({ error: "Authentication is required." });
      return null;
    case "suspended":
      sendApiError(req, res, "ACCOUNT_SUSPENDED");
      return null;
    case "deleted":
      sendApiError(req, res, "ACCOUNT_DELETED");
      return null;
  }
}
