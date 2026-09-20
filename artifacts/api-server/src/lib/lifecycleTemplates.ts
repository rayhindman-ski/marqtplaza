import type { LifecycleEventCode } from "./lifecycleOutbox";

/**
 * NL/EN copy for lifecycle e-mails.
 *
 * Templates only ever read the allow-listed outbox payload (business name,
 * identifiers, status codes). They never receive contact data, reviewer
 * notes, evidence, or tokens, and they never embed links that carry
 * credentials: the recipient signs in through the normal site to act.
 */

export type LifecycleLocale = "nl" | "en";

export type RenderedLifecycleEmail = {
  locale: LifecycleLocale;
  subject: string;
  text: string;
};

type TemplateVars = {
  businessName: string;
  requestId: string;
  siteName: string;
};

type Template = { subject: (v: TemplateVars) => string; body: (v: TemplateVars) => string };

const SITE_NAME = "buurtplaza.nl";

const nl = {
  signIn: "Log in op buurtplaza.nl om de details te bekijken.",
  closing: "Met vriendelijke groet,\nhet team van buurtplaza.nl",
  noReply: "Dit is een automatisch bericht; antwoorden worden niet gelezen.",
};
const en = {
  signIn: "Sign in at buurtplaza.nl to see the details.",
  closing: "Kind regards,\nthe buurtplaza.nl team",
  noReply: "This is an automated message; replies are not read.",
};

function wrapNl(lines: string[]): string {
  return [...lines, "", nl.signIn, "", nl.closing, "", nl.noReply].join("\n");
}
function wrapEn(lines: string[]): string {
  return [...lines, "", en.signIn, "", en.closing, "", en.noReply].join("\n");
}

