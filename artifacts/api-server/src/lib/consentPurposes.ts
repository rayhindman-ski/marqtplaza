import { and, desc, eq } from "drizzle-orm";
import { accountConsentEventsTable, db } from "@workspace/db";

/** Existing marketing_updates entries remain valid; new notices use product_updates. */
export const CONSENT_NOTICE_VERSION = "draft-2026-09";
export const CONSENT_CATALOGUE = [
  {
    id: "product_updates",
    lawfulBasis: "consent",
    noticeVersion: CONSENT_NOTICE_VERSION,
    labels: { nl: "Productupdates", en: "Product updates" },
    descriptions: { nl: "Nieuws over Buurtplaza en je buurt per e-mail.", en: "News about Buurtplaza and your neighbourhood by e-mail." },
    defaultGranted: false,
  },
  {
    id: "research_contact",
    lawfulBasis: "consent",
    noticeVersion: CONSENT_NOTICE_VERSION,
    labels: { nl: "Onderzoekscontact", en: "Research contact" },
    descriptions: { nl: "We mogen je benaderen voor productonderzoek.", en: "We may contact you for product research." },
    defaultGranted: false,
  },
  {
    id: "marketing_updates",
    lawfulBasis: "consent",
    noticeVersion: CONSENT_NOTICE_VERSION,
    labels: { nl: "Buurtplaza-updates (bestaande keuze)", en: "Buurtplaza updates (existing choice)" },
    descriptions: { nl: "Bestaande keuze voor product- en buurtupdates per e-mail.", en: "Existing choice for product and neighbourhood updates by e-mail." },
    defaultGranted: false,
  },
] as const;

export type OptionalConsentPurpose = (typeof CONSENT_CATALOGUE)[number]["id"];
export function consentPurpose(id: string) {
  return CONSENT_CATALOGUE.find((purpose) => purpose.id === id);
}

/** Latest event, not any historical grant; ties are resolved by ledger id. */
export async function hasActiveConsent(
  database: Pick<typeof db, "select">,
  appUserId: number,
  purpose: OptionalConsentPurpose,
): Promise<boolean> {
  const [latest] = await database.select({ granted: accountConsentEventsTable.granted })
    .from(accountConsentEventsTable)
    .where(and(eq(accountConsentEventsTable.userId, appUserId), eq(accountConsentEventsTable.consentType, purpose)))
    .orderBy(desc(accountConsentEventsTable.createdAt), desc(accountConsentEventsTable.id))
    .limit(1);
  return latest?.granted === true;
}