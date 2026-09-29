import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

export const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;
export type SessionLoader = (sid: string) => Promise<{ createdAt: number | string | Date } | null>;
export type RecentAuthOptions = {
  now?: () => number;
  claims?: (request: Request) => unknown;
  loadSession?: SessionLoader;
};

/** fva is minutes since factor verification, not token issuance. -1 means unverified. */
export function isRecentAuthentication(claims: unknown, now = Date.now()): boolean {
  if (!claims || typeof claims !== "object") return false;
  const fva = (claims as { fva?: unknown }).fva;
  if (!Array.isArray(fva) || typeof fva[0] !== "number") return false;
  const minutes = fva[0];
  return Number.isFinite(minutes) && minutes >= 0 && minutes * 60_000 <= RECENT_AUTH_WINDOW_MS;
}

export function isRecentSession(createdAt: unknown, now: number): boolean {
  const time = createdAt instanceof Date ? createdAt.getTime()
    : typeof createdAt === "string" ? Date.parse(createdAt) : createdAt;
  return typeof time === "number" && Number.isFinite(time) && time <= now && now - time <= RECENT_AUTH_WINDOW_MS;
}

export function requireRecentAuth(options: RecentAuthOptions = {}): RequestHandler {
  const loadSession = options.loadSession ?? ((sid: string) => clerkClient.sessions.getSession(sid));
  return (req, res, next) => {
    void (async () => {
      const claims = (options.claims ?? ((request: Request) => getAuth(request).sessionClaims))(req);
      const current = (options.now ?? Date.now)();
      const fva = claims && typeof claims === "object" ? (claims as { fva?: unknown }).fva : undefined;
      if (fva !== undefined && isRecentAuthentication(claims, current)) { next(); return; }
      if (fva === undefined) {
        const sid = claims && typeof claims === "object" ? (claims as { sid?: unknown }).sid : undefined;
        if (typeof sid === "string" && sid.length > 0) {
          try {
            const session = await loadSession(sid);
            if (isRecentSession(session?.createdAt, current)) { next(); return; }
          } catch {
            // A missing/unavailable provider session cannot prove recent authentication.
          }
        }
      }
      res.status(401).json({ error: "recent_authentication_required", code: "RECENT_AUTH_REQUIRED" });
    })().catch(next);
  };
}