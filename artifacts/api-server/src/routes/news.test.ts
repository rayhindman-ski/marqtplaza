import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { newsArticlesTable } from "@workspace/db";
import { newsTesting, scanSource, type NewsSource } from "./news";

type StoredArticle = {
  canonicalUrl: string;
  title: string;
  summary: string;
  subcategory: string;
};

type FakeNewsStore = {
  storedUrls: Set<string>;
  inserts: StoredArticle[];
  upsertTargets: unknown[];
  database: unknown;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function source(overrides: Partial<NewsSource> = {}): NewsSource {
  return {
    id: "test-source",
    name: "Test Den Haag Nieuws",
    newsUrl: "https://news.example.test/",
    ...overrides,
  };
}

function response(body: string, status = 200, contentType = "text/html; charset=utf-8"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function articlePage(title: string, text = "Dit is een uitgebreid nieuwsbericht over Den Haag met voldoende context voor bewoners en bezoekers. Het artikel beschrijft wat er vandaag in de stad gebeurt en waarom dit relevant is voor de lokale gemeenschap.") {
  return `<html><h1>${title}</h1><article><p>${text}</p></article></html>`;
}

function indexPage(links: Array<{ href: string; title: string }>) {
  return `<html>${links.map(({ href, title }) => `<a href="${href}">${title}</a>`).join("")}</html>`;
}

function fakeStore(existingUrls: string[] = []): FakeNewsStore {
  const storedUrls = new Set(existingUrls);
  const inserts: StoredArticle[] = [];
  const upsertTargets: unknown[] = [];
  const database = {
    select: () => ({
      from: () => ({
        where: async () => [...storedUrls].map((canonicalUrl) => ({ canonicalUrl })),
      }),
    }),
    insert: () => ({
      values: (article: StoredArticle) => ({
        onConflictDoUpdate: async (config: { target?: unknown }) => {
          upsertTargets.push(config.target);
          storedUrls.add(article.canonicalUrl);
          inserts.push(article);
        },
      }),
    }),
  };
  return { storedUrls, inserts, upsertTargets, database };
}

function installFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = async (input) => handler(String(input));
}

function allowRobots() {
  return "User-agent: *\nAllow: /";
}

describe("news crawler regressions", () => {
  it("canonicalizes tracking variants and only fetches a duplicate article once", async () => {
    assert.equal(
      newsTesting.canonicalizeUrl(
        "https://news.example.test/nieuws/stad/?utm_source=feed&ref=homepage#lees",
        "https://news.example.test/",
      ),
      "https://news.example.test/nieuws/stad",
    );

    const details = new Map<string, number>();
    const store = fakeStore();
    installFetch((url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/robots.txt") return response(allowRobots(), 200, "text/plain");
      if (parsed.pathname === "/") {
        return response(indexPage([
          { href: "/nieuws/stad/?utm_source=feed#first", title: "Wijknieuws Den Haag krijgt nieuwe aandacht" },
          { href: "/nieuws/stad?gclid=tracking", title: "Hetzelfde Wijknieuws Den Haag krijgt nieuwe aandacht" },
        ]));
      }
      details.set(parsed.pathname, (details.get(parsed.pathname) ?? 0) + 1);
      return response(articlePage("Wijknieuws Den Haag krijgt nieuwe aandacht"));
    });

    const result = await scanSource(source(), store.database as never);

    assert.equal(result.status, "found");
    assert.equal(result.articlesCaptured, 1);
    assert.equal(result.articlesPublished, 1);
    assert.equal(result.articlesUpdated, 0);
    assert.equal(details.get("/nieuws/stad"), 1);
    assert.deepEqual([...store.storedUrls], ["https://news.example.test/nieuws/stad"]);
    assert.equal(store.inserts.length, 1);
    assert.equal(store.inserts[0].canonicalUrl, "https://news.example.test/nieuws/stad");
    assert.equal(store.upsertTargets[0], newsArticlesTable.canonicalUrl);
  });

  it("reports a refreshed canonical article as updated on the next scan", async () => {
    const store = fakeStore();
    installFetch((url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/robots.txt") return response(allowRobots(), 200, "text/plain");
      if (pathname === "/") return response(indexPage([
        { href: "/nieuws/stad?utm_medium=email", title: "Wijknieuws Den Haag krijgt nieuwe aandacht" },
      ]));
      return response(articlePage("Wijknieuws Den Haag krijgt nieuwe aandacht"));
    });

    const first = await scanSource(source(), store.database as never);
    const second = await scanSource(source(), store.database as never);

    assert.equal(first.articlesPublished, 1);
    assert.equal(first.articlesUpdated, 0);
    assert.equal(second.articlesPublished, 0);
    assert.equal(second.articlesUpdated, 1);
    assert.equal(store.inserts.length, 2);
  });

  it("rejects source landing pages, vacancy pages, and articles without Den Haag evidence", async () => {
    const store = fakeStore();
    installFetch((url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/robots.txt") return response(allowRobots(), 200, "text/plain");
      if (pathname === "/") return response(indexPage([
        { href: "/landing", title: "Test Den Haag Nieuws" },
        { href: "/vacature", title: "Vacature communicatieadviseur Den Haag" },
        { href: "/rotterdam", title: "Rotterdam krijgt nieuw buurthuis voor bewoners" },
      ]));
      if (pathname === "/landing") return response(articlePage("Test Den Haag Nieuws"));
      if (pathname === "/vacature") return response(articlePage("Vacature communicatieadviseur Den Haag"));
      return response(articlePage(
        "Rotterdam krijgt nieuw buurthuis voor bewoners",
        "In Rotterdam opent binnenkort een nieuw buurthuis. Bewoners kunnen daar terecht voor activiteiten, hulp, ontmoeting en informatie over de wijk. De gemeente verwacht veel belangstelling.",
      ));
    });

    const result = await scanSource(source(), store.database as never);

    assert.equal(result.status, "no_articles");
    assert.equal(result.articlesCaptured, 0);
    assert.equal(result.articlesRejected, 3);
    assert.equal(store.inserts.length, 0);
  });

  it("reports blocked access when robots.txt disallows the configured page", async () => {
    const store = fakeStore();
    installFetch((url) => new URL(url).pathname === "/robots.txt"
      ? response("User-agent: *\nDisallow: /", 200, "text/plain")
      : response(indexPage([])));

    const result = await scanSource(source(), store.database as never);

    assert.equal(result.status, "blocked");
    assert.equal(result.pagesRead, 1);
    assert.equal(result.pagesFailed, 0);
  });

  it("reports error when the configured news page cannot be read", async () => {
    const store = fakeStore();
    installFetch((url) => new URL(url).pathname === "/robots.txt"
      ? response(allowRobots(), 200, "text/plain")
      : response("upstream unavailable", 500));

    const result = await scanSource(source(), store.database as never);

    assert.equal(result.status, "error");
    assert.equal(result.pagesRead, 1);
    assert.equal(result.pagesFailed, 1);
  });

  it("reports no_articles when the readable index contains no eligible article links", async () => {
    const store = fakeStore();
    installFetch((url) => new URL(url).pathname === "/robots.txt"
      ? response(allowRobots(), 200, "text/plain")
      : response(indexPage([{ href: "/about", title: "Over ons" }])));

    const result = await scanSource(source(), store.database as never);

    assert.equal(result.status, "no_articles");
    assert.equal(result.pagesRead, 2);
    assert.equal(result.pagesFailed, 0);
    assert.equal(result.articlesCaptured, 0);
  });

  it("reports partial when eligible articles coexist with failed detail pages", async () => {
    const store = fakeStore();
    installFetch((url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/robots.txt") return response(allowRobots(), 200, "text/plain");
      if (pathname === "/") return response(indexPage([
        { href: "/nieuws/goed", title: "Gemeente opent buurthuis in Den Haag" },
        { href: "/nieuws/mislukt", title: "Nog een nieuwsbericht uit Den Haag" },
      ]));
      if (pathname === "/nieuws/mislukt") return response("detail unavailable", 503);
      return response(articlePage("Gemeente opent buurthuis in Den Haag"));
    });

    const result = await scanSource(source(), store.database as never);

    assert.equal(result.status, "partial");
    assert.equal(result.articlesCaptured, 1);
    assert.equal(result.articlesPublished, 1);
    assert.equal(result.pagesFailed, 1);
  });
});