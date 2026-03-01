/**
 * Step 5: Teach Your AI
 *
 * Optional onboarding step that lets restaurant managers answer a set of
 * guided questions and optionally upload a document so the AI manager
 * is pre-loaded with knowledge about their restaurant.
 *
 * The interview answers are combined into a single text payload and
 * POSTed to /api/manager-documents as multipart/form-data.  The step is
 * entirely optional — "Skip for now" proceeds to the next step without
 * any API call.
 */

import { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import ThiingsIcon from '../common/ThiingsIcon';
import { api } from '../../services/api';

interface Step5TeachAIProps {
  restaurantId: string;
  onNext: () => void;
}

const INTERVIEW_QUESTIONS = [
  "What's one thing you're most proud of about your restaurant?",
  'What are your busiest days and times?',
  'Do you have any signature dishes or specialties?',
  "What's your approach to handling no-shows?",
  'What would you like your AI assistant to help with most?',
];

interface DocumentUploadResponse {
  success: boolean;
  facts_stored?: number;
  message?: string;
}

export default function Step5TeachAI({ restaurantId: _restaurantId, onNext }: Step5TeachAIProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factsStored, setFactsStored] = useState<number | null>(null);

  function updateAnswer(index: number, value: string) {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  }

  const hasAnyAnswer = INTERVIEW_QUESTIONS.some((_, i) => answers[i]?.trim());

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    try {
      let totalFacts = 0;

      // Build text from answered questions — reduce preserves original indices
      const interviewText = INTERVIEW_QUESTIONS
        .reduce<string[]>((acc, q, i) => {
          const answer = answers[i]?.trim();
          if (answer) acc.push(`Q: ${q}\nA: ${answer}`);
          return acc;
        }, [])
        .join('\n\n');

      if (interviewText) {
        const formData = new FormData();
        const blob = new Blob([interviewText], { type: 'text/plain' });
        formData.append('file', blob, 'onboarding-interview.txt');
        const res = await api.post<DocumentUploadResponse>('/manager-documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        totalFacts += res.data.facts_stored ?? 0;
      }

      // Upload optional document
      if (file) {
        const formData = new FormData();
        formData.append('file', file, file.name);
        const res = await api.post<DocumentUploadResponse>('/manager-documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        totalFacts += res.data.facts_stored ?? 0;
      }

      setFactsStored(totalFacts);
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.error as string) || 'Failed to save facts. You can try again later.'
        : err instanceof Error ? err.message : 'Failed to save facts. You can try again later.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  // Success state
  if (factsStored !== null) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-8"
      >
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-burgundy/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ThiingsIcon name="check-circle" pxSize={40} className="text-burgundy" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Your AI is ready!</h2>
          <p className="text-stone-gray text-sm mb-1">
            {factsStored > 0
              ? `${factsStored} fact${factsStored !== 1 ? 's' : ''} saved to your AI manager.`
              : 'Your answers have been saved to your AI manager.'}
          </p>
          <p className="text-stone-gray text-sm">
            You can teach it more anytime from the dashboard.
          </p>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="w-full px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-burgundy/20"
        >
          Go to Dashboard
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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Teach Your AI</h2>
        <p className="text-stone-gray text-sm">
          Answer a few questions so your AI assistant understands your restaurant. All fields are optional.
        </p>
      </div>

      {/* Interview questions */}
      <div className="space-y-4">
        {INTERVIEW_QUESTIONS.map((question, index) => (
          <div key={index}>
            <label className="block text-sm font-medium text-deep-charcoal mb-1.5">
              {question}
            </label>
            <textarea
              className="w-full border border-border-gray rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy resize-none bg-white placeholder:text-muted-stone transition-colors"
              rows={2}
              placeholder="Optional — skip if you prefer"
              value={answers[index] ?? ''}
              onChange={(e) => updateAnswer(index, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Document upload */}
      <div>
        <label htmlFor="step5-doc-upload" className="block text-sm font-medium text-deep-charcoal mb-1.5">
          Upload a document (menu, policy, etc.) — optional
        </label>
        <input
          id="step5-doc-upload"
          type="file"
          accept=".pdf,.txt,.md,.csv"
          className="text-sm text-stone-gray file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-soft-gray file:text-deep-charcoal hover:file:bg-border-gray cursor-pointer"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file && (
          <p className="text-xs text-stone-gray mt-1">Selected: {file.name}</p>
        )}
      </div>

      {/* Error message */}
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
          disabled={isLoading}
          className="text-sm text-warm-stone hover:text-deep-charcoal transition-colors disabled:opacity-50"
        >
          Skip for now
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || (!hasAnyAnswer && !file)}
          className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-all duration-300"
        >
          {isLoading ? (
            <>
              <div
                aria-hidden="true"
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              />
              Saving...
            </>
          ) : (
            <>
              <ThiingsIcon name="brain" pxSize={16} />
              Teach AI &amp; Continue
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
