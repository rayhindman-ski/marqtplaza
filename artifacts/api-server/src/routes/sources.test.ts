import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, pool } from "@workspace/db";

import {
  deduplicateSourceEvents,
  detectEventContentLanguage,
  ensureEventSourceStatusStorage,
  eventPriceEvidenceFromHtml,
  eventMetadata,
  parseVisibleEventPrice,
  nextSourceScanAt,
  sourcesTesting,
  sourceScanStatus,
  structuredEventsFromPage,
  structuredIndoorStatus,
  type SourceDefinition,
} from "./sources";

const source: SourceDefinition = {
  id: "test-events",
  name: "Test events",
  activityUrl: "https://events.example.test",
  sourceGroup: "city-agenda",
};

describe("source scan outcomes", () => {
  it("keeps verified events distinct from partial coverage", () => {
    assert.equal(sourceScanStatus({
      eventCount: 1,
      sourceDenied: false,
      pagesFailed: 0,
      crawlLimitReached: false,
    }), "found");
    assert.equal(sourceScanStatus({
      eventCount: 1,
      sourceDenied: false,
      pagesFailed: 1,
      crawlLimitReached: false,
    }), "partial");
  });

  it("does not collapse blocked or failed sources into an empty result", () => {
    assert.equal(sourceScanStatus({
      eventCount: 0,
      sourceDenied: true,
      pagesFailed: 0,
      crawlLimitReached: false,
    }), "blocked");
    assert.equal(sourceScanStatus({
      eventCount: 0,
      sourceDenied: false,
      pagesFailed: 1,
      crawlLimitReached: false,
    }), "error");
    assert.equal(sourceScanStatus({
      eventCount: 0,
      sourceDenied: false,
      pagesFailed: 0,
      crawlLimitReached: false,
    }), "no_events");
    assert.equal(sourceScanStatus({
      eventCount: 0,
      sourceDenied: false,
      pagesFailed: 0,
      crawlLimitReached: true,
    }), "partial");
  });

  it("uses a longer refresh cadence for checked sources and controlled retries for failures", () => {
    const scannedAt = new Date("2026-09-12T10:00:00.000Z");
    assert.equal(
      nextSourceScanAt("found", scannedAt).toISOString(),
      "2026-09-12T22:00:00.000Z",
    );
    assert.equal(
      nextSourceScanAt("partial", scannedAt).toISOString(),
      "2026-09-12T22:00:00.000Z",
    );
    assert.equal(
      nextSourceScanAt("blocked", scannedAt).toISOString(),
      "2026-09-12T16:00:00.000Z",
    );
    assert.equal(
      nextSourceScanAt("error", scannedAt).toISOString(),
      "2026-09-12T12:00:00.000Z",
    );
  });
});


