import { useTranslation } from 'react-i18next';
import Step0Search from '../Step0Search';
import { getSheetCopy } from './sheetCopy';
import type { ScrapedRestaurant } from '../../../lib/applyScrapedData';

/**
 * The first screen of the onboarding sheet for a new owner: find the
 * restaurant on Google, then open the sheet already filled ("do seu Google"
 * on each block). The search itself is the wizard's Step 0, unchanged, so
 * both paths share one tested search; this adds the sheet's heading.
 *
 * Not shown to demo converts (the demo already looked them up) or to an owner
 * who already typed into the sheet. "Skip" opens the blank sheet.
 */
export default function FindOnGoogle({ onFound, onSkip }: {
  onFound: (scraped: ScrapedRestaurant) => void;
  onSkip: () => void;
}) {
  const { i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  return (
    <main className="mx-auto w-full max-w-[620px] px-6 pb-24">
      <header className="pt-12 pb-8">
        <h1 className="font-serif text-[38px] sm:text-[46px] leading-[1.08] tracking-tight text-deep-charcoal text-balance">
          {copy.findTitle}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.6] text-warm-stone">{copy.findIntro}</p>
      </header>
      <Step0Search showHeader={false} onPrefill={onFound} onSkip={onSkip} />
    </main>
  );
}
