import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { eq, sql } from "drizzle-orm";
import { db, socialMapReviewReportsTable } from "@workspace/db";
import {
  SOCIAL_MAP_LISTINGS,
  SOCIAL_MAP_SNAPSHOT_DATE,
  type SocialMapListing,
} from "./social-map-listings.js";

export const SOCIAL_MAP_REVIEW_INTERVAL_DAYS = 30;
const REVIEW_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REVIEW_CONCURRENCY = 6;
const REVIEW_USER_AGENT = "buurtplaza-social-map-review/1.0";
const REVIEW_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FAILED_REVIEW_RETRY_DAYS = 1;
const REVIEW_LEASE_MS = 10 * 60 * 1000;
const REVIEW_REPORT_KEY = "current";

export type SocialMapReviewStatus = "verified" | "review_due" | "changed" | "unavailable";
export type SocialMapSourceStatus = "available" | "redirected" | "unavailable" | "address_mismatch";
export type SocialMapSourceKind = "official_url" | "source_page_url";

export type SocialMapSourceCheck = {
  listingId: string;
  kind: SocialMapSourceKind;
  url: string;
  status: SocialMapSourceStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  checkedAt: string;
  message?: string;
};

export type SocialMapReviewItem = {
  id: string;
  name: string;
  address: string;
  officialUrl: string;
  sourcePageUrl: string;
  status: SocialMapReviewStatus;
  sourceStatus: SocialMapSourceStatus;
  reason: string | null;
  lastCheckedAt: string;
  nextReviewAt: string;
};

export type SocialMapReviewReport = {
  snapshotDate: string;
  lastRunAt: string | null;
  successful: boolean;
  intervalDays: number;
  items: SocialMapReviewItem[];
  checks: SocialMapSourceCheck[];
  message: string;
};

let reviewInProgress = false;
let schedulerTimer: NodeJS.Timeout | undefined;
let schedulerStarted = false;

const INITIAL_REVIEW_ATTEMPT_AT = "2026-08-24T00:00:00.000Z";
const INITIAL_REVIEW_WORK: Readonly<Record<string, {
  status: Extract<SocialMapReviewStatus, "changed">;
  sourceStatus: Extract<SocialMapSourceStatus, "redirected" | "address_mismatch">;
  reason: string;
}>> = {
  "social-taalhuis-den-haag": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2511 CB, not the published 2511 BT.",
  },
  "social-kompassie": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2560 PX, not the published 2512 GN.",
  },
  "social-de-mussen": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2526 CM, not the published 2526 BN.",
  },
  "social-pep-den-haag": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2512 GM, not the published 2513 AM.",
  },
  "social-haags-ontmoeten-trefpunt": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2583 JH, not the published 2583 JN.",
  },
  "social-haags-ontmoeten-mallemok": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2583 EH, not the published 2583 EK.",
  },
  "social-mantelzorg-den-haag": {
    status: "changed",
    sourceStatus: "redirected",
    reason: "The official service link redirects and needs an editor to confirm its new destination.",
  },
  "social-kessler-perspektief": {
    status: "changed",
    sourceStatus: "address_mismatch",
    reason: "The official page lists 2560 PX, not the published 2518 GR.",
  },
};

