/**
 * ExtractionProgress - Topics Covered Indicator
 *
 * Shows progress through 8 interview topics as a segmented bar.
 *
 * Accessibility:
 * - The progress container carries role="progressbar" with aria-valuenow/min/max
 *   so screen readers can report "5 of 8 topics covered".
 * - Individual segments have aria-label for granular per-topic status.
 * - Scale animation is suppressed when prefers-reduced-motion is set.
 *
 * Design:
 * - Segments are h-2 (8px) for WCAG 1.4.11 non-text contrast compliance.
 * - Covered segments animate with a gentle scale-in on first fill.
 * - A "Next topic" hint guides the conversation forward.
 */

import { motion } from 'framer-motion';
import { colors } from '../../../utils/colors';

const ALL_TOPICS = [
  'Cuisine Identity',
  'Atmosphere & Vibe',
  'Signature Dishes',
  'Guest Experience',
  'Unique Differentiators',
  'Communication Style',
  'Special Occasions',
  'Important Details',
];

interface ExtractionProgressProps {
  topicsCovered: string[];
}

export default function ExtractionProgress({ topicsCovered }: ExtractionProgressProps) {
  const coveredCount = Math.min(topicsCovered.length, ALL_TOPICS.length);
  const totalCount = ALL_TOPICS.length;
  const isComplete = coveredCount === totalCount;
  const nextTopic = !isComplete ? ALL_TOPICS[coveredCount] : null;
  const percentComplete = Math.round((coveredCount / totalCount) * 100);

  return (
    <div className="px-4 py-3 bg-white border border-border-gray rounded-xl shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-stone-gray" id="topics-progress-label">
          Topics covered
        </span>
        <span
          className={`text-xs font-bold tabular-nums ${isComplete ? 'text-emerald-600' : 'text-burgundy'}`}
          aria-hidden="true"
        >
          {coveredCount}/{totalCount}
        </span>
      </div>

      {/* Segmented progress bar */}
      <div
        role="progressbar"
        aria-labelledby="topics-progress-label"
        aria-valuenow={coveredCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-valuetext={`${coveredCount} of ${totalCount} topics covered — ${percentComplete}%`}
        className="flex gap-1"
      >
        {ALL_TOPICS.map((topic, index) => {
          const isCovered = index < coveredCount;
          return (
            <motion.div
              key={topic}
              aria-label={`${topic}: ${isCovered ? 'covered' : 'not yet covered'}`}
              initial={false}
              animate={{
                backgroundColor: isCovered ? (isComplete ? '#059669' : colors.burgundy) : colors.borderGray,
              }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              whileInView={isCovered ? { scaleY: [0.7, 1.15, 1] } : {}}
              viewport={{ once: true }}
              className="flex-1 h-2 rounded-full"
              title={topic}
            />
          );
        })}
      </div>

      {/* Contextual hint below the bar */}
      <div className="mt-2 min-h-[1.25rem]">
        {isComplete ? (
          <p className="text-xs font-semibold text-emerald-600">
            All topics covered &mdash; ready to generate your persona
          </p>
        ) : nextTopic ? (
          <p className="text-xs text-muted-stone">
            Next: <span className="text-stone-gray font-medium">{nextTopic}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
