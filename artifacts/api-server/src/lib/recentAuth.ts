import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

/** A new verified Clerk session is the only provider proof exposed in session claims. */
export const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;
export type RecentAuthOptions = {
  now?: () => number;
  claims?: (request: Request) => unknown;
};

export function isRecentAuthentication(claims: unknown, now = Date.now()): boolean {
  if (!claims || typeof claims !== "object") return false;
  const issuedAt = (claims as { iat?: unknown }).iat;
  return typeof issuedAt === "number" && Number.isFinite(issuedAt)
    && issuedAt * 1000 <= now && now - issuedAt * 1000 <= RECENT_AUTH_WINDOW_MS;
}

export function requireRecentAuth(options: RecentAuthOptions = {}): RequestHandler {
  return (req, res, next) => {
    if (isRecentAuthentication((options.claims ?? ((request) => getAuth(request).sessionClaims))(req), (options.now ?? Date.now)())) {
      next();
      return;
    }
    res.status(401).json({ error: "recent_authentication_required", code: "RECENT_AUTH_REQUIRED" });
  };
}