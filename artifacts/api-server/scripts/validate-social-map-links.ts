import { SOCIAL_MAP_LISTINGS } from "../src/lib/social-map-listings.js";

const urls = [...new Set(
  SOCIAL_MAP_LISTINGS.flatMap((listing) => [listing.officialUrl, listing.sourcePageUrl]),
)];

const results = await Promise.all(urls.map(async (url) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "marqtplaza-social-map-link-check/1.0" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    return {
      url,
      ok: response.ok && contentType.includes("text/html"),
      status: response.status,
      finalUrl: response.url,
      contentType,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      finalUrl: "",
      contentType: error instanceof Error ? error.message : String(error),
    };
  }
}));

const failures = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.status} ${result.url} -> ${result.finalUrl || result.contentType}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} social-map destination(s) failed validation.`);
  process.exit(1);
}

console.log(`\nValidated ${results.length} unique social-map destinations.`);