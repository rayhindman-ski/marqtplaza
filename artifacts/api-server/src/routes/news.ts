import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, newsArticlesTable, newsSourceStatusesTable } from "@workspace/db";
import {
  GetNewsArticleParams,
  GetNewsArticleResponse,
  GetNewsQueryParams,
  GetNewsResponse,
  GetNewsSourceStatusesResponse,
  ScanNewsSourcesBody,
  ScanNewsSourcesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

export type NewsSource = { id: string; name: string; newsUrl: string; requiresHaagEvidence?: boolean; requiresPublishedDate?: boolean };
type NewsSubcategory = "city" | "politics" | "safety" | "culture" | "sport" | "business" | "community";
type Candidate = { title: string; canonicalUrl: string; summary: string; subcategory: NewsSubcategory; publishedAt: string | null };
type CrawlResult = {
  sourceId: string; sourceName: string; scannedUrl: string; status: "found" | "partial" | "no_articles" | "blocked" | "error";
  articlesCaptured: number; articlesPublished: number; articlesUpdated: number; articlesRejected: number;
  pagesRead: number; pagesFailed: number; crawlLimitReached: boolean; message: string;
};

const NEWS_SOURCES: NewsSource[] = [
  { id: "omroep-west", name: "Omroep West", newsUrl: "https://www.omroepwest.nl" },
  { id: "ad-den-haag", name: "AD Den Haag", newsUrl: "https://www.ad.nl/den-haag/", requiresHaagEvidence: true },
  { id: "regio15", name: "Regio15", newsUrl: "https://regio15.nl" },
  { id: "den-haag-fm", name: "Den Haag FM", newsUrl: "https://www.denhaagfm.nl" },
  { id: "indebuurt-den-haag", name: "Indebuurt Den Haag", newsUrl: "https://indebuurt.nl/denhaag/" },
  { id: "gemeente-den-haag", name: "Gemeente Den Haag", newsUrl: "https://www.denhaag.nl/nl" },
  { id: "den-haag-centraal", name: "Den Haag Centraal", newsUrl: "https://www.denhaagcentraal.net" },
  { id: "rodi", name: "RODI", newsUrl: "https://www.rodi.nl", requiresHaagEvidence: true },
  { id: "haags-dagblad", name: "Haags Dagblad", newsUrl: "https://www.haagsdagblad.nl" },
  { id: "den-haag-com-news", name: "DenHaag.com", newsUrl: "https://denhaag.com/en" },
  { id: "district8", name: "District8", newsUrl: "https://district8.net" },
  { id: "070online", name: "070online", newsUrl: "https://www.070online.nl" },
  { id: "hart-voor-den-haag", name: "Hart voor Den Haag", newsUrl: "https://hartvoordenhaag.nl" },
  { id: "den-haag-nieuws", name: "Den Haag Nieuws", newsUrl: "https://www.denhaagnieuws.nl" },
  { id: "dagblad070", name: "Dagblad070", newsUrl: "https://dagblad070.nl" },
  { id: "dnhc", name: "DNHC", newsUrl: "https://www.dnhc.nl" },
  { id: "den-haag-krant", name: "Den Haag Krant", newsUrl: "https://www.denhaagkrant.nl" },
  { id: "dagblad-den-haag", name: "Dagblad Den Haag", newsUrl: "https://www.dagbladdenhaag.nl" },
  { id: "dvhn", name: "Dagblad van het Noorden", newsUrl: "https://www.dvhn.nl", requiresHaagEvidence: true },
  { id: "haagmedia", name: "Haagmedia", newsUrl: "https://www.haagmedia.nl" },
  { id: "den-haag-onderneemt", name: "Den Haag Onderneemt", newsUrl: "https://www.denhaagonderneemt.nl/nieuws", requiresPublishedDate: true },
  { id: "den-haag-nieuwsbord", name: "Den Haag Nieuwsboard", newsUrl: "https://www.denhaagnieuwsbord.nl" },
  { id: "ads-den-haag", name: "ADS Den Haag", newsUrl: "https://www.ads-denhaag.nl" },
];
const SOURCE_BY_ID = new Map(NEWS_SOURCES.map((source) => [source.id, source]));
const SUBCATEGORIES: NewsSubcategory[] = ["city", "politics", "safety", "culture", "sport", "business", "community"];
const CRAWLER_USER_AGENT = "marqtplaza.com/1.0";
const MAX_DETAILS_PER_SOURCE = 8;
const MAX_RESPONSE_CHARS = 500_000;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;
const HAGUE_TERMS = /\b(den haag|haag(se|s)?|scheveningen|lo[oe]sd(u|e)inen|voorburg|leidschendam|yppenburg)\b/i;
const RETRY_INTERVALS_MS: Record<"blocked" | "error", number> = {
  blocked: 6 * 60 * 60 * 1000,
  error: 2 * 60 * 60 * 1000,
};
const NEWS_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
const MAX_SCHEDULED_SOURCES_PER_RUN = 3;
const NEWS_RETRY_LEASE_MS = 15 * 60 * 1000;
let activeScans = 0;
let schedulerTimer: NodeJS.Timeout | undefined;

function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|nbsp);/g, " ").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}

function canonicalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_") || ["fbclid", "gclid", "ref"].includes(key)) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return null; }
}

function isApproved(url: string, source: NewsSource): boolean {
  try { return new URL(url).origin === new URL(source.newsUrl).origin; } catch { return false; }
}

function robotsAllows(robots: string, target: string): boolean {
  const lines = robots.split(/\r?\n/);
  let applies = false;
  const rules: Array<{ path: string; allow: boolean }> = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*/, "").trim();
    const pair = line.match(/^([^:]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2].trim();
    if (key === "user-agent") { applies = value === "*" || CRAWLER_USER_AGENT.toLowerCase().startsWith(value.toLowerCase()); continue; }
    if (applies && (key === "allow" || key === "disallow") && value) rules.push({ path: value, allow: key === "allow" });
  }
  const path = new URL(target).pathname;
  const match = rules.filter((rule) => path.startsWith(rule.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return match?.allow ?? true;
}

async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    output += decoder.decode(chunk.value, { stream: true });
    if (output.length > MAX_RESPONSE_CHARS) { await reader.cancel(); throw new Error("response_limit"); }
  }
  return output + decoder.decode();
}

async function fetchPage(url: string, source: NewsSource, robots: string | null): Promise<{ html: string; url: string } | { error: "blocked" | "failed" }> {
  let current = canonicalizeUrl(url, source.newsUrl);
  if (!current || !isApproved(current, source) || (robots !== null && !robotsAllows(robots, current))) return { error: "blocked" };
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    try {
      const response = await fetch(current, { redirect: "manual", headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = canonicalizeUrl(response.headers.get("location") ?? "", current);
        if (!next || !isApproved(next, source) || !robotsAllows(robots ?? "", next)) return { error: "blocked" };
        current = next; continue;
      }
      if (!response.ok) return { error: response.status === 401 || response.status === 403 || response.status === 429 ? "blocked" : "failed" };
      const type = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) return { error: "failed" };
      return { html: await readBody(response), url: current };
    } catch { return { error: "failed" }; }
  }
  return { error: "failed" };
}

function pageTitle(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    ?? html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const value = match ? cleanText(match[1]) : "";
  return value.length >= 8 && value.length <= 220 ? value : null;
}

function pageDate(html: string): string | null {
  const candidates = [
    ...html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|date|publishdate)["'][^>]*content=["']([^"']+)["']/gi),
    ...html.matchAll(/<time\b[^>]*datetime=["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  for (const value of candidates) {
    const iso = value.match(/\b(20\d{2}-\d{2}-\d{2})/);
    if (iso) return iso[1];
  }
  return null;
}

function articleText(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html;
  const paragraphs = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => cleanText(match[1])).filter((value) => value.length > 35);
  const meta = html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i)?.[1];
  return [meta ? cleanText(meta) : "", ...paragraphs].filter(Boolean).join(" ");
}

function summarise(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 32) return null;
  const chosen = words.slice(0, 50).join(" ");
  return /[.!?…]$/.test(chosen) ? chosen : `${chosen}…`;
}

function classify(text: string): NewsSubcategory {
  if (/(gemeente|raad|wethouder|politiek|verkiez|beleid|minister)/i.test(text)) return "politics";
  if (/(politie|brandweer|ongeval|aanhouding|misdaad|veilig|brand|ambulance)/i.test(text)) return "safety";
  if (/(museum|kunst|theater|muziek|festival|cultuur|tentoonstelling)/i.test(text)) return "culture";
  if (/(sport|ado|voetbal|wedstrijd|hockey|atleet)/i.test(text)) return "sport";
  if (/(bedrijf|ondernem|winkel|horeca|economie|werkgelegen)/i.test(text)) return "business";
  if (/(buurt|bewoner|school|vrijwillig|vereniging|wijk|initiatief)/i.test(text)) return "community";
  return "city";
}