describe("event price capture", () => {
  it("keeps a structured exact paid price", () => {
    const metadata = eventMetadata("Concert in Den Haag", source, {
      price: "12.50",
      priceCurrency: "EUR",
    });
    assert.equal(metadata.priceType, "paid");
    assert.equal(metadata.priceText, "€12,5");
  });

  it("keeps a structured price range", () => {
    const metadata = eventMetadata("Festival in Den Haag", source, {
      lowPrice: 10,
      highPrice: 25,
      priceCurrency: "EUR",
    });
    assert.equal(metadata.priceType, "paid");
    assert.equal(metadata.priceText, "€10–25");
  });

  it("combines compatible offer tiers and prefers them over prose", () => {
    const metadata = eventMetadata("Early bird was €5", source, [
      { price: 15, priceCurrency: "EUR" },
      { price: 30, priceCurrency: "EUR" },
    ]);
    assert.equal(metadata.priceType, "paid");
    assert.equal(metadata.priceText, "€15–30");
  });

  it("does not invent EUR when structured currency is absent or different", () => {
    assert.equal(
      eventMetadata("Ticketed event", source, { price: 12 }).priceText,
      "12",
    );
    assert.equal(
      eventMetadata("Ticketed event", source, { price: 0, priceCurrency: "USD" }).priceText,
      "USD 0",
    );
  });

  it("never merges missing or different currencies into one range", () => {
    assert.equal(
      eventMetadata("Ticketed event", source, [
        { price: 10, priceCurrency: "EUR" },
        { price: 20 },
      ]).priceText,
      "€10",
    );
    assert.equal(
      eventMetadata("Ticketed event", source, [
        { price: 10 },
        { price: 20, priceCurrency: "USD" },
        { price: 30, priceCurrency: "EUR" },
      ]).priceText,
      "USD 20",
    );
    assert.equal(
      eventMetadata("Ticketed event", source, [
        { price: 10, priceCurrency: "USD" },
        { price: 20, priceCurrency: "EUR" },
      ]).priceText,
      "USD 10",
    );
  });

  it("captures free, from-price, and textual ranges", () => {
    assert.deepEqual(
      eventMetadata("Gratis toegang", source).priceText,
      "Gratis",
    );
    assert.equal(
      eventMetadata("Kaarten vanaf € 7,50", source).priceText,
      "Vanaf €7,50",
    );
    assert.equal(
      eventMetadata("Tickets €10 - €20", source).priceText,
      "€10–20",
    );
  });

  it("does not infer indoor status from unstructured venue words", () => {
    assert.equal(
      "isIndoor" in eventMetadata("Workshop in een overdekte museumzaal", source),
      false,
    );
  });

  it("captures explicit structured indoor evidence without guessing from venue names", () => {
    assert.equal(
      structuredIndoorStatus({}, {
        "@type": "Place",
        amenityFeature: { name: "Indoor", value: true },
      }),
      true,
    );
    assert.equal(
      structuredIndoorStatus({}, {
        "@type": "Place",
        name: "Museumzaal",
      }),
      undefined,
    );
    assert.equal(
      structuredIndoorStatus({ isIndoor: false }, { "@type": "IndoorVenue" }),
      false,
    );
  });

  it("carries structured indoor status through JSON-LD event extraction", () => {
    const [event] = structuredEventsFromPage(`
      <script type="application/ld+json">
        {
          "@type": "Event",
          "name": "Indoor community workshop",
          "url": "https://events.example.test/workshop",
          "startDate": "2026-09-05T14:00:00+02:00",
          "location": {
            "@type": "Place",
            "name": "Community centre",
            "amenityFeature": {"name": "Indoor", "value": true}
          }
        }
      </script>
    `, "https://events.example.test/workshop", source);
    assert.equal(event?.isIndoor, true);

    const [unknown] = structuredEventsFromPage(`
      <script type="application/ld+json">
        {
          "@type": "Event",
          "name": "Museum activity",
          "url": "https://events.example.test/museum",
          "startDate": "2026-09-06",
          "location": {"@type": "Place", "name": "Museumzaal"}
        }
      </script>
    `, "https://events.example.test/museum", source);
    assert.equal(unknown?.isIndoor, undefined);
  });

  it("normalizes exact, from, one-symbol and two-symbol ranges", () => {
    assert.deepEqual(parseVisibleEventPrice("Prijs: € 12.50"), { priceType: "paid", priceText: "€12,50" });
    assert.deepEqual(parseVisibleEventPrice("from: €7,00"), { priceType: "paid", priceText: "From €7,00" });
    assert.equal(parseVisibleEventPrice("€60,00 — 165,00").priceText, "€60,00–165,00");
    assert.equal(parseVisibleEventPrice("€60.00 - €165.00").priceText, "€60,00–165,00");
    assert.deepEqual(parseVisibleEventPrice("Free admission"), { priceType: "free", priceText: "Free" });
  });

  it("extracts the workshop price without navigation or recommendations contaminating it", () => {
    const fixture = readFileSync(
      fileURLToPath(new URL("./fixtures/summer-writing-workshops.html", import.meta.url)),
      "utf8",
    );
    const evidence = eventPriceEvidenceFromHtml(fixture);
    assert.equal(parseVisibleEventPrice(evidence.dedicated ?? "").priceText, "€60,00–165,00");
    assert.doesNotMatch(evidence.bounded ?? "", /Another workshop|€5|€19\.50|Membership/);
  });

  it("does not scan prices outside bounded event content", () => {
    const evidence = eventPriceEvidenceFromHtml(`
      <nav>Tickets €9</nav>
      <main><article><h1>Event without a published price</h1></article></main>
      <aside class="recommended-events">Related event €4</aside>
      <footer>Support us for €20</footer>
    `);
    assert.deepEqual(parseVisibleEventPrice(evidence.bounded ?? ""), { priceType: "unknown" });
  });

  it("prefers paid tickets over incidental free extras in bounded content", () => {
    const evidence = eventPriceEvidenceFromHtml(`
      <main><article>
        <h1>Evening concert</h1>
        <p>Tickets €25. A free drink is included.</p>
      </article></main>
    `);
    assert.deepEqual(
      parseVisibleEventPrice(evidence.bounded ?? ""),
      { priceType: "paid", priceText: "€25" },
    );
  });

  it("prefers a dedicated paid amount over free ancillary wording", () => {
    const evidence = eventPriceEvidenceFromHtml(`
      <main><article>
        <h1>Evening concert</h1>
        <div class="event-price">€25 · free cloakroom</div>
      </article></main>
    `);
    assert.deepEqual(
      parseVisibleEventPrice(evidence.dedicated ?? ""),
      { priceType: "paid", priceText: "€25" },
    );
  });
});

