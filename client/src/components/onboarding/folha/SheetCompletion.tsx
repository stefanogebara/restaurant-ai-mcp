import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSheetCopy } from './sheetCopy';
import LaunchStepList from './LaunchSteps';
import TalkToReceptionist from './TalkToReceptionist';
import BookingLinkCard from './BookingLinkCard';
import ThiingsIcon from '../../common/ThiingsIcon';
import ResumeCheckout from '../ResumeCheckout';
import type { BillingPlan } from '../../../lib/billingHandoff';
import { LAUNCH_STEPS, type LaunchSteps } from '../../../lib/onboardingLaunch';

export interface SheetCompletionProps {
  setup: Record<string, string> | null;
  bookingUrl: string | null;
  /** Details from the live setup events (tables, language, trial end). */
  steps?: LaunchSteps;
  /** The new voice agent, only when the server said it is ok. */
  agentId?: string | null;
  restaurantName?: string | null;
  selectedPlan?: BillingPlan | null;
  /** Leaves the onboarding; injectable for tests. */
  goTo?: (url: string) => void;
}

const DASHBOARD = '/host-dashboard/simple?launch=1';
const CONTINUE_AFTER_CALL_SECONDS = 8;

/**
 * The end of the onboarding sheet. Three things, in the order an owner wants
 * them: hear the receptionist (a real call with the agent just created), take
 * the booking link, and see honestly what was set up and what was not.
 *
 * The results list is the SAME list the progress screen showed, so the rows
 * stay where they were while the heading changes from "Setting up" to "live".
 */
export default function SheetCompletion({
  setup, bookingUrl, steps = {}, agentId = null, restaurantName = null, selectedPlan = null,
  goTo = (url) => window.location.assign(url),
}: SheetCompletionProps) {
  const { t, i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const live = setup?.voice_agent === 'ok' && Boolean(agentId);
  const name = restaurantName?.trim();
  const anyOpen = LAUNCH_STEPS.some((key) => setup?.[key] !== 'ok');
  const enter = 'motion-safe:animate-fade-in-up';

  // After the test call the onboarding moves on: a short summary, then the
  // dashboard (where her booking already is) unless the owner stays.
  const [afterCall, setAfterCall] = useState<{ bookingCode: string | null } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) { goToRef.current(DASHBOARD); return; }
    const timer = window.setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);
  function callEnded(result: { bookingCode: string | null }) {
    setAfterCall(result);
    if (!selectedPlan) setSecondsLeft(CONTINUE_AFTER_CALL_SECONDS);
  }

  return (
    <main className="mx-auto w-full max-w-[620px] px-6 pt-16 pb-24 text-deep-charcoal">
      {live && (
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          {copy.liveLabel}
        </p>
      )}
      <h1 ref={heading} tabIndex={-1}
        className="mt-3 font-serif text-[38px] sm:text-[46px] leading-[1.08] tracking-tight text-balance focus:outline-none">
        {live && name ? copy.liveTitle.replace('{{name}}', name) : copy.savedTitle}
      </h1>
      {live && <p className="mt-4 text-[17px] leading-[1.6] text-warm-stone">{copy.liveIntro}</p>}

      {live && agentId && (
        <div className={enter} style={{ animationFillMode: 'both' }}>
          <TalkToReceptionist agentId={agentId} copy={copy} onEnded={callEnded} />
        </div>
      )}

      {afterCall && (
        <section role="status" data-testid="after-call" className={`mt-6 ${enter}`}>
          <p className="flex items-center gap-2 text-[17px] text-deep-charcoal">
            <ThiingsIcon name="check-circle" pxSize={20} className="text-emerald-600" />
            {afterCall.bookingCode ? copy.afterCallBooked.replace('{{code}}', afterCall.bookingCode) : copy.callEnded}
          </p>
          <p className="mt-1 text-[15px] text-muted-stone">{copy.afterCallNext}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => goTo(DASHBOARD)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-burgundy px-6 py-3 text-[15px] font-medium text-white hover:bg-burgundy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60 focus-visible:ring-offset-2">
              {t('onboarding.goToDashboard', 'Go to Dashboard')}
            </button>
            {secondsLeft !== null && (
              <>
                <span className="text-[14px] text-muted-stone">{copy.continueIn.replace('{{n}}', String(secondsLeft))}</span>
                <button type="button" onClick={() => setSecondsLeft(null)}
                  className="text-[14px] text-muted-stone underline underline-offset-2 hover:text-deep-charcoal">
                  {copy.stayHere}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {bookingUrl && (
        <div className={enter} style={{ animationDelay: '120ms', animationFillMode: 'both' }}>
          <BookingLinkCard url={bookingUrl} copy={copy} />
        </div>
      )}

      <h2 className="mt-12 mb-1 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{copy.results}</h2>
      <LaunchStepList steps={steps} setup={setup} phase="done" />
      <p className="mt-5 text-[15px] leading-relaxed text-muted-stone">{copy.verification}</p>
      {anyOpen && <p className="mt-3 text-sm text-muted-stone">{copy.support}</p>}

      <div className="mt-10">
        {selectedPlan && <ResumeCheckout plan={selectedPlan} />}
        <a href="/host-dashboard/simple?launch=1"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-burgundy px-6 py-3 text-[15px] font-medium text-white hover:bg-burgundy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60 focus-visible:ring-offset-2">
          {t('onboarding.goToDashboard', 'Go to Dashboard')}
        </a>
      </div>
    </main>
  );
}