const TEMPLATES: Record<LifecycleEventCode, Record<LifecycleLocale, Template>> = {
  "claim.submitted": {
    nl: {
      subject: (v) => `Claim ontvangen voor ${v.businessName}`,
      body: (v) => wrapNl([`We hebben je claim voor ${v.businessName} ontvangen.`, "Een redacteur beoordeelt de claim; je ontvangt bericht zodra er een besluit is."]),
    },
    en: {
      subject: (v) => `Claim received for ${v.businessName}`,
      body: (v) => wrapEn([`We received your claim for ${v.businessName}.`, "An editor will review it; you will hear from us once a decision has been made."]),
    },
  },
  "claim.disputed": {
    nl: {
      subject: (v) => `Je claim voor ${v.businessName} wordt betwist`,
      body: (v) => wrapNl([`Er is een tweede claim ingediend voor ${v.businessName}.`, "Een redacteur bekijkt beide claims voordat er een besluit wordt genomen."]),
    },
    en: {
      subject: (v) => `Your claim for ${v.businessName} is disputed`,
      body: (v) => wrapEn([`Another claim has been filed for ${v.businessName}.`, "An editor will look at both claims before deciding."]),
    },
  },
  "claim.approved": {
    nl: {
      subject: (v) => `Je claim voor ${v.businessName} is goedgekeurd`,
      body: (v) => wrapNl([`Je claim voor ${v.businessName} is goedgekeurd.`, "Je kunt het bedrijfsprofiel nu beheren."]),
    },
    en: {
      subject: (v) => `Your claim for ${v.businessName} has been approved`,
      body: (v) => wrapEn([`Your claim for ${v.businessName} has been approved.`, "You can now manage the business profile."]),
    },
  },
  "claim.rejected": {
    nl: {
      subject: (v) => `Je claim voor ${v.businessName} is afgewezen`,
      body: (v) => wrapNl([`Je claim voor ${v.businessName} is afgewezen.`, "De toelichting van de redactie staat in je account."]),
    },
    en: {
      subject: (v) => `Your claim for ${v.businessName} has been rejected`,
      body: (v) => wrapEn([`Your claim for ${v.businessName} has been rejected.`, "The editor's explanation is available in your account."]),
    },
  },
  "claim.changes_requested": {
    nl: {
      subject: (v) => `Aanvulling gevraagd voor je claim op ${v.businessName}`,
      body: (v) => wrapNl([`De redactie heeft aanvullende informatie nodig voor je claim op ${v.businessName}.`, "Wat er precies gevraagd wordt, lees je in je account."]),
    },
    en: {
      subject: (v) => `More information requested for your claim on ${v.businessName}`,
      body: (v) => wrapEn([`The editors need more information for your claim on ${v.businessName}.`, "What exactly is requested is shown in your account."]),
    },
  },
  "revision.approved": {
    nl: {
      subject: (v) => `Je wijzigingen voor ${v.businessName} zijn goedgekeurd`,
      body: (v) => wrapNl([`De voorgestelde wijzigingen aan het profiel van ${v.businessName} zijn goedgekeurd.`]),
    },
    en: {
      subject: (v) => `Your changes for ${v.businessName} have been approved`,
      body: (v) => wrapEn([`The proposed changes to the profile of ${v.businessName} have been approved.`]),
    },
  },
  "revision.rejected": {
    nl: {
      subject: (v) => `Je wijzigingen voor ${v.businessName} zijn afgewezen`,
      body: (v) => wrapNl([`De voorgestelde wijzigingen aan het profiel van ${v.businessName} zijn afgewezen.`, "De toelichting van de redactie staat in je account."]),
    },
    en: {
      subject: (v) => `Your changes for ${v.businessName} have been rejected`,
      body: (v) => wrapEn([`The proposed changes to the profile of ${v.businessName} have been rejected.`, "The editor's explanation is available in your account."]),
    },
  },
  "revision.changes_requested": {
    nl: {
      subject: (v) => `Aanpassing gevraagd voor het profiel van ${v.businessName}`,
      body: (v) => wrapNl([`De redactie vraagt om aanpassingen aan de voorgestelde wijzigingen voor ${v.businessName}.`, "Wat er precies gevraagd wordt, lees je in je account."]),
    },
    en: {
      subject: (v) => `Changes requested for the profile of ${v.businessName}`,
      body: (v) => wrapEn([`The editors ask for adjustments to the proposed changes for ${v.businessName}.`, "What exactly is requested is shown in your account."]),
    },
  },
  "business.published": {
    nl: {
      subject: (v) => `${v.businessName} staat nu online`,
      body: (v) => wrapNl([`Het profiel van ${v.businessName} is gepubliceerd op ${v.siteName}.`]),
    },
    en: {
      subject: (v) => `${v.businessName} is now live`,
      body: (v) => wrapEn([`The profile of ${v.businessName} has been published on ${v.siteName}.`]),
    },
  },
  "business.unpublished": {
    nl: {
      subject: (v) => `${v.businessName} is offline gehaald`,
      body: (v) => wrapNl([`Het profiel van ${v.businessName} is niet langer openbaar zichtbaar op ${v.siteName}.`]),
    },
    en: {
      subject: (v) => `${v.businessName} has been taken offline`,
      body: (v) => wrapEn([`The profile of ${v.businessName} is no longer publicly visible on ${v.siteName}.`]),
    },
  },
  "business.suspended": {
    nl: {
      subject: (v) => `Het profiel van ${v.businessName} is geschorst`,
      body: (v) => wrapNl([`Het profiel van ${v.businessName} is tijdelijk geschorst en is niet openbaar zichtbaar.`, "De reden staat in je account."]),
    },
    en: {
      subject: (v) => `The profile of ${v.businessName} has been suspended`,
      body: (v) => wrapEn([`The profile of ${v.businessName} has been suspended and is not publicly visible.`, "The reason is shown in your account."]),
    },
  },
  "business.closed": {
    nl: {
      subject: (v) => `Het profiel van ${v.businessName} is gesloten`,
      body: (v) => wrapNl([`Het profiel van ${v.businessName} is gesloten en wordt niet meer getoond op ${v.siteName}.`]),
    },
    en: {
      subject: (v) => `The profile of ${v.businessName} has been closed`,
      body: (v) => wrapEn([`The profile of ${v.businessName} has been closed and is no longer shown on ${v.siteName}.`]),
    },
  },
  "account.deletion_received": {
    nl: {
      subject: () => "Je verwijderverzoek is ontvangen",
      body: (v) => wrapNl([`We hebben je verzoek (nummer ${v.requestId}) om je account te verwijderen ontvangen.`, "Je kunt de status volgen in je account. Zolang het verzoek open staat, kun je het intrekken."]),
    },
    en: {
      subject: () => "Your deletion request has been received",
      body: (v) => wrapEn([`We received your request (number ${v.requestId}) to delete your account.`, "You can follow its status in your account. While the request is open you can withdraw it."]),
    },
  },
  "account.deletion_blocked": {
    nl: {
      subject: () => "Je verwijderverzoek kan nog niet worden uitgevoerd",
      body: (v) => wrapNl([`Je verzoek (nummer ${v.requestId}) om je account te verwijderen kan nog niet worden uitgevoerd omdat je de enige eigenaar van een bedrijfsprofiel bent.`, "Onze ondersteuning bekijkt het verzoek; je hoeft niets te doen."]),
    },
    en: {
      subject: () => "Your deletion request cannot be completed yet",
      body: (v) => wrapEn([`Your request (number ${v.requestId}) to delete your account cannot be completed yet because you are the only owner of a business profile.`, "Our support team is reviewing the request; no action is needed from you."]),
    },
  },
  "account.deletion_in_review": {
    nl: {
      subject: () => "Je verwijderverzoek wordt beoordeeld",
      body: (v) => wrapNl([`Je verzoek (nummer ${v.requestId}) om je account te verwijderen wordt beoordeeld door onze ondersteuning.`]),
    },
    en: {
      subject: () => "Your deletion request is under review",
      body: (v) => wrapEn([`Your request (number ${v.requestId}) to delete your account is being reviewed by our support team.`]),
    },
  },
  "account.deletion_completed": {
    nl: {
      subject: () => "Je verwijderverzoek is afgerond",
      body: (v) => wrapNl([`Je verzoek (nummer ${v.requestId}) om je account te verwijderen is afgerond.`]),
    },
    en: {
      subject: () => "Your deletion request has been completed",
      body: (v) => wrapEn([`Your request (number ${v.requestId}) to delete your account has been completed.`]),
    },
  },
  "account.deletion_rejected": {
    nl: {
      subject: () => "Je verwijderverzoek is afgewezen",
      body: (v) => wrapNl([`Je verzoek (nummer ${v.requestId}) om je account te verwijderen is afgewezen.`, "De toelichting staat in je account."]),
    },
    en: {
      subject: () => "Your deletion request has been rejected",
      body: (v) => wrapEn([`Your request (number ${v.requestId}) to delete your account has been rejected.`, "The explanation is available in your account."]),
    },
  },
  "account.deletion_withdrawn": {
    nl: {
      subject: () => "Je verwijderverzoek is ingetrokken",
      body: (v) => wrapNl([`Je verzoek (nummer ${v.requestId}) om je account te verwijderen is ingetrokken. Je account blijft bestaan.`]),
    },
    en: {
      subject: () => "Your deletion request has been withdrawn",
      body: (v) => wrapEn([`Your request (number ${v.requestId}) to delete your account has been withdrawn. Your account remains active.`]),
    },
  },
};

