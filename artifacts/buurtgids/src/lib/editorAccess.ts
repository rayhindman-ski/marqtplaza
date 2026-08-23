import { useAuth } from "@clerk/react";

type RoleClaims = {
  metadata?: { role?: unknown };
  public_metadata?: { role?: unknown };
  role?: unknown;
};

export function hasEditorRole(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const roleClaims = claims as RoleClaims;
  const role = roleClaims.metadata?.role
    ?? roleClaims.public_metadata?.role
    ?? roleClaims.role;
  return typeof role === "string" && ["admin", "editor"].includes(role.toLowerCase());
}

export function useEditorAccess() {
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  return {
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    isEditor: hasEditorRole(sessionClaims),
  };
}