function isPublishedNewsArticle(title: string, text: string, source: NewsSource): boolean {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedSource = source.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalizedTitle === normalizedSource || normalizedTitle.length < 16) return false;
  if (!HAGUE_TERMS.test(`${title} ${text}`)) return false;
  return !/\b(bedrijven in den haag|nieuws uit den haag|find out all about|ethische afwegingen|zorg en gezondheid|privacybeleid|vacature)\b/i.test(title);
}

function articleLinks(html: string, pageUrl: string, source: NewsSource): string[] {
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = canonicalizeUrl(match[1], pageUrl);
    const title = cleanText(match[2]);
    if (!url || !isApproved(url, source) || title.length < 18 || title.length > 220) continue;
    if (/\/(?:tag|tags|author|zoeken|search|privacy|contact|over-ons|advertentie)(?:\/|$)/i.test(new URL(url).pathname)) continue;
    seen.add(url);
    if (seen.size >= MAX_DETAILS_PER_SOURCE) break;
  }
  return [...seen];
}

export async function scanSource(source: NewsSource, database: typeof db = db): Promise<CrawlResult> {
  const metrics = { articlesCaptured: 0, articlesPublished: 0, articlesUpdated: 0, articlesRejected: 0, pagesRead: 0, pagesFailed: 0, crawlLimitReached: false };
  const origin = new URL(source.newsUrl).origin;
  let robots = "";
  try {
    const response = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": CRAWLER_USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) { robots = await readBody(response); metrics.pagesRead += 1; }
  } catch { /* A missing robots file permits the origin's configured entry page. */ }
  if (!robotsAllows(robots, source.newsUrl)) return { ...metrics, sourceId: source.id, sourceName: source.name, scannedUrl: source.newsUrl, status: "blocked", message: "robots.txt does not allow this crawler to read the configured news page." };
  const index = await fetchPage(source.newsUrl, source, robots);
  if ("error" in index) return { ...metrics, pagesFailed: metrics.pagesFailed + 1, sourceId: source.id, sourceName: source.name, scannedUrl: source.newsUrl, status: index.error === "blocked" ? "blocked" : "error", message: index.error === "blocked" ? "The source denied automated access." : "The configured news page could not be read." };
  metrics.pagesRead += 1;
  const links = articleLinks(index.html, index.url, source);
  if (links.length >= MAX_DETAILS_PER_SOURCE) metrics.crawlLimitReached = true;
  const details = await Promise.all(links.map((url) => fetchPage(url, source, robots)));
  const candidates: Candidate[] = [];
  for (const page of details) {
    if ("error" in page) { metrics.pagesFailed += 1; continue; }
    metrics.pagesRead += 1;
    const title = pageTitle(page.html);
    const text = articleText(page.html);
    const summary = summarise(text);
    const publishedAt = pageDate(page.html);
    if (!title || !summary || !isPublishedNewsArticle(title, text, source) || (source.requiresPublishedDate && !publishedAt) || (source.requiresHaagEvidence && !HAGUE_TERMS.test(`${title} ${text}`))) { metrics.articlesRejected += 1; continue; }
    candidates.push({ title, canonicalUrl: page.url, summary, subcategory: classify(`${title} ${text}`), publishedAt });
  }
  metrics.articlesCaptured = candidates.length;
  if (candidates.length > 0) {
    const urls = candidates.map((article) => article.canonicalUrl);
    const existing = new Set((await database.select({ canonicalUrl: newsArticlesTable.canonicalUrl }).from(newsArticlesTable).where(inArray(newsArticlesTable.canonicalUrl, urls))).map((row) => row.canonicalUrl));
    const now = new Date();
    for (const article of candidates) {
      await database.insert(newsArticlesTable).values({ sourceId: source.id, sourceName: source.name, canonicalUrl: article.canonicalUrl, title: article.title, summary: article.summary, category: "news", subcategory: article.subcategory, publishedAt: article.publishedAt, lastSeenAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: newsArticlesTable.canonicalUrl, set: { title: article.title, summary: article.summary, subcategory: article.subcategory, publishedAt: article.publishedAt, lastSeenAt: now, updatedAt: now } });
      if (existing.has(article.canonicalUrl)) metrics.articlesUpdated += 1; else metrics.articlesPublished += 1;
    }
  }
  const status = candidates.length ? (metrics.pagesFailed || metrics.crawlLimitReached ? "partial" : "found") : metrics.pagesFailed ? "error" : "no_articles";
  return { ...metrics, sourceId: source.id, sourceName: source.name, scannedUrl: source.newsUrl, status, message: `${metrics.articlesCaptured} article${metrics.articlesCaptured === 1 ? "" : "s"} captured; ${metrics.articlesPublished} published, ${metrics.articlesUpdated} updated and ${metrics.articlesRejected} rejected.` };
}

