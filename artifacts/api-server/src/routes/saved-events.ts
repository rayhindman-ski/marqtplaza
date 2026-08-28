import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  GetSavedEventsResponse,
  SyncSavedEventsBody,
  SyncSavedEventsResponse,
} from "@workspace/api-zod";
import {
  db,
  savedEventAlertsTable,
  savedEventSnapshotsTable,
  savedEventTombstonesTable,
} from "@workspace/db";

type UserIdResolver = (req: Request) => string | null | undefined;

function currentUserId(
  req: Request,
  res: {
    status: (code: number) => { json: (body: unknown) => unknown };
  },
  resolveUserId: UserIdResolver,
): string | null {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication is required." });
    return null;
  }
  return userId;
}

async function accountState(userId: string) {
  const [events, alerts] = await Promise.all([
    db
      .select({
        eventId: savedEventSnapshotsTable.eventId,
        snapshot: savedEventSnapshotsTable.snapshot,
      })
      .from(savedEventSnapshotsTable)
      .where(eq(savedEventSnapshotsTable.userId, userId))
      .orderBy(desc(savedEventSnapshotsTable.updatedAt))
      .limit(100),
    db
      .select({
        eventId: savedEventAlertsTable.eventId,
        fingerprint: savedEventAlertsTable.fingerprint,
        alert: savedEventAlertsTable.alert,
      })
      .from(savedEventAlertsTable)
      .where(eq(savedEventAlertsTable.userId, userId))
      .orderBy(desc(savedEventAlertsTable.updatedAt))
      .limit(100),
  ]);
  return { events, alerts };
}

export function createSavedEventsRouter(
  resolveUserId: UserIdResolver = (req) => getAuth(req).userId,
): IRouter {
  const router: IRouter = Router();

  router.get("/saved-events", async (req, res): Promise<void> => {
    const userId = currentUserId(req, res, resolveUserId);
    if (!userId) return;
    try {
      res.json(GetSavedEventsResponse.parse(await accountState(userId)));
    } catch (error) {
      req.log.error({ err: error }, "Could not load saved events");
      res
        .status(500)
        .json({ error: "Saved events are temporarily unavailable." });
    }
  });

  router.post("/saved-events/sync", async (req, res): Promise<void> => {
    const userId = currentUserId(req, res, resolveUserId);
    if (!userId) return;
    const parsed = SyncSavedEventsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid saved event sync payload." });
      return;
    }
    const body = {
      events: parsed.data.events ?? [],
      migrationEvents: parsed.data.migrationEvents ?? [],
      alerts: parsed.data.alerts ?? [],
      removeEventIds: parsed.data.removeEventIds ?? [],
      removeAlertFingerprints: parsed.data.removeAlertFingerprints ?? [],
    };

    try {
      await db.transaction(async (tx) => {
        if (body.removeEventIds.length > 0) {
          await tx
            .delete(savedEventSnapshotsTable)
            .where(
              and(
                eq(savedEventSnapshotsTable.userId, userId),
                inArray(savedEventSnapshotsTable.eventId, body.removeEventIds),
              ),
            );
          await tx
            .delete(savedEventAlertsTable)
            .where(
              and(
                eq(savedEventAlertsTable.userId, userId),
                inArray(savedEventAlertsTable.eventId, body.removeEventIds),
              ),
            );
          for (const eventId of body.removeEventIds) {
            await tx
              .insert(savedEventTombstonesTable)
              .values({ userId, eventId })
              .onConflictDoUpdate({
                target: [
                  savedEventTombstonesTable.userId,
                  savedEventTombstonesTable.eventId,
                ],
                set: { deletedAt: new Date() },
              });
          }
        }
        if (body.removeAlertFingerprints.length > 0) {
          await tx
            .delete(savedEventAlertsTable)
            .where(
              and(
                eq(savedEventAlertsTable.userId, userId),
                inArray(
                  savedEventAlertsTable.fingerprint,
                  body.removeAlertFingerprints,
                ),
              ),
            );
        }

        const migrationIds = body.migrationEvents.map((event) => event.eventId);
        const tombstonedMigrationIds =
          migrationIds.length > 0
            ? new Set(
                (
                  await tx
                    .select({ eventId: savedEventTombstonesTable.eventId })
                    .from(savedEventTombstonesTable)
                    .where(
                      and(
                        eq(savedEventTombstonesTable.userId, userId),
                        inArray(
                          savedEventTombstonesTable.eventId,
                          migrationIds,
                        ),
                      ),
                    )
                ).map((row) => row.eventId),
              )
            : new Set<string>();
        const explicitEvents = body.events.filter(
          (event) => !body.removeEventIds.includes(event.eventId),
        );
        const eventsToUpsert = [
          ...body.migrationEvents.filter(
            (event) => !tombstonedMigrationIds.has(event.eventId),
          ),
          ...explicitEvents,
        ].filter((event) => !body.removeEventIds.includes(event.eventId));

        if (explicitEvents.length > 0) {
          await tx.delete(savedEventTombstonesTable).where(
            and(
              eq(savedEventTombstonesTable.userId, userId),
              inArray(
                savedEventTombstonesTable.eventId,
                explicitEvents.map((event) => event.eventId),
              ),
            ),
          );
        }
        for (const event of eventsToUpsert) {
          await tx
            .insert(savedEventSnapshotsTable)
            .values({
              userId,
              eventId: event.eventId,
              snapshot: event.snapshot,
            })
            .onConflictDoUpdate({
              target: [
                savedEventSnapshotsTable.userId,
                savedEventSnapshotsTable.eventId,
              ],
              set: { snapshot: event.snapshot, updatedAt: new Date() },
            });
        }

        const alertEventIds = [
          ...new Set(body.alerts.map((item) => item.eventId)),
        ];
        const savedAlertEventIds =
          alertEventIds.length > 0
            ? new Set(
                (
                  await tx
                    .select({ eventId: savedEventSnapshotsTable.eventId })
                    .from(savedEventSnapshotsTable)
                    .where(
                      and(
                        eq(savedEventSnapshotsTable.userId, userId),
                        inArray(
                          savedEventSnapshotsTable.eventId,
                          alertEventIds,
                        ),
                      ),
                    )
                ).map((row) => row.eventId),
              )
            : new Set<string>();
        for (const item of body.alerts.filter((alert) =>
          savedAlertEventIds.has(alert.eventId),
        )) {
          await tx
            .insert(savedEventAlertsTable)
            .values({
              userId,
              eventId: item.eventId,
              fingerprint: item.fingerprint,
              alert: item.alert,
            })
            .onConflictDoUpdate({
              target: [
                savedEventAlertsTable.userId,
                savedEventAlertsTable.fingerprint,
              ],
              set: {
                eventId: item.eventId,
                alert: item.alert,
                updatedAt: new Date(),
              },
            });
        }
      });
      res.json(SyncSavedEventsResponse.parse(await accountState(userId)));
    } catch (error) {
      req.log.error({ err: error }, "Could not synchronize saved events");
      res
        .status(500)
        .json({ error: "Saved events could not be synchronized." });
    }
  });

  return router;
}

export default createSavedEventsRouter();