function parseDate(value: string): Date {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizedAddress(value: string): string {
  return value.toUpperCase().replace(/\s/g, "");
}

function statusForChecks(
  listing: SocialMapListing,
  checks: SocialMapSourceCheck[],
  now: Date,
  lastCheckedAt: string,
): Pick<SocialMapReviewItem, "status" | "sourceStatus" | "reason"> {
  const listingChecks = checks.filter((check) => check.listingId === listing.id);
  const unavailable = listingChecks.find((check) => check.status === "unavailable");
  if (unavailable) {
    return {
      status: "unavailable",
      sourceStatus: "unavailable",
      reason: unavailable.message ?? `${unavailable.kind} is unavailable`,
    };
  }

  const addressMismatch = listingChecks.find((check) => check.status === "address_mismatch");
  if (addressMismatch) {
    return {
      status: "changed",
      sourceStatus: "address_mismatch",
      reason: addressMismatch.message ?? "The published address needs a manual check",
    };
  }

  const redirected = listingChecks.find((check) => check.status === "redirected");
  if (redirected) {
    return {
      status: "changed",
      sourceStatus: "redirected",
      reason: `${redirected.kind} redirects to a different address`,
    };
  }

  const nextReviewAt = parseDate(addDays(lastCheckedAt, SOCIAL_MAP_REVIEW_INTERVAL_DAYS));
  if (now >= nextReviewAt) {
    return {
      status: "review_due",
      sourceStatus: "available",
      reason: "The scheduled review date has passed",
    };
  }

  return {
    status: "verified",
    sourceStatus: "available",
    reason: null,
  };
}

function reportItem(
  listing: SocialMapListing,
  checks: SocialMapSourceCheck[],
  now: Date,
  lastCheckedAt: string,
  knownWork?: (typeof INITIAL_REVIEW_WORK)[string],
): SocialMapReviewItem {
  if (knownWork) {
    return {
      id: listing.id,
      name: listing.name,
      address: listing.address,
      officialUrl: listing.officialUrl,
      sourcePageUrl: listing.sourcePageUrl,
      ...knownWork,
      lastCheckedAt,
      nextReviewAt: lastCheckedAt.slice(0, 10),
    };
  }
  const status = statusForChecks(listing, checks, now, lastCheckedAt);
  return {
    id: listing.id,
    name: listing.name,
    address: listing.address,
    officialUrl: listing.officialUrl,
    sourcePageUrl: listing.sourcePageUrl,
    ...status,
    lastCheckedAt,
    nextReviewAt: addDays(lastCheckedAt, SOCIAL_MAP_REVIEW_INTERVAL_DAYS),
  };
}

function initialReviewReport(now: Date): SocialMapReviewReport {
  const checks: SocialMapSourceCheck[] = [];
  const lastCheckedAt = INITIAL_REVIEW_ATTEMPT_AT;
  const hasReviewWork = Object.keys(INITIAL_REVIEW_WORK).length > 0;
  return {
    snapshotDate: SOCIAL_MAP_SNAPSHOT_DATE,
    lastRunAt: INITIAL_REVIEW_ATTEMPT_AT,
    successful: !hasReviewWork,
    intervalDays: SOCIAL_MAP_REVIEW_INTERVAL_DAYS,
    items: SOCIAL_MAP_LISTINGS.map((listing) => reportItem(
      listing,
      checks,
      now,
      lastCheckedAt,
      INITIAL_REVIEW_WORK[listing.id],
    )),
    checks,
    message: hasReviewWork
      ? "The latest source run found records that need editorial review. The public snapshot remains unchanged."
      : "No new source run has been recorded; records are due for review on their scheduled date.",
  };
}

function readCappedBody(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";

  return (async () => {
    try {
      while (bytesRead < MAX_RESPONSE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = MAX_RESPONSE_BYTES - bytesRead;
        const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
        bytesRead += chunk.byteLength;
        body += decoder.decode(chunk, { stream: bytesRead < MAX_RESPONSE_BYTES });
        if (chunk.byteLength < value.byteLength) break;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return body;
  })();
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
      || normalized.startsWith("::ffff:127.")
      || normalized.startsWith("::ffff:10.")
      || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

async function safeReviewUrl(value: string): Promise<{ url: string } | { error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "The source URL is invalid" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "Only HTTPS source URLs are allowed" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { error: "Local source URLs are not allowed" };
  }
  try {
    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      return { error: "The source resolves to a private network address" };
    }
  } catch {
    return { error: "The source hostname could not be resolved safely" };
  }
  return { url: parsed.href };
}

async function checkSource(
  listing: SocialMapListing,
  kind: SocialMapSourceKind,
  url: string,
  checkedAt: string,
): Promise<SocialMapSourceCheck> {
  let currentUrl = url;

  try {
    const safeUrl = await safeReviewUrl(currentUrl);
    if ("error" in safeUrl) {
      return {
        listingId: listing.id,
        kind,
        url,
        status: "unavailable",
        httpStatus: null,
        finalUrl: currentUrl,
        checkedAt,
        message: safeUrl.error,
      };
    }
    currentUrl = safeUrl.url;
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": REVIEW_USER_AGENT },
      signal: AbortSignal.timeout(REVIEW_REQUEST_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      let finalUrl: string | null = null;
      try {
        finalUrl = location ? new URL(location, currentUrl).href : currentUrl;
      } catch {
        finalUrl = currentUrl;
      }
      return {
        listingId: listing.id,
        kind,
        url,
        status: "redirected",
        httpStatus: response.status,
        finalUrl,
        checkedAt,
        message: "The redirect target was recorded for editorial review and was not followed",
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      return {
        listingId: listing.id,
        kind,
        url,
        status: "unavailable",
        httpStatus: response.status,
        finalUrl: currentUrl,
        checkedAt,
        message: response.ok
          ? "The source did not return an HTML page"
          : `The source returned HTTP ${response.status}`,
      };
    }

    const body = (await readCappedBody(response)).toUpperCase();
    const expectedPostcode = normalizedAddress(listing.address).match(/\d{4}[A-Z]{2}/)?.[0];
    const publishedPostcodes = body.match(/\b25\d{2}\s?[A-Z]{2}\b/g)
      ?.map(normalizedAddress) ?? [];
    if (
      kind === "official_url"
      && expectedPostcode
      && publishedPostcodes.length > 0
      && !publishedPostcodes.includes(expectedPostcode)
    ) {
      return {
        listingId: listing.id,
        kind,
        url,
        status: "address_mismatch",
        httpStatus: response.status,
        finalUrl: currentUrl,
        checkedAt,
        message: `The official page lists ${publishedPostcodes[0]}, not ${expectedPostcode}`,
      };
    }

    return {
      listingId: listing.id,
      kind,
      url,
      status: "available",
      httpStatus: response.status,
      finalUrl: currentUrl,
      checkedAt,
    };
  } catch (error) {
    return {
      listingId: listing.id,
      kind,
      url,
      status: "unavailable",
      httpStatus: null,
      finalUrl: currentUrl,
      checkedAt,
      message: error instanceof Error ? error.message : "The source request failed",
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function ensureSocialMapReviewStorage(
  database: typeof db = db,
  now = new Date(),
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS social_map_review_reports (
      report_key text PRIMARY KEY,
      report jsonb NOT NULL,
      review_lease_until timestamptz
    )
  `);
  await database.insert(socialMapReviewReportsTable).values({
    reportKey: REVIEW_REPORT_KEY,
    report: initialReviewReport(now),
  }).onConflictDoNothing();
}

export async function getSocialMapReviewReport(
  now = new Date(),
  database: typeof db = db,
): Promise<SocialMapReviewReport> {
  await ensureSocialMapReviewStorage(database, now);
  const [stored] = await database.select().from(socialMapReviewReportsTable)
    .where(eq(socialMapReviewReportsTable.reportKey, REVIEW_REPORT_KEY))
    .limit(1);
  return (stored?.report as SocialMapReviewReport | undefined) ?? initialReviewReport(now);
}

async function claimReviewLease(database: typeof db, now: Date): Promise<boolean> {
  const leaseUntil = new Date(now.getTime() + REVIEW_LEASE_MS);
  const claimed = await database.execute(sql`
    UPDATE social_map_review_reports
    SET review_lease_until = ${leaseUntil}
    WHERE report_key = ${REVIEW_REPORT_KEY}
      AND (review_lease_until IS NULL OR review_lease_until < ${now})
    RETURNING report_key
  `);
  return claimed.rows.length === 1;
}

async function saveReviewReport(database: typeof db, report: SocialMapReviewReport): Promise<void> {
  await database.insert(socialMapReviewReportsTable).values({
    reportKey: REVIEW_REPORT_KEY,
    report,
    reviewLeaseUntil: null,
  }).onConflictDoUpdate({
    target: socialMapReviewReportsTable.reportKey,
    set: { report, reviewLeaseUntil: null },
  });
}

export async function runSocialMapReview(
  now = new Date(),
  database: typeof db = db,
): Promise<SocialMapReviewReport> {
  if (reviewInProgress) {
    throw new Error("A social-map source review is already in progress");
  }
  await ensureSocialMapReviewStorage(database, now);
  if (!await claimReviewLease(database, now)) {
    throw new Error("A social-map source review is already in progress");
  }
  reviewInProgress = true;
  try {
    const previousReport = await getSocialMapReviewReport(now, database);
    const checkedAt = now.toISOString();
    const sources = SOCIAL_MAP_LISTINGS.flatMap((listing) => [
      { listing, kind: "official_url" as const, url: listing.officialUrl },
      { listing, kind: "source_page_url" as const, url: listing.sourcePageUrl },
    ]);
    const checks = await mapWithConcurrency(
      sources,
      REVIEW_CONCURRENCY,
      ({ listing, kind, url }) => checkSource(listing, kind, url, checkedAt),
    );
    const successful = checks.every((check) => check.status === "available");
    const items = SOCIAL_MAP_LISTINGS.map((listing) => {
      return reportItem(listing, checks, now, checkedAt);
    });
    const snapshotDate = successful
      ? checkedAt.slice(0, 10)
      : previousReport.snapshotDate;
    const report: SocialMapReviewReport = {
      snapshotDate,
      lastRunAt: checkedAt,
      successful,
      intervalDays: SOCIAL_MAP_REVIEW_INTERVAL_DAYS,
      items,
      checks,
      message: successful
        ? `All ${checks.length} source pages passed. The public snapshot is now ${snapshotDate}.`
        : `${checks.filter((check) => check.status !== "available").length} source checks need editorial review. The public snapshot remains ${snapshotDate}.`,
    };
    await saveReviewReport(database, report);
    return report;
  } finally {
    reviewInProgress = false;
  }
}

export function isSocialMapReviewInProgress(): boolean {
  return reviewInProgress;
}

function reviewIsDue(report: SocialMapReviewReport, now: Date): boolean {
  if (!report.lastRunAt) return true;
  const retryDays = report.successful
    ? SOCIAL_MAP_REVIEW_INTERVAL_DAYS
    : FAILED_REVIEW_RETRY_DAYS;
  return now >= parseDate(addDays(report.lastRunAt, retryDays));
}

export function startSocialMapReviewScheduler(database: typeof db = db): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const run = async () => {
    try {
      const report = await getSocialMapReviewReport(new Date(), database);
      if (reviewIsDue(report, new Date())) {
        await runSocialMapReview(new Date(), database);
      }
    } catch (error) {
      console.error("Scheduled social-map source review failed.", error);
    } finally {
      schedulerTimer = setTimeout(() => { void run(); }, REVIEW_SCHEDULER_INTERVAL_MS);
    }
  };
  void run();
}