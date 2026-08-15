import { Router } from "express";
import { db } from "@workspace/db";
import { captureResultsTable } from "@workspace/db/schema";

const captureRouter = Router();

// ── POST /capture/search ─────────────────────────────────────────────────────
captureRouter.post("/search", async (req, res) => {
  const { url, businessName, zipCode, neighbourhood } = req.body as {
    url?: string;
    businessName?: string;
    zipCode?: string;
    neighbourhood?: string;
  };

  // Build mock results keyed to inputs
  const query = [businessName, neighbourhood, zipCode, url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const seed: Array<{ id: string; name: string; zipCode: string; address: string }> = [
    { id: "b1", name: "De Kade Roastery",         zipCode: "1011 AB", address: "Keizersgracht 20, Amsterdam" },
    { id: "b2", name: "Maas Design Studio",        zipCode: "3011 CD", address: "Wijnhaven 70, Rotterdam" },
    { id: "b3", name: "Strijp-S Tech Lab",         zipCode: "5611 AE", address: "Torenallee 4, Eindhoven" },
    { id: "b4", name: "Domstad Books",             zipCode: "3511 BJ", address: "Choorstraat 12, Utrecht" },
    { id: "b5", name: "Hofvijver Antiques",        zipCode: "2511 EA", address: "Plein 29, Den Haag" },
    { id: "b6", name: "Boutique Lokaal",           zipCode: "1012 XZ", address: "Jordaan 5, Amsterdam" },
    { id: "b7", name: "Kop van Zuid Roasters",     zipCode: "3072 AN", address: "Wilhelminaplein 1, Rotterdam" },
    { id: "b8", name: "Kanaalzicht Cafe",          zipCode: "3512 HK", address: "Wittevrouwensingel 7, Utrecht" },
    { id: "b9", name: "Klokgebouw Coffee",         zipCode: "5617 AB", address: "Klokgebouw 40, Eindhoven" },
    { id: "b10", name: "Zeezicht Fish",            zipCode: "2586 JK", address: "Scheveningen Strand 2, Den Haag" },
  ];

  const results = query
    ? seed.filter(
        (b) =>
          b.name.toLowerCase().includes(query) ||
          b.zipCode.replace(/\s/g, "").includes(query.replace(/\s/g, "")) ||
          b.address.toLowerCase().includes(query),
      )
    : seed;

  res.json({ businesses: results.length > 0 ? results : seed.slice(0, 4) });
});

// ── POST /capture/scan ───────────────────────────────────────────────────────
captureRouter.post("/scan", async (req, res) => {
  const { businessId, name } = req.body as {
    businessId?: string;
    name?: string;
    url?: string;
  };

  const label = name ?? businessId ?? "Business";

  const results = [
    {
      type: "event",
      title: `${label} — Zomermarkt 2026`,
      sourceUrl: "https://example.nl/events/zomermarkt",
      publishedAt: "2026-08-20",
    },
    {
      type: "news",
      title: `${label} opent nieuwe locatie in de binnenstad`,
      sourceUrl: "https://example.nl/nieuws/opening",
      publishedAt: "2026-08-10",
    },
    {
      type: "ad",
      title: `${label} — 20% korting dit weekend`,
      sourceUrl: "https://example.nl/aanbiedingen/weekend",
      publishedAt: "2026-08-15",
    },
    {
      type: "event",
      title: `${label} — Proeverij & netwerkevent`,
      sourceUrl: "https://example.nl/events/proeverij",
      publishedAt: "2026-09-05",
    },
    {
      type: "news",
      title: `${label} wint lokale ondernemersprijs`,
      sourceUrl: "https://example.nl/nieuws/prijs",
      publishedAt: "2026-07-28",
    },
  ];

  res.json({ results });
});

// ── POST /capture/persist ────────────────────────────────────────────────────
captureRouter.post("/persist", async (req, res) => {
  const { results, businessName, businessUrl, zipCode } = req.body as {
    results: Array<{
      type: string;
      title: string;
      sourceUrl?: string;
      publishedAt?: string;
    }>;
    businessName?: string;
    businessUrl?: string;
    zipCode?: string;
  };

  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ error: "No results provided" });
    return;
  }

  const rows = results.map((r) => ({
    businessName: businessName ?? "Unknown",
    businessUrl: businessUrl ?? null,
    zipCode: zipCode ?? null,
    resultType: r.type,
    title: r.title,
    sourceUrl: r.sourceUrl ?? null,
    publishedAt: r.publishedAt ?? null,
    rawJson: JSON.stringify(r),
  }));

  await db.insert(captureResultsTable).values(rows);

  res.json({ saved: rows.length });
});

export default captureRouter;