function nextRetryAt(status: CrawlResult["status"], scannedAt: Date): Date | null {
  if (status !== "blocked" && status !== "error") return null;
  return new Date(scannedAt.getTime() + RETRY_INTERVALS_MS[status]);
}

async function recordSourceScan(
  source: NewsSource,
  result: CrawlResult,
  database: typeof db = db,
  scannedAt = new Date(),
): Promise<void> {
  await database.insert(newsSourceStatusesTable).values({
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.newsUrl,
    status: result.status,
    lastScannedAt: scannedAt,
    nextScanAt: nextRetryAt(result.status, scannedAt),
    retryLeaseUntil: null,
    message: result.message,
    articlesCaptured: result.articlesCaptured,
    articlesPublished: result.articlesPublished,
    articlesUpdated: result.articlesUpdated,
    pagesFailed: result.pagesFailed,
  }).onConflictDoUpdate({
    target: newsSourceStatusesTable.sourceId,
    set: {
      sourceName: source.name,
      sourceUrl: source.newsUrl,
      status: result.status,
      lastScannedAt: scannedAt,
      nextScanAt: nextRetryAt(result.status, scannedAt),
      retryLeaseUntil: null,
      message: result.message,
      articlesCaptured: result.articlesCaptured,
      articlesPublished: result.articlesPublished,
      articlesUpdated: result.articlesUpdated,
      pagesFailed: result.pagesFailed,
    },
  });
}

async function scanAndRecordSource(
  source: NewsSource,
  database: typeof db = db,
  scannedAt = new Date(),
): Promise<CrawlResult> {
  const result = await scanSource(source, database);
  await recordSourceScan(source, result, database, scannedAt);
  return result;
}

