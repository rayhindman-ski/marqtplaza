import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveGeography, parseAddress, validateBusinessFactsForDraft, validateBusinessFactsForSubmit } from "./businessFacts";

const facts = {
  name: "Nieuwe Zaak",
  category: "Retail & Shopping",
  subcategory: null,
  neighborhood: "Bezuidenhout",
  address: "Laan van NOI 12, 2593 BN Den Haag",
  websiteUrl: null,
  phone: "070 123 4567",
};

describe("business facts (BPROF-003/004)", () => {
  it("parses Dutch postcodes and house numbers from free-text addresses", () => {
    assert.deepEqual(parseAddress("Laan van NOI 12, 2593 BN Den Haag"), { postcode: "2593BN", houseNumber: "12" });
    assert.deepEqual(parseAddress("Prinsegracht 4a 2512ex"), { postcode: "2512EX", houseNumber: "4" });
    assert.deepEqual(parseAddress("Ergens zonder postcode 3"), { postcode: null, houseNumber: "3" });
    assert.deepEqual(parseAddress(null), { postcode: null, houseNumber: null });
  });

  it("only refuses impossible values on a draft but requires the release facts at submit", () => {
    assert.deepEqual(validateBusinessFactsForDraft({ ...facts, address: null, phone: null }), []);
    assert.deepEqual(validateBusinessFactsForDraft({ ...facts, category: "Onbekend" }), [{ field: "business.category", code: "invalid" }]);
    assert.deepEqual(validateBusinessFactsForDraft({ ...facts, category: "Food & Drink", subcategory: "sushi" }), [{ field: "business.subcategory", code: "invalid" }]);
    assert.deepEqual(validateBusinessFactsForSubmit(facts), []);
    assert.deepEqual(validateBusinessFactsForSubmit({ ...facts, address: null }), [{ field: "business.address", code: "required" }]);
    assert.deepEqual(validateBusinessFactsForSubmit({ ...facts, address: "Zonder postcode 1" }), [{ field: "business.address", code: "postcode_required" }]);
    assert.deepEqual(validateBusinessFactsForSubmit({ ...facts, phone: null }), [{ field: "business.phone", code: "phone_or_website_required" }]);
    assert.deepEqual(validateBusinessFactsForSubmit({ ...facts, phone: null, websiteUrl: "https://nieuwezaak.nl" }), []);
    assert.deepEqual(validateBusinessFactsForSubmit({ ...facts, category: "Food & Drink" }), [{ field: "business.subcategory", code: "required" }]);
  });

  it("derives the neighbourhood from stored listings at the address and never trusts a declared one over it", async () => {
    // Bezuidenhout coordinates from a listing at the same postcode outrank the declared Centrum.
    const derived = await deriveGeography(facts.address, "Centrum", async () => [{ lat: 52.0838, lng: 4.3283, neighborhood: null }]);
    assert.equal(derived.basis, "address_match");
    assert.equal(derived.neighborhood, "Bezuidenhout");
    assert.equal(typeof derived.latitude, "number");

    const declared = await deriveGeography(facts.address, "Bezuidenhout", async () => []);
    assert.deepEqual(declared, { neighborhood: "Bezuidenhout", latitude: null, longitude: null, basis: "declared_official" });

    const unknown = await deriveGeography(facts.address, "Atlantis", async () => { throw new Error("store down"); });
    assert.equal(unknown.basis, "unresolved");
  });
});
