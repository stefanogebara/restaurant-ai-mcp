/**
 * ExtractionProgress - Topics Covered Indicator
 *
 * Shows progress through 8 interview topics with filled/empty dots.
 */

import { motion } from 'framer-motion';

const ALL_TOPICS = [
  'Cuisine & Menu',
  'Ambiance',
  'Service Style',
  'Target Audience',
  'Unique Selling Points',
  'Policies',
  'Specials & Events',
  'Brand Voice',
];

interface ExtractionProgressProps {
  topicsCovered: string[];
}

export default function ExtractionProgress({ topicsCovered }: ExtractionProgressProps) {
  const coveredCount = Math.min(topicsCovered.length, ALL_TOPICS.length);
  const nextTopic = coveredCount < ALL_TOPICS.length ? ALL_TOPICS[coveredCount] : null;

  return (
    <div className="px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#57534E]">Topics covered</span>
        <span className="text-xs font-bold text-[#9F1239]">{coveredCount}/{ALL_TOPICS.length}</span>
      </div>

      <div
        className="flex gap-1.5"
        role="list"
        aria-label={`Interview progress: ${coveredCount} of ${ALL_TOPICS.length} topics covered`}
      >
        {ALL_TOPICS.map((topic, index) => {
          const isCovered = index < coveredCount;
          return (
            <motion.div
              key={topic}
              role="listitem"
              aria-label={`${topic}: ${isCovered ? 'covered' : 'not yet covered'}`}
              initial={false}
              animate={{
                backgroundColor: isCovered ? '#9F1239' : '#E7E5E4',
                scale: isCovered ? [1, 1.2, 1] : 1,
              }}
              transition={{ duration: 0.3 }}
              className="flex-1 h-1.5 rounded-full"
              title={topic}
            />
          );
        })}
      </div>

      {nextTopic && (
        <p className="mt-2 text-xs text-[#A8A29E]">
          Next: <span className="text-[#57534E] font-medium">{nextTopic}</span>
        </p>
      )}

      {coveredCount === ALL_TOPICS.length && (
        <p className="mt-2 text-xs font-semibold text-[#9F1239]">All topics covered — ready to generate persona</p>
      )}
    </div>
  );
}
