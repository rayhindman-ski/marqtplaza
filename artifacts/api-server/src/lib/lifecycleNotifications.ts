import { and, eq } from "drizzle-orm";

import { businessMembersTable, db } from "@workspace/db";

import { enqueueLifecycleMessage, type LifecycleEventCode, type LifecyclePayload } from "./lifecycleOutbox";

type Tx = Pick<typeof db, "insert" | "select" | "update">;

/**
 * Queue one message for every current owner of a business inside the caller's
 * transaction. `dedupeScope` must identify the exact transition (for example
 * the immutable review row id) so a replay leaves one row per owner.
 */
export async function notifyBusinessOwners(
  tx: Tx,
  input: {
    businessProfileId: number;
    eventCode: LifecycleEventCode;
    dedupeScope: string;
    payload: LifecyclePayload;
  },
): Promise<number> {
  const owners = await tx
    .select({ userId: businessMembersTable.userId })
    .from(businessMembersTable)
    .where(
      and(
        eq(businessMembersTable.businessProfileId, input.businessProfileId),
        eq(businessMembersTable.role, "owner"),
      ),
    );
  let queued = 0;
  for (const owner of owners) {
    const outcome = await enqueueLifecycleMessage(tx, {
      eventCode: input.eventCode,
      recipientClerkUserId: owner.userId,
      idempotencyKey: `${input.dedupeScope}:${owner.userId}`,
      payload: input.payload,
    });
    if (outcome.created) queued += 1;
  }
  return queued;
}

/** Queue one message for a single Clerk subject (claimant, requester). */
export async function notifyUser(
  tx: Tx,
  input: {
    clerkUserId: string;
    eventCode: LifecycleEventCode;
    idempotencyKey: string;
    payload: LifecyclePayload;
  },
): Promise<boolean> {
  const outcome = await enqueueLifecycleMessage(tx, {
    eventCode: input.eventCode,
    recipientClerkUserId: input.clerkUserId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  });
  return outcome.created;
}
