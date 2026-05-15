/**
 * Step 5: Import Customer History
 *
 * Optional onboarding step that lets restaurant managers upload a CSV
 * of past customers so the AI has historical context from day 1.
 *
 * CSV format: name, phone, email, visits, last_visit, avg_spend
 * Only `phone` is required — all other columns are optional.
 *
 * The step is entirely optional — "Skip for now" proceeds without any upload.
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { api } from '../../services/api';

interface Step5ImportHistoryProps {
  restaurantId: string;
  onNext: () => void;
}

interface ImportResult {
  imported: number;
  skipped: number;
  vip_count: number;
  regular_count: number;
  message: string;
}

export default function Step5ImportHistory({ onNext }: Step5ImportHistoryProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('onboarding.importCsvOnly'));
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const { data } = await api.post<ImportResult>('/import-history', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (err: unknown) {
      const backendError =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(backendError || t('onboarding.importError'));
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Success state
  if (result) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-8"
      >
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-burgundy/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ThiingsIcon name="check-circle" pxSize={40} className="text-burgundy" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">
            {t('onboarding.importDone', { count: result.imported })}
          </h2>
          <div className="space-y-1 mt-3">
            {result.vip_count > 0 && (
              <p className="text-stone-gray text-sm">
                {t('onboarding.importVips', { count: result.vip_count })}
              </p>
            )}
            {result.regular_count > 0 && (
              <p className="text-stone-gray text-sm">
                {t('onboarding.importRegulars', { count: result.regular_count })}
              </p>
            )}
            {result.skipped > 0 && (
              <p className="text-stone-gray text-xs">
                {t('onboarding.importSkipped', { count: result.skipped })}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="w-full px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300"
        >
          {t('onboarding.continue')}
          <ThiingsIcon name="arrow-right" pxSize={20} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">
          {t('onboarding.importTitle')}
        </h2>
        <p className="text-stone-gray text-sm">
          {t('onboarding.importSubtitle')}
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-burgundy bg-burgundy/5'
            : 'border-border-gray hover:border-warm-stone'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <ThiingsIcon name="upload" pxSize={32} className="text-warm-stone mx-auto mb-3" />
        {isUploading ? (
          <div className="flex items-center justify-center gap-2">
            <div
              aria-hidden="true"
              className="w-4 h-4 border-2 border-burgundy/30 border-t-burgundy rounded-full animate-spin"
            />
            <p className="text-sm text-stone-gray">{t('onboarding.importing')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-deep-charcoal">
              {t('onboarding.dropCsvHere')}
            </p>
            <p className="mt-1 text-xs text-warm-stone">
              {t('onboarding.csvFormat')}
            </p>
            <p className="mt-2 text-[11px] text-warm-stone/70">
              {t('onboarding.csvOnlyHint', 'Only .csv files. Need only the phone column — the rest are optional.')}
            </p>
          </>
        )}
      </div>

      {/* Format hint — a friendly table preview + a downloadable template.
          The previous version showed `name, phone, email, visits, last_visit,
          avg_spend` as raw snake_case to a non-technical owner — most users
          guessed wrong on date format or currency and skipped the step. */}
      <div className="rounded-xl bg-soft-gray p-4 text-xs text-stone-gray space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-deep-charcoal">{t('onboarding.expectedFormat')}</p>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              [
                'name,phone,email,visits,last_visit,avg_spend',
                'Maria Silva,+5511999990001,maria@example.com,5,2025-12-12,180',
                'João Pereira,+5511999990002,joao@example.com,2,2026-01-04,95',
              ].join('\n')
            )}`}
            download="seatable-import-template.csv"
            className="text-[11px] font-semibold text-burgundy hover:text-burgundy-dark underline underline-offset-2"
          >
            {t('onboarding.downloadTemplate', 'Download example file')}
          </a>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-deep-charcoal">
                <th className="font-semibold px-2 py-1">{t('onboarding.csvCol.name', 'Name')}</th>
                <th className="font-semibold px-2 py-1">{t('onboarding.csvCol.phone', 'Phone')} *</th>
                <th className="font-semibold px-2 py-1">{t('onboarding.csvCol.email', 'Email')}</th>
                <th className="font-semibold px-2 py-1">{t('onboarding.csvCol.visits', 'Visits')}</th>
                <th className="font-semibold px-2 py-1">{t('onboarding.csvCol.lastVisit', 'Last visit (YYYY-MM-DD)')}</th>
                <th className="font-semibold px-2 py-1">{t('onboarding.csvCol.avgSpend', 'Average spend')}</th>
              </tr>
            </thead>
            <tbody className="text-warm-stone">
              <tr>
                <td className="px-2 py-1">Maria Silva</td>
                <td className="px-2 py-1">+5511999990001</td>
                <td className="px-2 py-1">maria@…</td>
                <td className="px-2 py-1">5</td>
                <td className="px-2 py-1">2025-12-12</td>
                <td className="px-2 py-1">180</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>{t('onboarding.formatHint')}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <ThiingsIcon name="alert-circle" pxSize={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={isUploading}
          className="text-sm text-warm-stone hover:text-deep-charcoal transition-colors disabled:opacity-50"
        >
          {t('onboarding.skipForNow')}
        </button>
      </div>
    </motion.div>
  );
}