describe("event language capture", () => {
  it("detects language paths before generic page metadata", () => {
    assert.equal(
      detectEventContentLanguage('<html lang="en">', "https://denhaag.com/de/kalender/bauernmarkt"),
      "de",
    );
    assert.equal(
      detectEventContentLanguage('<html lang="nl-NL">', "https://example.test/agenda"),
      "nl",
    );
  });

  it("keeps verified English and Dutch variants when deduplicating", () => {
    const [event] = deduplicateSourceEvents([
      {
        title: "Bauernmarkt",
        description: "Deutsche Beschreibung",
        url: "https://denhaag.com/de/kalender/bauernmarkt",
        sourceEventId: "market-1",
        sourceLanguage: "de",
      },
      {
        title: "Farmers' market",
        description: "Fresh produce from local market traders.",
        url: "https://denhaag.com/en/calendar/farmers-market",
        sourceEventId: "market-1",
        sourceLanguage: "en",
        titleEn: "Farmers' market",
        descriptionEn: "Fresh produce from local market traders.",
      },
      {
        title: "Boerenmarkt",
        description: "Verse producten van lokale marktkooplieden.",
        url: "https://denhaag.com/nl/agenda/boerenmarkt",
        sourceEventId: "market-1",
        sourceLanguage: "nl",
        titleNl: "Boerenmarkt",
        descriptionNl: "Verse producten van lokale marktkooplieden.",
      },
    ]);
    assert.equal(event.title, "Farmers' market");
    assert.equal(event.titleEn, "Farmers' market");
    assert.equal(event.titleNl, "Boerenmarkt");
  });

  it("keeps cancellation evidence from a non-preferred localized variant", () => {
    const [event] = deduplicateSourceEvents([
      {
        title: "Community concert",
        url: "https://events.example.test/en/concert",
        sourceEventId: "concert-1",
        sourceLanguage: "en",
        startsAt: "2026-09-10T20:00:00+02:00",
        venue: "Theater aan het Spui",
        isCancelled: false,
      },
      {
        title: "Buurtconcert",
        url: "https://events.example.test/nl/concert",
        sourceEventId: "concert-1",
        sourceLanguage: "nl",
        isCancelled: true,
      },
    ]);

    assert.equal(event.title, "Community concert");
    assert.equal(event.isCancelled, true);
  });
});

describe("event cancellation capture", () => {
  it("uses structured event status as authoritative cancellation evidence", () => {
    const [event] = structuredEventsFromPage(`
      <script type="application/ld+json">
        {
          "@type": "Event",
          "name": "Community concert",
          "url": "https://events.example.test/concert",
          "startDate": "2026-09-06T20:00:00+02:00",
          "eventStatus": "https://schema.org/EventCancelled"
        }
      </script>
    `, "https://events.example.test/concert", source);

    assert.equal(event?.isCancelled, true);
  });

  it("detects an explicit Dutch cancellation notice in event copy", () => {
    const [event] = structuredEventsFromPage(`
      <script type="application/ld+json">
        {
          "@type": "Event",
          "name": "Buurtmaaltijd",
          "url": "https://events.example.test/maaltijd",
          "startDate": "2026-09-07T18:00:00+02:00",
          "description": "Deze activiteit is afgelast."
        }
      </script>
    `, "https://events.example.test/maaltijd", source);

    assert.equal(event?.isCancelled, true);
  });

  it("does not mark an ordinary event as cancelled", () => {
    const [event] = structuredEventsFromPage(`
      <script type="application/ld+json">
        {
          "@type": "Event",
          "name": "Outdoor film",
          "url": "https://events.example.test/film",
          "startDate": "2026-09-08T20:00:00+02:00",
          "eventStatus": "https://schema.org/EventScheduled"
        }
      </script>
    `, "https://events.example.test/film", source);

    assert.equal(event?.isCancelled, false);
  });

  it("does not confuse a ticket cancellation policy with an event cancellation", () => {
    const [event] = structuredEventsFromPage(`
      <script type="application/ld+json">
        {
          "@type": "Event",
          "name": "Evening concert",
          "url": "https://events.example.test/evening-concert",
          "startDate": "2026-09-09T20:00:00+02:00",
          "description": "Ticket cancellation is available until 48 hours before the event."
        }
      </script>
    `, "https://events.example.test/evening-concert", source);

    assert.equal(event?.isCancelled, false);
  });
});

