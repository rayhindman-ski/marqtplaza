import { useEffect } from 'react';
import { Link } from 'wouter';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageToggle } from '@/components/account/AccountShell';
import { accountTranslations } from '@/lib/i18n';
import { legalCopy, legalDocuments, type LegalDocument } from '@/lib/legal/documents';
import { useAppLanguage } from '@/lib/useAppLanguage';

export function LegalDocumentPage({ id, englishAlias = false }: { id: LegalDocument['id']; englishAlias?: boolean }) {
  const [language, setLanguage] = useAppLanguage();
  useEffect(() => { if (englishAlias) setLanguage('en'); }, [englishAlias, setLanguage]);
  const document = legalDocuments[id];
  const content = legalCopy(document, language);
  const draftBanner = language === 'nl' ? 'Concepttekst — nog niet goedgekeurd' : 'Draft — not yet approved';
  const version = language === 'nl' ? 'Versie' : 'Version';
  const date = language === 'nl' ? 'Ingangsdatum' : 'Effective date';
  const unset = language === 'nl' ? 'nog niet vastgesteld' : 'not yet set';
  const print = language === 'nl' ? 'Download als PDF' : 'Download as PDF';
  return <main data-testid={`page-legal-${id}`} className="legal-document min-h-screen bg-background px-4 py-8 text-foreground">
    <div className="mx-auto max-w-3xl">
      <nav className="legal-no-print mb-8 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-primary underline">{accountTranslations[language].back}</Link>
        <LanguageToggle language={language} onLanguageChange={setLanguage} />
      </nav>
      <article>
        <header className="legal-print-header border-b border-border pb-5">
          <h1 data-testid="heading-legal-document" className="font-serif text-4xl font-semibold">{content.title}</h1>
          <p data-testid="legal-version" className="mt-3 text-sm">{version}: {document.version}</p>
          <p data-testid="legal-effective-date" className="text-sm">{date}: {document.effectiveDate ?? unset}</p>
          <p data-testid="legal-draft-banner" role="status" className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-3 font-bold text-amber-950">{draftBanner}</p>
        </header>
        <div className="space-y-6 py-6">
          {content.sections.map((section) => <section key={section.heading}>
            <h2 className="font-serif text-2xl font-semibold">{section.heading}</h2>
            <p className="mt-2 leading-7">{section.body}</p>
          </section>)}
        </div>
      </article>
      <Button type="button" variant="outline" data-testid="button-legal-print" className="legal-no-print mt-6 gap-2"
        onClick={() => window.print()}><Printer aria-hidden="true" className="h-4 w-4" />{print}</Button>
    </div>
  </main>;
}

export function TermsPage() { return <LegalDocumentPage id="terms" />; }
export function PrivacyNoticePage() { return <LegalDocumentPage id="privacy" />; }
export function EnglishTermsPage() { return <LegalDocumentPage id="terms" englishAlias />; }
export function EnglishPrivacyNoticePage() { return <LegalDocumentPage id="privacy" englishAlias />; }