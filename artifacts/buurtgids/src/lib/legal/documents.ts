import type { Language } from '../i18n';

export type LegalDocument = {
  id: 'terms' | 'privacy';
  version: 'draft-2026-09';
  effectiveDate: null;
  status: 'draft';
  nl: { title: string; sections: Array<{ heading: string; body: string }> };
  en: { title: string; sections: Array<{ heading: string; body: string }> };
};

/** Draft notice version matches the API's CONSENT_NOTICE_VERSION.
 * These are review placeholders, not approved conditions or legal advice. */
export const legalDocuments: Record<LegalDocument['id'], LegalDocument> = {
  terms: {
    id: 'terms',
    version: 'draft-2026-09',
    effectiveDate: null,
    status: 'draft',
    nl: {
      title: 'Voorwaarden',
      sections: [
        { heading: 'Concept — gebruik', body: 'Dit is een concept voor beoordeling, geen vastgestelde gebruiksovereenkomst. Buurtplaza toont buurtinformatie en biedt optionele accountfuncties.' },
        { heading: 'Concept — je account', body: 'Inloggen en verificatie verlopen via de identiteitsprovider. Je kunt je voorkeuren aanpassen via je account.' },
        { heading: 'Concept — vragen', body: 'Je vindt de beschikbare verzoeken en contactmogelijkheden bij je privacyrechten in je account.' },
      ],
    },
    en: {
      title: 'Terms',
      sections: [
        { heading: 'Draft — use', body: 'This is a draft for review, not an effective agreement. Buurtplaza displays local information and offers optional account features.' },
        { heading: 'Draft — your account', body: 'Sign-in and verification take place with the identity provider. You can change preferences in your account.' },
        { heading: 'Draft — questions', body: 'Available requests and contact options are listed with your privacy rights in your account.' },
      ],
    },
  },
  privacy: {
    id: 'privacy',
    version: 'draft-2026-09',
    effectiveDate: null,
    status: 'draft',
    nl: {
      title: 'Privacyverklaring',
      sections: [
        { heading: 'Concept — gegevens', body: 'Bij registratie kunnen naam, e-mailadres en telefoonnummer worden opgegeven. Een account kan voorkeuren, toestemmingskeuzes en een laatste zoekopdracht bewaren.' },
        { heading: 'Concept — inloggen', body: 'De identiteitsprovider beheert inloggegevens en e-mailverificatie; Buurtplaza bewaart geen wachtwoord.' },
        { heading: 'Concept — je rechten', body: 'Via je account kun je voorkeuren aanpassen, toestemmingen bekijken en verzoeken rond je gegevens vinden.' },
      ],
    },
    en: {
      title: 'Privacy notice',
      sections: [
        { heading: 'Draft — data', body: 'Registration may collect a name, email address and phone number. An account can retain preferences, consent choices and a last search.' },
        { heading: 'Draft — sign-in', body: 'The identity provider manages credentials and email verification; Buurtplaza does not store passwords.' },
        { heading: 'Draft — your rights', body: 'In your account you can change preferences, view consents and find ways to make requests about your data.' },
      ],
    },
  },
};

export function legalCopy(document: LegalDocument, language: Language) {
  return document[language];
}