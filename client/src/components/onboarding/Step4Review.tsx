/**
 * Step 4: Review & Launch
 *
 * Summary card showing all configured settings with edit links.
 * "Launch My Restaurant" CTA to complete onboarding.
 */

import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';

interface Step4ReviewProps extends OnboardingStepProps {
  onComplete?: () => void;
  isSubmitting?: boolean;
  goToStep?: (step: number) => void;
}

export default function Step4Review({ data, onBack, onComplete, isSubmitting, goToStep }: Step4ReviewProps) {
  const totalTables = data.areas.reduce((sum, area) => sum + area.tables.reduce((s, t) => s + t.count, 0), 0);
  const totalCapacity = data.areas.reduce((sum, area) => sum + area.tables.reduce((s, t) => s + t.capacity * t.count, 0), 0);

  const openDays = data.business_hours.filter(h => h.is_open).length;

  const sections = [
    {
      title: 'Restaurant Info',
      step: 1,
      items: [
        { label: 'Name', value: data.restaurant_name },
        { label: 'Type', value: data.restaurant_type },
        { label: 'Location', value: `${data.city}, ${data.country}` },
      ],
    },
    {
      title: 'Contact & Hours',
      step: 2,
      items: [
        { label: 'Phone', value: data.phone_number },
        { label: 'Email', value: data.email },
        ...(data.website ? [{ label: 'Website', value: data.website }] : []),
        { label: 'Open days', value: `${openDays} days/week` },
      ],
    },
    {
      title: 'Tables & Settings',
      step: 3,
      items: [
        { label: 'Areas', value: data.areas.map(a => a.name).join(', ') },
        { label: 'Tables', value: `${totalTables} tables (${totalCapacity} seats)` },
        { label: 'Booking window', value: `${data.advance_booking_days} days` },
        { label: 'Buffer time', value: `${data.buffer_time} minutes` },
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-serif text-2xl font-bold text-[#1C1917] mb-2">Review & Launch</h2>
        <p className="text-[#57534E] text-sm">Everything looks good? Let's get your restaurant live!</p>
      </div>

      {/* Summary Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#1C1917]">{section.title}</h3>
              {goToStep && (
                <button
                  onClick={() => goToStep(section.step)}
                  className="text-xs font-medium text-[#9F1239] hover:text-[#881337] transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between items-baseline">
                  <span className="text-sm text-[#78716C]">{item.label}</span>
                  <span className="text-sm font-medium text-[#1C1917] text-right max-w-[60%] truncate">
                    {item.value || '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AI & Voice Note */}
      <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-[#9F1239] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-[#57534E]">
            <p className="font-medium text-[#1C1917] mb-1">After launch, you can customize:</p>
            <ul className="space-y-1">
              <li>AI voice personality and language</li>
              <li>AI learning from your restaurant profile</li>
              <li>Team member access and roles</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={onComplete}
          disabled={isSubmitting}
          className="px-8 py-3.5 bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300 shadow-lg shadow-[#9F1239]/20"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              Launch My Restaurant
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
