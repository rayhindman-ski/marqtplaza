/**
 * Verification signals (v0.5.2, BVER-002). Pure, advisory and computed at
 * submit from what the claimant supplied and what the directory already
 * knows. They never decide anything: a reviewer reads them next to the
 * declaration and evidence. Nothing here calls an external service.
 */
export const SIGNALS_VERSION = 1;

export type DomainMatch = "match" | "mismatch" | "unknown";

export type BusinessSignals = {
  version: typeof SIGNALS_VERSION;
  /** Claimant's stated domain against the profile's website host. */
  domainMatch: DomainMatch;
  /** Domain of the claimant's contact e-mail against the profile's website host. */
  emailDomainMatch: DomainMatch;
  /** True when the compared website came from the claimant, not the directory. */
  websiteSelfReported: boolean;
  /** How the neighbourhood/coordinates were established (self-reported businesses only). */
  geographyBasis: "address_match" | "declared_official" | "unresolved" | null;
  /** `null` when no KvK number was given. */
  kvkFormatOk: boolean | null;
  /** 0 (no similar listing) … 1 (identical name found elsewhere). */
  duplicateScore: number;
  /** Names of the closest public candidates, at most three, for the reviewer. */
  duplicateCandidates: string[];
  computedAt: string;
};

export const KVK_FORMAT = /^[0-9]{8}$/;

export function kvkFormatOk(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  return KVK_FORMAT.test(value.trim());
}

/** Lower-case registrable host without a leading `www.`; `null` when unparsable. */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function domainMatch(evidenceDomain: string | null | undefined, websiteUrl: string | null | undefined): DomainMatch {
  const claimed = hostOf(evidenceDomain);
  const known = hostOf(websiteUrl);
  if (!claimed || !known) return "unknown";
  if (claimed === known) return "match";
  // A subdomain of the known site (shop.example.nl vs example.nl) still counts.
  if (claimed.endsWith(`.${known}`) || known.endsWith(`.${claimed}`)) return "match";
  return "mismatch";
}

/** Mailbox providers whose domain says nothing about the business. */
const PUBLIC_MAIL_HOSTS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "live.nl", "live.com", "outlook.com", "outlook.nl",
  "yahoo.com", "yahoo.nl", "icloud.com", "me.com", "ziggo.nl", "kpnmail.nl", "planet.nl", "hetnet.nl", "casema.nl",
  "xs4all.nl", "upcmail.nl", "chello.nl", "home.nl", "telfort.nl", "protonmail.com", "proton.me",
]);

export function emailDomainMatch(contactEmail: string | null | undefined, websiteUrl: string | null | undefined): DomainMatch {
  const at = contactEmail?.lastIndexOf("@") ?? -1;
  const mailHost = at >= 0 ? hostOf(contactEmail!.slice(at + 1)) : null;
  if (!mailHost || PUBLIC_MAIL_HOSTS.has(mailHost)) return "unknown";
  return domainMatch(mailHost, websiteUrl);
}

const STOP_WORDS = new Set(["de", "het", "een", "the", "en", "and", "van", "bv", "b.v.", "vof", "v.o.f."]);

export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

/** Jaccard similarity of name tokens, 0…1. */
export function nameSimilarity(a: string, b: string): number {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : Math.round((shared / union) * 100) / 100;
}

export type DuplicateCandidate = { name: string };

export function duplicateScore(name: string, candidates: readonly DuplicateCandidate[]): { score: number; closest: string[] } {
  const scored = candidates
    .map((candidate) => ({ name: candidate.name, score: nameSimilarity(name, candidate.name) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return { score: scored[0]?.score ?? 0, closest: scored.slice(0, 3).map((entry) => entry.name) };
}

export type SignalsInput = {
  evidenceDomain: string | null | undefined;
  evidenceKvk: string | null | undefined;
  contactEmail: string | null | undefined;
  profileName: string;
  profileWebsiteUrl: string | null | undefined;
  /** New businesses: the website was typed by the claimant, so a match corroborates nothing. */
  websiteSelfReported: boolean;
  geographyBasis?: BusinessSignals["geographyBasis"];
  /** Public listings/profiles other than this claim's own profile that look alike. */
  candidates: readonly DuplicateCandidate[];
  now?: Date;
};

export function computeSignals(input: SignalsInput): BusinessSignals {
  const duplicates = duplicateScore(input.profileName, input.candidates);
  return {
    version: SIGNALS_VERSION,
    domainMatch: domainMatch(input.evidenceDomain, input.profileWebsiteUrl),
    emailDomainMatch: emailDomainMatch(input.contactEmail, input.profileWebsiteUrl),
    websiteSelfReported: input.websiteSelfReported,
    geographyBasis: input.geographyBasis ?? null,
    kvkFormatOk: kvkFormatOk(input.evidenceKvk),
    duplicateScore: duplicates.score,
    duplicateCandidates: duplicates.closest,
    computedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Read stored signals defensively: older rows have none, and the shape is versioned. */
export function readSignals(value: unknown): BusinessSignals | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== SIGNALS_VERSION) return null;
  return record as BusinessSignals;
}
