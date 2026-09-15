import { eq } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { appUsersTable, db, type AppUser } from "@workspace/db";

import { sendApiError } from "../lib/apiError";
import { resolveClerkIdentity, type Identity, type IdentityResolver } from "../lib/permissions";

export type AccountContext = {
  identity: Identity;
  user: AppUser;
};

declare global {
  namespace Express {
    interface Request {
      account?: AccountContext;
    }
  }
}

export class ProvisioningError extends Error {
  constructor(cause: unknown) {
    super("Local account could not be provisioned.");
    this.name = "ProvisioningError";
    this.cause = cause;
  }
}

/**
 * Find or create the local account for a trusted provider subject.
 *
 * `INSERT … ON CONFLICT DO NOTHING` followed by a read makes concurrent first
 * requests converge on exactly one row (FR-002). No client-supplied value is
 * written; the row starts `active` with the default locale.
 */
export async function provisionAppUser(clerkUserId: string): Promise<AppUser> {
  try {
    await db
      .insert(appUsersTable)
      .values({ clerkUserId })
      .onConflictDoNothing({ target: appUsersTable.clerkUserId });
    const [user] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, clerkUserId))
      .limit(1);
    if (!user) throw new Error("Provisioned account row was not readable.");
    return user;
  } catch (error) {
    throw new ProvisioningError(error);
  }
}

export type RequireAppUserOptions = {
  resolveIdentity?: IdentityResolver;
  /** Refuse unverified identities with 403 EMAIL_UNVERIFIED. */
  requireVerified?: boolean;
};

/**
 * Attach `req.account` for a signed-in identity or answer with the standard
 * error shape: 401 unauthenticated, 403 suspended/deleted/unverified, 503 when
 * the local row cannot be provisioned. Everything downstream reads identity and
 * status from `req.account`, never from the request payload.
 */
export function requireAppUser(options: RequireAppUserOptions = {}): RequestHandler {
  const resolveIdentity = options.resolveIdentity ?? resolveClerkIdentity;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = resolveIdentity(req);
    if (!identity) {
      sendApiError(req, res, "AUTH_REQUIRED");
      return;
    }

    let user: AppUser;
    try {
      user = await provisionAppUser(identity.userId);
    } catch (error) {
      req.log?.error?.({ err: error, event: "account.provisioning_failed" }, "Account provisioning failed");
      sendApiError(req, res, "PROVISIONING_UNAVAILABLE");
      return;
    }

    if (user.status === "deleted") {
      sendApiError(req, res, "ACCOUNT_DELETED");
      return;
    }
    if (user.status === "suspended") {
      sendApiError(req, res, "ACCOUNT_SUSPENDED");
      return;
    }
    if (options.requireVerified && !identity.emailVerified) {
      sendApiError(req, res, "EMAIL_UNVERIFIED");
      return;
    }

    req.account = { identity, user };
    next();
  };
}
