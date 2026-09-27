import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFeatureFlags } from "./featureFlags";

/** BOPS-001: the onboarding enrichment only opens together with its prerequisites. */
describe("readFeatureFlags", () => {
  it("keeps businessOnboarding closed unless accounts and businessIntake are on too", () => {
    const base = { ACCOUNTS_ENABLED: "1", BUSINESS_INTAKE_ENABLED: "1", BUSINESS_ONBOARDING_ENABLED: "1" };
    assert.equal(readFeatureFlags(base).businessOnboarding, true);
    assert.equal(readFeatureFlags({ ...base, ACCOUNTS_ENABLED: "0" }).businessOnboarding, false);
    assert.equal(readFeatureFlags({ ...base, BUSINESS_INTAKE_ENABLED: undefined }).businessOnboarding, false);
    assert.equal(readFeatureFlags({ ...base, BUSINESS_ONBOARDING_ENABLED: "false" }).businessOnboarding, false);
    // The prerequisite flags themselves are unaffected.
    assert.equal(readFeatureFlags({ ...base, BUSINESS_ONBOARDING_ENABLED: "0" }).businessIntake, true);
  });
});
