/**
 * PersonaPreview - Phase 3 Persona Card
 *
 * Displays the generated AI persona with approve/edit/restart options.
 * Renders data from the restaurant_profile JSONB structure returned by the backend.
 */

import { motion } from 'framer-motion';
import type { PersonaPreview as PersonaPreviewType } from '../../../types/restaurant-learning.types';

interface PersonaPreviewProps {
  persona: PersonaPreviewType;
  onApprove: () => void;
  onEdit: () => void;
  onRestart: () => void;
  isLoading?: boolean;
}

// Safe accessor for nested profile data
function getProfileField(profile: Record<string, unknown>, ...path: string[]): unknown {
  let current: unknown = profile;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getStringArray(profile: Record<string, unknown>, ...path: string[]): string[] {
  const val = getProfileField(profile, ...path);
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  return [];
}

function getString(profile: Record<string, unknown>, ...path: string[]): string {
  const val = getProfileField(profile, ...path);
  return typeof val === 'string' ? val : '';
}

export default function PersonaPreview({
  persona,
  onApprove,
  onEdit,
  onRestart,
  isLoading,
}: PersonaPreviewProps) {
  const profile = persona.restaurant_profile || {};

  const tone = getString(profile, 'communication_style', 'tone');
  const greetingStyle = getString(profile, 'communication_style', 'greeting_style');
  const personalityTraits = getStringArray(profile, 'communication_style', 'personality_traits');
  const phrasesToUse = getStringArray(profile, 'communication_style', 'phrases_to_use');
  const uniqueDifferentiators = getStringArray(profile, 'unique_differentiators');
  const thingsToKnow = getStringArray(profile, 'things_to_know');
  const greetingPreview = persona.greeting_preview || getString(profile, 'greeting_preview');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-[#9F1239]/10 rounded-full mb-3">
          <svg className="w-7 h-7 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <h3 className="font-serif text-xl font-bold text-[#1C1917]">Your AI Persona</h3>
        <p className="text-sm text-[#57534E] mt-1">Here is how your AI will represent your restaurant</p>
      </div>

      {/* Persona Summary */}
      {persona.persona_summary && (
        <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl px-4 py-3 text-sm text-[#1C1917]">
          {persona.persona_summary}
        </div>
      )}

      {/* Persona Card */}
      <div className="bg-[#F5F5F4] border border-[#E7E5E4] rounded-2xl p-6 space-y-5">
        {/* Tone */}
        {tone && (
          <div>
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-1">Tone</h4>
            <p className="text-sm text-[#1C1917]">{tone}</p>
          </div>
        )}

        {/* Greeting Style */}
        {greetingStyle && (
          <div>
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-1">Greeting Style</h4>
            <p className="text-sm text-[#1C1917]">{greetingStyle}</p>
          </div>
        )}

        {/* Personality Traits */}
        {personalityTraits.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-2">Personality Traits</h4>
            <div className="flex flex-wrap gap-2">
              {personalityTraits.map(trait => (
                <span
                  key={trait}
                  className="px-3 py-1 text-xs font-medium bg-white border border-[#E7E5E4] rounded-full text-[#1C1917]"
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* What Makes Us Unique */}
        {uniqueDifferentiators.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-2">What Makes Us Unique</h4>
            <ul className="space-y-1">
              {uniqueDifferentiators.map((item, i) => (
                <li key={i} className="text-sm text-[#1C1917] flex items-start gap-2">
                  <span className="text-[#9F1239] mt-0.5 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Things to Know */}
        {thingsToKnow.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-2">Key Knowledge</h4>
            <ul className="space-y-1">
              {thingsToKnow.map((item, i) => (
                <li key={i} className="text-sm text-[#1C1917] flex items-start gap-2">
                  <span className="text-[#9F1239] mt-0.5 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sample Greeting */}
        {greetingPreview && (
          <div className="bg-white border border-[#E7E5E4] rounded-xl p-4">
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-2">Sample Greeting</h4>
            <p className="text-sm text-[#1C1917] italic">&ldquo;{greetingPreview}&rdquo;</p>
          </div>
        )}

        {/* Characteristic Phrases */}
        {phrasesToUse.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[#57534E] uppercase tracking-wider mb-2">Characteristic Phrases</h4>
            <div className="space-y-2">
              {phrasesToUse.map((phrase, i) => (
                <div key={i} className="bg-white border border-[#E7E5E4] rounded-xl p-3">
                  <p className="text-sm text-[#1C1917] italic">&ldquo;{phrase}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={isLoading}
          className="flex-1 px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Looks Great
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={isLoading}
          className="px-6 py-3 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2"
        >
          Refine More
        </button>
        <button
          type="button"
          onClick={onRestart}
          disabled={isLoading}
          className="px-4 py-3 text-sm text-[#A8A29E] hover:text-[#57534E] font-medium transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2 underline underline-offset-2"
          aria-label="Discard and start the learning process over"
        >
          Start Over
        </button>
      </div>
    </motion.div>
  );
}
