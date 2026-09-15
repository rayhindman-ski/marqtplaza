import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";

/**
 * Editor-role facade for the moderation workspaces.
 *
 * Production always derives the role from the Clerk session claims. In
 * development builds a Playwright run can opt in with `?e2eEditorAuth=1` and
 * drive the session through `window.__setEditorTestAuth`, mirroring the
 * account test hook, so the review screens can be exercised without a live
 * identity provider.
 */
type RoleClaims = {
  metadata?: { role?: unknown };
  public_metadata?: { role?: unknown };
  role?: unknown;
};

export type EditorTestAuth = { userId: string | null; role?: string | null };

declare global {
  interface Window {
    __editorTestAuth?: EditorTestAuth;
    __setEditorTestAuth?: (auth: EditorTestAuth) => void;
  }
}

const TEST_AUTH_EVENT = "buurtplaza:editor-test-auth";
export const EDITOR_TEST_AUTH_PARAM = "e2eEditorAuth";

// Once a development document opts in, client-side navigation must keep the
// test session even though the opt-in query parameter is not carried along.
let testAuthOptedIn = false;

export function isEditorTestAuthEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get(EDITOR_TEST_AUTH_PARAM) === "1") {
    testAuthOptedIn = true;
  }
  return testAuthOptedIn;
}

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
  const [testEnabled] = useState(isEditorTestAuthEnabled);
  const [testAuth, setTestAuth] = useState<EditorTestAuth | null>(() =>
    testEnabled ? (window.__editorTestAuth ?? { userId: null }) : null,
  );

  useEffect(() => {
    if (!testEnabled) return;
    const update = () => setTestAuth(window.__editorTestAuth ?? { userId: null });
    window.__setEditorTestAuth = (auth) => {
      window.__editorTestAuth = auth;
      window.dispatchEvent(new Event(TEST_AUTH_EVENT));
    };
    window.addEventListener(TEST_AUTH_EVENT, update);
    return () => {
      window.removeEventListener(TEST_AUTH_EVENT, update);
      delete window.__setEditorTestAuth;
    };
  }, [testEnabled]);

  if (testEnabled) {
    return {
      isLoaded: true,
      isSignedIn: Boolean(testAuth?.userId),
      isEditor: Boolean(testAuth?.userId) && hasEditorRole({ role: testAuth?.role }),
    };
  }

  return {
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    isEditor: hasEditorRole(sessionClaims),
  };
}