describe("event source status storage upgrades (database integration)", {
  skip: !process.env.EVENT_SOURCE_STATUS_INTEGRATION,
}, () => {
  it("adds scheduling columns without losing legacy status data and claims a due source", async () => {
    const sourceId = `event-source-upgrade-${process.pid}`;
    const lastScannedAt = new Date("2026-09-12T08:00:00.000Z");
    const now = new Date("2026-09-12T10:00:00.000Z");

    await pool.query("DROP TABLE IF EXISTS event_source_statuses");
    await pool.query(`
      CREATE TABLE event_source_statuses (
        source_id text PRIMARY KEY,
        source_name text NOT NULL,
        source_url text NOT NULL,
        source_group text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        last_scanned_at timestamptz,
        message text,
        events_captured integer NOT NULL DEFAULT 0,
        events_eligible integer NOT NULL DEFAULT 0,
        events_added integer NOT NULL DEFAULT 0,
        events_updated integer NOT NULL DEFAULT 0,
        pages_failed integer NOT NULL DEFAULT 0
      )
    `);
    await pool.query(
      `INSERT INTO event_source_statuses
        (source_id, source_name, source_url, source_group, status, last_scanned_at, message,
         events_captured, events_eligible, events_added, events_updated, pages_failed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        sourceId,
        "Legacy event source",
        "https://legacy-events.example.test/",
        "community",
        "pending",
        lastScannedAt,
        "legacy status data",
        8,
        6,
        5,
        4,
        1,
      ],
    );

    try {
      await ensureEventSourceStatusStorage(db);

      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'event_source_statuses'
           AND column_name IN ('next_scan_at', 'retry_lease_until')`,
      );
      assert.deepEqual(
        columns.rows.map((row) => row.column_name).sort(),
        ["next_scan_at", "retry_lease_until"],
      );

      const status = await pool.query<{
        source_name: string;
        source_url: string;
        source_group: string;
        status: string;
        last_scanned_at: Date;
        message: string;
        events_captured: number;
        events_eligible: number;
        events_added: number;
        events_updated: number;
        pages_failed: number;
        next_scan_at: Date | null;
      }>(
        `SELECT source_name, source_url, source_group, status, last_scanned_at, message,
                events_captured, events_eligible, events_added, events_updated, pages_failed,
                next_scan_at
         FROM event_source_statuses
         WHERE source_id = $1`,
        [sourceId],
      );
      assert.deepEqual(status.rows[0], {
        source_name: "Legacy event source",
        source_url: "https://legacy-events.example.test/",
        source_group: "community",
        status: "pending",
        last_scanned_at: lastScannedAt,
        message: "legacy status data",
        events_captured: 8,
        events_eligible: 6,
        events_added: 5,
        events_updated: 4,
        pages_failed: 1,
        next_scan_at: null,
      });

      // Startup also seeds approved sources. Keep this assertion focused on
      // the legacy row so the claim result is deterministic.
      await pool.query(
        "DELETE FROM event_source_statuses WHERE source_id <> $1",
        [sourceId],
      );

      assert.deepEqual(
        await sourcesTesting.claimDueEventSourceIds(db, now),
        [sourceId],
      );
      const lease = await pool.query<{ retry_lease_until: Date | null }>(
        "SELECT retry_lease_until FROM event_source_statuses WHERE source_id = $1",
        [sourceId],
      );
      assert.ok(lease.rows[0]?.retry_lease_until);
    } finally {
      await pool.query("DROP TABLE IF EXISTS event_source_statuses");
    }
  });
});