export async function ensureNewsSourceStatusStorage(database: typeof db = db): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS news_source_statuses (
      source_id text PRIMARY KEY,
      source_name text NOT NULL,
      source_url text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      last_scanned_at timestamptz,
      next_scan_at timestamptz,
      retry_lease_until timestamptz,
      message text,
      articles_captured integer NOT NULL DEFAULT 0,
      articles_published integer NOT NULL DEFAULT 0,
      articles_updated integer NOT NULL DEFAULT 0,
      pages_failed integer NOT NULL DEFAULT 0
    )
  `);
  await database.execute(sql`
    ALTER TABLE news_source_statuses
    ADD COLUMN IF NOT EXISTS retry_lease_until timestamptz
  `);
}

async function claimDueNewsSourceIds(
  database: typeof db = db,
  now = new Date(),
): Promise<string[]> {
  const retryLeaseUntil = new Date(now.getTime() + NEWS_RETRY_LEASE_MS);
  const result = await database.execute<{ sourceId: string }>(sql`
    WITH due AS (
      SELECT source_id
      FROM news_source_statuses
      WHERE status IN ('blocked', 'error')
        AND next_scan_at <= ${now}
        AND (retry_lease_until IS NULL OR retry_lease_until < ${now})
      ORDER BY next_scan_at ASC
      LIMIT ${MAX_SCHEDULED_SOURCES_PER_RUN}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE news_source_statuses
    SET retry_lease_until = ${retryLeaseUntil}
    FROM due
    WHERE news_source_statuses.source_id = due.source_id
    RETURNING news_source_statuses.source_id AS "sourceId"
  `);
  return result.rows.map((row) => row.sourceId);
}

export async function runScheduledNewsScans(
  database: typeof db = db,
  now = new Date(),
): Promise<CrawlResult[]> {
  if (activeScans >= 1) return [];
  const dueSourceIds = await claimDueNewsSourceIds(database, now);
  const sources = dueSourceIds
    .map((sourceId) => SOURCE_BY_ID.get(sourceId))
    .filter((source): source is NewsSource => Boolean(source));
  if (sources.length === 0) return [];

  activeScans += 1;
  try {
    return await Promise.all(sources.map((source) => scanAndRecordSource(source, database, now)));
  } finally {
    activeScans -= 1;
  }
}

export function startNewsSourceScheduler(database: typeof db = db): void {
  if (schedulerTimer) return;
  const run = () => {
    void runScheduledNewsScans(database).catch((error: unknown) => {
      console.error("Scheduled news-source retry failed.", error);
    });
  };
  run();
  schedulerTimer = setInterval(run, NEWS_SCHEDULER_INTERVAL_MS);
}

router.get("/news", async (req, res): Promise<void> => {
  const parsed = GetNewsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const articles = await db.select().from(newsArticlesTable)
    .where(parsed.data.subcategory ? eq(newsArticlesTable.subcategory, parsed.data.subcategory) : undefined)
    .orderBy(desc(newsArticlesTable.publishedAt), desc(newsArticlesTable.lastSeenAt))
    .limit(100);
  res.json(GetNewsResponse.parse({ articles: articles.map((article) => ({ id: article.id, title: article.title, summary: article.summary, sourceName: article.sourceName, sourceUrl: article.canonicalUrl, subcategory: article.subcategory, publishedAt: article.publishedAt })), availableSubcategories: SUBCATEGORIES }));
});

router.get("/news/sources/status", async (_req, res): Promise<void> => {
  const storedStatuses = await db.select().from(newsSourceStatusesTable);
  const bySourceId = new Map(storedStatuses.map((status) => [status.sourceId, status]));
  res.json(GetNewsSourceStatusesResponse.parse({
    sources: NEWS_SOURCES.map((source) => {
      const status = bySourceId.get(source.id);
      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.newsUrl,
        status: status?.status ?? "pending",
        lastScannedAt: status?.lastScannedAt?.toISOString() ?? null,
        nextScanAt: status?.nextScanAt?.toISOString() ?? null,
        message: status?.message ?? null,
        articlesCaptured: status?.articlesCaptured ?? 0,
        articlesPublished: status?.articlesPublished ?? 0,
        articlesUpdated: status?.articlesUpdated ?? 0,
        pagesFailed: status?.pagesFailed ?? 0,
      };
    }),
  }));
});

router.get("/news/:id", async (req, res): Promise<void> => {
  const parsed = GetNewsArticleParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [article] = await db.select().from(newsArticlesTable).where(eq(newsArticlesTable.id, parsed.data.id));
  if (!article) { res.status(404).json({ error: "News article not found" }); return; }
  res.json(GetNewsArticleResponse.parse({ id: article.id, title: article.title, summary: article.summary, sourceName: article.sourceName, sourceUrl: article.canonicalUrl, subcategory: article.subcategory, publishedAt: article.publishedAt }));
});

router.post("/news/scan", async (req, res): Promise<void> => {
  const parsed = ScanNewsSourcesBody.safeParse(req.body);
  if (!parsed.success || new Set(parsed.data.sourceIds).size !== parsed.data.sourceIds.length) { res.status(400).json({ scannedAt: new Date().toISOString(), scans: [], error: "Choose unique approved news sources." }); return; }
  const sources = parsed.data.sourceIds.map((id) => SOURCE_BY_ID.get(id));
  if (sources.some((source) => !source)) { res.status(400).json({ scannedAt: new Date().toISOString(), scans: [], error: "One or more sources are not approved." }); return; }
  if (activeScans >= 1) { res.status(429).json({ scannedAt: new Date().toISOString(), scans: [], error: "The news scanner is busy. Please wait for the current scan to finish." }); return; }
  activeScans += 1;
  try {
    const scans: CrawlResult[] = [];
    for (let index = 0; index < sources.length; index += 3) scans.push(...await Promise.all(sources.slice(index, index + 3).map((source) => scanAndRecordSource(source!))));
    res.json(ScanNewsSourcesResponse.parse({ scannedAt: new Date().toISOString(), scans }));
  } finally { activeScans -= 1; }
});

export default router;

export const newsTesting = {
  canonicalizeUrl,
  claimDueNewsSourceIds,
  isPublishedNewsArticle,
  nextRetryAt,
  sources: NEWS_SOURCES,
};