import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool, userRegistrationsTable } from "@workspace/db";
import { createRegistrationRouter } from "./registration";

const userId = `registration-test-${process.pid}-${Date.now()}`;
const app = express();
app.use(express.json());
app.use(
  "/api",
  createRegistrationRouter((req) => req.header("x-test-user-id")),
);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const result = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-test-user-id": userId,
      ...init?.headers,
    },
  });
  return { status: result.status, body: await result.json() };
}

describe("registration route", () => {
  before(async () => {
    await db.delete(userRegistrationsTable).where(eq(userRegistrationsTable.userId, userId));
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await db.delete(userRegistrationsTable).where(eq(userRegistrationsTable.userId, userId));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
  });

  it("requires authentication and validates the registration payload", async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/registration`);
    assert.equal(unauthenticated.status, 401);

    const invalid = await request("/api/registration", {
      method: "PUT",
      body: JSON.stringify({ name: "Incomplete" }),
    });
    assert.equal(invalid.status, 400);
  });

  it("persists registration data and exposes participation access", async () => {
    const beforeSave = await request("/api/registration");
    assert.equal(beforeSave.status, 200);
    assert.deepEqual(beforeSave.body, {
      registered: false,
      canParticipate: false,
      registration: null,
    });

    const saved = await request("/api/registration", {
      method: "PUT",
      body: JSON.stringify({
        name: "Noor Jansen",
        registrationType: "consumer",
        email: "noor@example.test",
        usefulnessRating: 4,
        referralLikelihood: 5,
        desiredFeatures: "Meer buurtverhalen en lokale activiteiten.",
      }),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.registered, true);
    assert.equal(saved.body.canParticipate, true);
    assert.equal(saved.body.registration.name, "Noor Jansen");

    const afterSave = await request("/api/registration");
    assert.equal(afterSave.status, 200);
    assert.equal(afterSave.body.registration.email, "noor@example.test");
    assert.equal(afterSave.body.registration.desiredFeatures, "Meer buurtverhalen en lokale activiteiten.");
  });
});