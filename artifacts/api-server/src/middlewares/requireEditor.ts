import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

import { isEditor, roleFromClaims } from "../lib/permissions";

function editorRole(req: Request): string | null {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  return roleFromClaims(auth.sessionClaims) ?? "";
}

export function requireEditor(req: Request, res: Response, next: NextFunction): void {
  const role = editorRole(req);
  if (role === null) {
    res.status(401).json({ error: "Authentication is required to review event candidates." });
    return;
  }
  if (!isEditor(getAuth(req).sessionClaims)) {
    res.status(403).json({ error: "An editor role is required to review event candidates." });
    return;
  }
  next();
}
