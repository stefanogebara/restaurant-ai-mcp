import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import { LS_LAUNCH_CHECKLIST_DONE } from '../../config/localStorageKeys';

interface Props {
  bookingSlug: string;
  onDismiss: () => void;
}

const BOOKING_BASE = 'https://seatable.one';

export default function LaunchChecklistModal({ bookingSlug, onDismiss }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bookingUrl = `${BOOKING_BASE}/book/${bookingSlug}`;

  const [copied, setCopied] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setChecked((prev) => ({ ...prev, [i]: !prev[i] }));

  const handleCopy = () => {
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDismiss = () => {
    localStorage.setItem(LS_LAUNCH_CHECKLIST_DONE, '1');
    onDismiss();
  };

  const allChecked = [0, 1, 2].every((i) => checked[i]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="glass-modal w-full max-w-md">
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-glass-border-dark">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-burgundy mb-1">
                {t('launch.badge', 'Setup complete')}
              </p>
              <h2 className="text-xl font-bold text-deep-charcoal tracking-tight">
                {t('launch.title', 'Ready to launch? 3 quick steps')}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[#A8A29E] hover:text-deep-charcoal mt-0.5 flex-shrink-0"
              aria-label={t('common.close', 'Close')}
            >
              <ThiingsIcon name="close" pxSize={20} />
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="px-7 py-5 space-y-4">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggle(0)}
              className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                checked[0] ? 'bg-burgundy border-burgundy' : 'border-[#D6D3D1] hover:border-burgundy'
              }`}
              aria-label={t('launchChecklist.markStep', 'Mark step {{n}}', { n: 1 })}
            >
              {checked[0] && <ThiingsIcon name="check" pxSize={12} className="text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${checked[0] ? 'line-through text-[#A8A29E]' : 'text-deep-charcoal'}`}>
                {t('launch.step1Title', 'Test your voice agent')}
              </p>
              <p className="text-xs text-[#A8A29E] mt-0.5">
                {t('launch.step1Hint', 'Call your agent and make a test booking')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/host-dashboard/voice-settings')}
                className="mt-2 text-xs font-semibold text-burgundy hover:underline"
              >
                {t('launch.step1CTA', 'Open Voice Settings →')}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggle(1)}
              className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                checked[1] ? 'bg-burgundy border-burgundy' : 'border-[#D6D3D1] hover:border-burgundy'
              }`}
              aria-label={t('launchChecklist.markStep', 'Mark step {{n}}', { n: 2 })}
            >
              {checked[1] && <ThiingsIcon name="check" pxSize={12} className="text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${checked[1] ? 'line-through text-[#A8A29E]' : 'text-deep-charcoal'}`}>
                {t('launch.step2Title', 'Share your booking link')}
              </p>
              {bookingSlug ? (
                <div className="mt-2 flex items-center gap-2 bg-[#FAFAF9] border border-glass-border-dark rounded-lg px-3 py-2">
                  <span className="text-xs text-[#706A65] truncate flex-1">{bookingUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs font-semibold text-burgundy hover:text-burgundy-dark flex-shrink-0 transition-colors"
                  >
                    {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[#A8A29E] mt-0.5">
                  {t('launch.step2Loading', 'Loading your booking link…')}
                </p>
              )}
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggle(2)}
              className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                checked[2] ? 'bg-burgundy border-burgundy' : 'border-[#D6D3D1] hover:border-burgundy'
              }`}
              aria-label={t('launchChecklist.markStep', 'Mark step {{n}}', { n: 3 })}
            >
              {checked[2] && <ThiingsIcon name="check" pxSize={12} className="text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${checked[2] ? 'line-through text-[#A8A29E]' : 'text-deep-charcoal'}`}>
                {t('launch.step3Title', 'Add your first reservation')}
              </p>
              <p className="text-xs text-[#A8A29E] mt-0.5">
                {t('launch.step3Hint', 'Use the dashboard to manually add a booking')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 pb-7 pt-2">
          <button
            type="button"
            onClick={handleDismiss}
            className={`w-full py-3 rounded-full text-sm font-semibold transition-colors ${
              allChecked
                ? 'bg-burgundy text-white hover:bg-burgundy-dark'
                : 'bg-[#F5F5F4] text-[#706A65] hover:bg-[#E7E5E4]'
            }`}
          >
            {allChecked
              ? t('launch.allDone', "All done — let's go!")
              : t('launch.skipForNow', 'Skip for now')}
          </button>
        </div>
      </div>
    </div>
  );
}
