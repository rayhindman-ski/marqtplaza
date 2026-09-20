import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_ERROR_STATUS, buildApiError, unknownFieldErrors } from "./apiError";
import { readFeatureFlags } from "./featureFlags";
import {
  assertNotSelfReview,
  deriveCapabilities,
  deriveRole,
  emailVerifiedFromClaims,
  identityFromClaims,
  isEditor,
  SelfReviewError,
} from "./permissions";

const offFlags = { accounts: false, businessIntake: false, businessPublication: false };
const onFlags = { accounts: true, businessIntake: true, businessPublication: true };

describe("feature flags", () => {
  it("default to off and only accept explicit truthy values", () => {
    assert.deepEqual(readFeatureFlags({}), offFlags);
    assert.deepEqual(
      readFeatureFlags({ ACCOUNTS_ENABLED: "true", BUSINESS_INTAKE_ENABLED: "0", BUSINESS_PUBLICATION_ENABLED: "yes" }),
      { accounts: true, businessIntake: false, businessPublication: true },
    );
    assert.equal(readFeatureFlags({ ACCOUNTS_ENABLED: "enabled" }).accounts, false);
  });

  it("are independent of each other", () => {
    const flags = readFeatureFlags({ BUSINESS_PUBLICATION_ENABLED: "1" });
    assert.equal(flags.accounts, false);
    assert.equal(flags.businessIntake, false);
    assert.equal(flags.businessPublication, true);
  });
});

describe("api errors", () => {
  it("map every code to a status and a stable message key", () => {
    const error = buildApiError("VERSION_CONFLICT", "corr-1", { expectedVersion: 4 });
    assert.deepEqual(error, {
      code: "VERSION_CONFLICT",
      messageKey: "errors.version_conflict",
      correlationId: "corr-1",
      expectedVersion: 4,
    });
    assert.equal(API_ERROR_STATUS.VERSION_CONFLICT, 409);
    assert.equal(API_ERROR_STATUS.FEATURE_DISABLED, 404);
    assert.equal(API_ERROR_STATUS.AUTH_REQUIRED, 401);
  });

  it("report client-submitted fields that an operation does not accept", () => {
    assert.deepEqual(unknownFieldErrors({ role: "admin", locale: "nl" }, new Set(["locale"])), [
      { field: "role", code: "unknown" },
    ]);
    assert.deepEqual(unknownFieldErrors(undefined, new Set()), []);
    assert.deepEqual(unknownFieldErrors([1, 2], new Set()), []);
  });
});

describe("trusted identity", () => {
  it("derives the editor role only from trusted claim locations", () => {
    assert.equal(isEditor({ metadata: { role: "editor" } }), true);
    assert.equal(isEditor({ public_metadata: { role: "Admin" } }), true);
    assert.equal(isEditor({ role: "editor" }), true);
    assert.equal(isEditor({ role: "user" }), false);
    assert.equal(isEditor({ unsafe_metadata: { role: "admin" } }), false);
    assert.equal(isEditor(undefined), false);
  });

  it("treats a session as verified unless the provider says otherwise", () => {
    assert.equal(emailVerifiedFromClaims({}), true);
    assert.equal(emailVerifiedFromClaims({ email_verified: false }), false);
    assert.equal(emailVerifiedFromClaims({ email_verified: "false" }), false);
    assert.equal(emailVerifiedFromClaims({ emailVerified: true }), true);
  });

  it("derives roles and capabilities server-side and honours gates", () => {
    const identity = identityFromClaims("user_1", { email_verified: true });
    const base = { identity, user: { status: "active" as const }, businessMembershipCount: 0, flags: offFlags };

    assert.equal(deriveRole(base), "user");
    assert.equal(deriveRole({ ...base, businessMembershipCount: 2 }), "business_member");
    assert.equal(deriveRole({ ...base, identity: { ...identity, isEditor: true } }), "reviewer");
    assert.equal(deriveRole({ ...base, identity: { ...identity, emailVerified: false } }), "unverified");

    const gatedOff = deriveCapabilities(base);
    assert.equal(gatedOff.canClaimBusiness, false);
    assert.equal(gatedOff.canPublishBusiness, false);

    const gatedOn = deriveCapabilities({ ...base, flags: onFlags });
    assert.equal(gatedOn.canClaimBusiness, true);
    assert.equal(gatedOn.canPublishBusiness, false);
    assert.equal(gatedOn.canReview, false);

    const editor = deriveCapabilities({ ...base, flags: onFlags, identity: { ...identity, isEditor: true } });
    assert.equal(editor.canPublishBusiness, true);
    assert.equal(editor.canReview, true);

    const suspended = deriveCapabilities({ ...base, flags: onFlags, user: { status: "suspended" } });
    assert.equal(suspended.canClaimBusiness, false);

    const unverified = deriveCapabilities({ ...base, flags: onFlags, identity: { ...identity, emailVerified: false } });
    assert.equal(unverified.canClaimBusiness, false);
  });

  it("refuses self-review", () => {
    assert.throws(() => assertNotSelfReview("user_1", ["user_2", "user_1"]), SelfReviewError);
    assert.doesNotThrow(() => assertNotSelfReview("user_1", ["user_2", null, undefined]));
  });
});
