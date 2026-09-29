import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { businessMembersTable, businessProfilesTable, db } from "@workspace/db";

type Tx = Pick<typeof db, "select">;
type SoleOwnedBusiness = { id: number; name: string; publicationStatus: string };

/** Lock owned memberships before the final deletion eligibility check. */
export async function findSoleOwnedBusinesses(tx: Tx, clerkUserId: string): Promise<SoleOwnedBusiness[]> {
  const owned = await tx.select({ businessProfileId: businessMembersTable.businessProfileId })
    .from(businessMembersTable)
    .where(and(eq(businessMembersTable.userId, clerkUserId), eq(businessMembersTable.role, "owner")))
    .for("update");
  if (!owned.length) return [];
  const ids = owned.map(row => row.businessProfileId);
  const others = await tx.select({ businessProfileId: businessMembersTable.businessProfileId })
    .from(businessMembersTable)
    .where(and(inArray(businessMembersTable.businessProfileId, ids), eq(businessMembersTable.role, "owner"), ne(businessMembersTable.userId, clerkUserId)));
  const shared = new Set(others.map(row => row.businessProfileId));
  const soleIds = ids.filter(id => !shared.has(id));
  if (!soleIds.length) return [];
  return tx.select({ id: businessProfilesTable.id, name: businessProfilesTable.name, publicationStatus: businessProfilesTable.publicationStatus })
    .from(businessProfilesTable)
    .where(and(inArray(businessProfilesTable.id, soleIds), inArray(businessProfilesTable.publicationStatus, ["published", "suspended"])))
    .orderBy(asc(businessProfilesTable.id));
}