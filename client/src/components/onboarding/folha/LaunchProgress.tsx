import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSheetCopy } from './sheetCopy';
import LaunchStepList from './LaunchSteps';
import type { LaunchSteps } from '../../../lib/onboardingLaunch';

/**
 * What the owner sees between "Colocar no ar" and the finished restaurant.
 * Each row turns when the server reports that step (see onboardingLaunch.ts),
 * so a slow voice agent shows as the voice agent being slow, not as a spinner.
 * Same width and rhythm as the final screen, which reuses the same rows.
 */
export default function LaunchProgress({ name, steps }: { name: string; steps: LaunchSteps }) {
  const { i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <main className="mx-auto w-full max-w-[620px] px-6 pt-16 pb-24 text-deep-charcoal" aria-busy="true">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{copy.launchLabel}</p>
      <h1 ref={heading} tabIndex={-1}
        className="mt-3 font-serif text-[38px] sm:text-[46px] leading-[1.08] tracking-tight text-balance focus:outline-none">
        {copy.launchTitle.replace('{{name}}', name)}
      </h1>
      <p className="mt-4 text-[17px] leading-[1.6] text-warm-stone">{copy.launchIntro}</p>
      <div className="mt-10">
        <LaunchStepList steps={steps} phase="working" />
      </div>
    </main>
  );
}
