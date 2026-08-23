import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

type EditorClaims = {
  metadata?: { role?: unknown };
  public_metadata?: { role?: unknown };
  role?: unknown;
};

function editorRole(req: Request): string | null {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  const claims = auth.sessionClaims as EditorClaims | undefined;
  const role = claims?.metadata?.role ?? claims?.public_metadata?.role ?? claims?.role;
  return typeof role === "string" ? role.toLowerCase() : "";
}

export function requireEditor(req: Request, res: Response, next: NextFunction): void {
  const role = editorRole(req);
  if (role === null) {
    res.status(401).json({ error: "Authentication is required to review event candidates." });
    return;
  }
  if (role !== "admin" && role !== "editor") {
    res.status(403).json({ error: "An editor role is required to review event candidates." });
    return;
  }
  next();
}