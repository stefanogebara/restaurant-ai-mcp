/**
 * SurveySettingsPanel — NPS/satisfaction survey config + results summary.
 * Placed in WhatsApp Settings page.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSurveyConfig, useUpdateSurveyConfig, useSurveyResults } from '../../hooks/useSurvey';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';

const DELAY_OPTIONS = [
  { value: 0.5, labelKey: 'dashboard.survey.delay30min', fallback: '30 min' },
  { value: 1, labelKey: 'dashboard.survey.delay1h', fallback: '1 hour' },
  { value: 2, labelKey: 'dashboard.survey.delay2h', fallback: '2 hours' },
  { value: 4, labelKey: 'dashboard.survey.delay4h', fallback: '4 hours' },
  { value: 6, labelKey: 'dashboard.survey.delay6h', fallback: '6 hours' },
  { value: 12, labelKey: 'dashboard.survey.delay12h', fallback: '12 hours' },
  { value: 24, labelKey: 'dashboard.survey.delay24h', fallback: '24 hours' },
];

function RatingBar({ rating, count, max }: { rating: number; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right text-warm-stone">{rating}</span>
      <div className="flex-1 h-2 bg-soft-gray rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-warm-stone">{count}</span>
    </div>
  );
}

export default function SurveySettingsPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: config, isLoading: configLoading } = useSurveyConfig();
  const updateConfig = useUpdateSurveyConfig();
  const { data: results, isLoading: resultsLoading } = useSurveyResults(30);

  const [enabled, setEnabled] = useState(false);
  const [delayHours, setDelayHours] = useState(2);
  const [question, setQuestion] = useState('');
  const [dirty, setDirty] = useState(false);

  // Only hydrate from the server while there are no unsaved local edits.
  // A background React Query refetch (refetchOnWindowFocus is on by default)
  // would otherwise silently clobber what the user just typed.
  useEffect(() => {
    if (config && !dirty) {
      setEnabled(config.enabled);
      setDelayHours(config.delay_hours);
      setQuestion(config.question || '');
    }
  }, [config, dirty]);

  const handleSave = () => {
    updateConfig.mutate(
      { enabled, delay_hours: delayHours, question: question || undefined },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success(t('dashboard.survey.saved', 'Survey settings saved'));
        },
        onError: () => {
          toast.error(t('dashboard.survey.saveFailed', 'Failed to save survey settings'));
        },
      }
    );
  };

  if (configLoading) {
    return (
      <div className="py-5 border-t border-glass-border-dark mt-8 animate-pulse">
        <div className="h-5 bg-stone-200 rounded w-40 mb-4" />
        <div className="h-10 bg-stone-100 rounded" />
      </div>
    );
  }

  const dist = results?.distribution || {};
  const maxCount = Math.max(...Object.values(dist), 1);

  return (
    <div className="py-5 border-t border-glass-border-dark mt-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <ThiingsIcon name="star" pxSize={16} className="text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-deep-charcoal">
          {t('dashboard.survey.title', 'Satisfaction Survey')}
        </h3>
      </div>

      <p className="text-xs text-muted-stone mb-4">
        {t('dashboard.survey.description', 'Send a satisfaction survey via WhatsApp after each visit. Collect star ratings and comments from your guests.')}
      </p>

      {/* Enable toggle */}
      <label className="flex items-center justify-between mb-4 cursor-pointer">
        <span className="text-sm text-deep-charcoal">
          {t('dashboard.survey.enableToggle', 'Enable post-visit survey')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => { setEnabled(!enabled); setDirty(true); }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-rose-500' : 'bg-stone-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </label>

      {enabled && (
        <>
          {/* Delay hours */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-stone mb-1">
              {t('dashboard.survey.sendAfter', 'Send survey after')}
            </label>
            <select
              value={delayHours}
              onChange={(e) => { setDelayHours(parseFloat(e.target.value)); setDirty(true); }}
              className="w-full border border-glass-border-dark rounded-xl px-3 py-2 text-sm text-deep-charcoal"
            >
              {DELAY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey, opt.fallback)}
                </option>
              ))}
            </select>
          </div>

          {/* Custom question */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-stone mb-1">
              {t('dashboard.survey.questionLabel', 'Survey question')}
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => { setQuestion(e.target.value); setDirty(true); }}
              placeholder={t('dashboard.survey.questionPlaceholder', 'Como foi sua experiencia?')}
              className="w-full border border-glass-border-dark rounded-xl px-3 py-2 text-sm text-deep-charcoal"
              maxLength={500}
            />
            <p className="text-[10px] text-muted-stone mt-0.5">
              {t('dashboard.survey.questionHint', 'The question sent to customers after their visit.')}
            </p>
          </div>
        </>
      )}

      {/* Save button */}
      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="w-full py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 mb-4"
        >
          {updateConfig.isPending
            ? t('dashboard.survey.saving', 'Saving...')
            : t('dashboard.survey.saveSettings', 'Save Survey Settings')}
        </button>
      )}

      {/* Results summary */}
      {enabled && !resultsLoading && results && results.count > 0 && (
        <div className="mt-4 pt-4 border-t border-glass-border-dark">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-[#111827] mb-3">
            {t('dashboard.survey.resultsTitle', 'Results (Last 30 Days)')}
          </h4>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-soft-gray rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-deep-charcoal">
                {results.avg_rating ?? '--'}
              </p>
              <p className="text-[10px] text-warm-stone mt-0.5">
                {t('dashboard.survey.avgRating', 'Avg Rating')}
              </p>
            </div>
            <div className="bg-soft-gray rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-deep-charcoal">{results.count}</p>
              <p className="text-[10px] text-warm-stone mt-0.5">
                {t('dashboard.survey.totalResponses', 'Responses')}
              </p>
            </div>
          </div>

          {/* Rating distribution */}
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map(r => (
              <RatingBar key={r} rating={r} count={dist[r] || 0} max={maxCount} />
            ))}
          </div>

          {/* Recent comments */}
          {results.recent.filter(r => r.comment).length > 0 && (
            <div className="mt-4">
              <h5 className="text-[10px] font-medium uppercase tracking-wider text-warm-stone mb-2">
                {t('dashboard.survey.recentComments', 'Recent Comments')}
              </h5>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {results.recent
                  .filter(r => r.comment)
                  .slice(0, 5)
                  .map(r => (
                    <div key={r.id} className="bg-soft-gray rounded-lg px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs text-amber-500">
                          {t(`dashboard.survey.star${r.rating}`, String(r.rating))}
                        </span>
                        <span className="text-[10px] text-warm-stone">
                          {r.customer_name || t('dashboard.survey.anonymous', 'Anonymous')}
                        </span>
                      </div>
                      <p className="text-xs text-deep-charcoal">{r.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {enabled && !resultsLoading && results && results.count === 0 && (
        <div className="mt-4 pt-4 border-t border-glass-border-dark text-center py-6">
          <p className="text-xs text-muted-stone">
            {t('dashboard.survey.noResponses', 'No survey responses yet. Results will appear here after guests respond.')}
          </p>
        </div>
      )}
    </div>
  );
}
