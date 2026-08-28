import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  savedEventAlertsTable,
  savedEventSnapshotsTable,
  savedEventTombstonesTable,
} from "@workspace/db";
import { createSavedEventsRouter } from "./saved-events";

const runId = `saved-events-${process.pid}-${Date.now()}`;
const userA = `${runId}-user-a`;
const userB = `${runId}-user-b`;
const eventId = `${runId}-event`;
const userBEventId = `${runId}-other-event`;
const fingerprint = `${runId}-alert`;
const userBFingerprint = `${runId}-other-alert`;

const app = express();
app.use(express.json());
app.use(
  "/api",
  createSavedEventsRouter((req) => req.header("x-test-user-id")),
);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

async function request(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-test-user-id": userId,
      ...init?.headers,
    },
  });
  return { status: response.status, body: await response.json() };
}

async function sync(userId: string, body: Record<string, unknown>) {
  return request(userId, "/api/saved-events/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function cleanTestRows() {
  const users = [userA, userB];
  await db
    .delete(savedEventAlertsTable)
    .where(inArray(savedEventAlertsTable.userId, users));
  await db
    .delete(savedEventSnapshotsTable)
    .where(inArray(savedEventSnapshotsTable.userId, users));
  await db
    .delete(savedEventTombstonesTable)
    .where(inArray(savedEventTombstonesTable.userId, users));
}

describe("saved-events route (isolated database integration)", () => {
  before(async () => {
    await cleanTestRows();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await cleanTestRows();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  });

  it("preserves tombstones for migrations and clears them for explicit re-saves", async () => {
    const originalSnapshot = { title: "Original event", source: "account" };
    const migrationSnapshot = {
      title: "Stale browser event",
      source: "migration",
    };
    const restoredSnapshot = {
      title: "Intentionally restored",
      source: "account",
    };

    assert.equal(
      (
        await sync(userA, {
          events: [{ eventId, snapshot: originalSnapshot }],
        })
      ).status,
      200,
    );

    assert.equal(
      (await sync(userA, { removeEventIds: [eventId] })).status,
      200,
    );

    const migrationResult = await sync(userA, {
      migrationEvents: [{ eventId, snapshot: migrationSnapshot }],
    });
    assert.equal(migrationResult.status, 200);
    assert.deepEqual(migrationResult.body.events, []);

    const tombstones = await db
      .select()
      .from(savedEventTombstonesTable)
      .where(
        and(
          eq(savedEventTombstonesTable.userId, userA),
          eq(savedEventTombstonesTable.eventId, eventId),
        ),
      );
    assert.equal(tombstones.length, 1);

    const restoreResult = await sync(userA, {
      events: [{ eventId, snapshot: restoredSnapshot }],
    });
    assert.equal(restoreResult.status, 200);
    assert.deepEqual(restoreResult.body.events, [
      { eventId, snapshot: restoredSnapshot },
    ]);

    const clearedTombstones = await db
      .select()
      .from(savedEventTombstonesTable)
      .where(
        and(
          eq(savedEventTombstonesTable.userId, userA),
          eq(savedEventTombstonesTable.eventId, eventId),
        ),
      );
    assert.equal(clearedTombstones.length, 0);
  });

  it("keeps event snapshots and alerts scoped to the authenticated user", async () => {
    const snapshotA = { title: "User A event" };
    const snapshotB = { title: "User B event" };
    const alertA = { kind: "changed", message: "User A alert" };
    const alertB = { kind: "cancelled", message: "User B alert" };

    assert.equal(
      (
        await sync(userA, {
          events: [{ eventId, snapshot: snapshotA }],
          alerts: [{ eventId, fingerprint, alert: alertA }],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await sync(userB, {
          events: [{ eventId: userBEventId, snapshot: snapshotB }],
          alerts: [
            {
              eventId: userBEventId,
              fingerprint: userBFingerprint,
              alert: alertB,
            },
          ],
        })
      ).status,
      200,
    );

    const stateA = await request(userA, "/api/saved-events");
    assert.equal(stateA.status, 200);
    assert.deepEqual(stateA.body, {
      events: [{ eventId, snapshot: snapshotA }],
      alerts: [{ eventId, fingerprint, alert: alertA }],
    });

    const stateB = await request(userB, "/api/saved-events");
    assert.equal(stateB.status, 200);
    assert.deepEqual(stateB.body, {
      events: [{ eventId: userBEventId, snapshot: snapshotB }],
      alerts: [
        { eventId: userBEventId, fingerprint: userBFingerprint, alert: alertB },
      ],
    });
  });
});