export class UnknownLifecycleTemplateError extends Error {
  constructor(public readonly template: string) {
    super(`No lifecycle template for "${template}".`);
    this.name = "UnknownLifecycleTemplateError";
  }
}

export function normaliseLifecycleLocale(locale: string | null | undefined): LifecycleLocale {
  return locale?.trim().toLowerCase().startsWith("en") ? "en" : "nl";
}

/** Strip control characters so payload text can never inject headers or extra lines. */
function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Render the subject and plain-text body for one outbox row. Only the
 * allow-listed payload keys are read; unknown keys are ignored.
 */
export function renderLifecycleEmail(
  template: string,
  locale: string | null | undefined,
  payload: Record<string, unknown>,
): RenderedLifecycleEmail {
  const entry = TEMPLATES[template as LifecycleEventCode];
  if (!entry) throw new UnknownLifecycleTemplateError(template);
  const resolvedLocale = normaliseLifecycleLocale(locale);
  const vars: TemplateVars = {
    businessName: cleanText(payload.businessName, resolvedLocale === "nl" ? "je bedrijf" : "your business"),
    requestId: typeof payload.requestId === "number" ? String(payload.requestId) : "—",
    siteName: SITE_NAME,
  };
  const t = entry[resolvedLocale];
  return { locale: resolvedLocale, subject: t.subject(vars), text: t.body(vars) };
}
