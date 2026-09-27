import { businessIntakeTranslations, type Language } from '@/lib/i18n';

export type BusinessJourneyStep = 'explain' | 'find' | 'details' | 'review';
const ORDER: BusinessJourneyStep[] = ['explain', 'find', 'details', 'review'];

/**
 * Step indicator for the business onboarding journey. Purely presentational:
 * the pages it sits on keep working without it.
 */
export function BusinessJourneySteps({ language, current }: { language: Language; current: BusinessJourneyStep }) {
  const copy = businessIntakeTranslations[language].journey;
  const currentIndex = ORDER.indexOf(current);
  return (
    <nav aria-label={copy.label} data-testid="business-journey-steps" className="mb-8">
      <ol className="flex flex-wrap gap-2 text-sm">
        {ORDER.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
          return (
            <li
              key={step}
              aria-current={state === 'current' ? 'step' : undefined}
              data-state={state}
              className={`rounded-full border px-3 py-1 ${state === 'current' ? 'border-foreground bg-foreground text-background font-bold' : state === 'done' ? 'border-border bg-muted text-foreground' : 'border-border text-muted-foreground'}`}
            >
              <span aria-hidden="true">{index + 1}. </span>
              {copy.steps[step]}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
