/**
 * PersonaPreview - Phase 3 Persona Card
 *
 * Displays the generated AI persona with approve/edit/restart options.
 * Renders data from the restaurant_profile JSONB structure returned by the backend.
 *
 * Accessibility:
 * - The whole section is wrapped in a <section> with an aria-labelledby pointing
 *   to the main heading so screen-reader users get a meaningful landmark.
 * - Action buttons have descriptive aria-labels explaining their effect.
 * - Cards with zero content are not rendered (no invisible empty boxes).
 * - disabled buttons also carry disabled:cursor-not-allowed.
 *
 * Design:
 * - The persona card uses a single neutral background; quote blocks are visually
 *   differentiated via a left accent border rather than a nested white card,
 *   avoiding the double-border visual noise.
 * - "Start Over" is styled as a tertiary action (small, muted text) to prevent
 *   it from competing visually with the primary CTA.
 * - Approve button uses the primary burgundy; Refine More uses the secondary
 *   outlined style.
 */

import { motion } from 'framer-motion';
import type { PersonaPreview as PersonaPreviewType } from '../../../types/restaurant-learning.types';
import ThiingsIcon from '../../common/ThiingsIcon';

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

/** Inline section block — only renders when content is non-empty */
function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-warm-stone uppercase tracking-wider mb-2">
        {label}
      </h4>
      {children}
    </div>
  );
}

export default function PersonaPreview({
  persona,
  onApprove,
  onEdit,
  onRestart,
  isLoading,
}: PersonaPreviewProps) {
  const profile = persona.restaurant_profile ?? {};

  const tone = getString(profile, 'communication_style', 'tone');
  const greetingStyle = getString(profile, 'communication_style', 'greeting_style');
  const personalityTraits = getStringArray(profile, 'communication_style', 'personality_traits');
  const phrasesToUse = getStringArray(profile, 'communication_style', 'phrases_to_use');
  const uniqueDifferentiators = getStringArray(profile, 'unique_differentiators');
  const thingsToKnow = getStringArray(profile, 'things_to_know');
  const greetingPreview = persona.greeting_preview || getString(profile, 'greeting_preview');

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-labelledby="persona-heading"
      className="space-y-5"
    >
      {/* Header */}
      <div className="text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 bg-burgundy/10 rounded-full mb-3"
          aria-hidden="true"
        >
          <ThiingsIcon name="sparkles" pxSize={28} className="text-burgundy" />
        </div>
        <h3 id="persona-heading" className="font-serif text-xl font-bold text-deep-charcoal">
          Your AI Persona
        </h3>
        <p className="text-sm text-stone-gray mt-1">
          Here is how your AI will represent your restaurant
        </p>
      </div>

      {/* Persona summary — highlighted callout */}
      {persona.persona_summary && (
        <div
          className="bg-burgundy/5 border-l-4 border-burgundy/40 rounded-r-xl px-4 py-3 text-sm text-deep-charcoal leading-relaxed"
          aria-label="Persona summary"
        >
          {persona.persona_summary}
        </div>
      )}

      {/* Persona detail card */}
      <div className="bg-soft-gray border border-border-gray rounded-2xl p-5 space-y-5 shadow-sm">

        {/* Tone */}
        {tone && (
          <ProfileSection label="Tone">
            <p className="text-sm text-deep-charcoal">{tone}</p>
          </ProfileSection>
        )}

        {/* Greeting Style */}
        {greetingStyle && (
          <ProfileSection label="Greeting Style">
            <p className="text-sm text-deep-charcoal">{greetingStyle}</p>
          </ProfileSection>
        )}

        {/* Personality Traits */}
        {personalityTraits.length > 0 && (
          <ProfileSection label="Personality Traits">
            <div className="flex flex-wrap gap-2">
              {personalityTraits.map(trait => (
                <span
                  key={trait}
                  className="px-3 py-1 text-xs font-medium bg-white border border-border-gray rounded-full text-deep-charcoal shadow-sm"
                >
                  {trait}
                </span>
              ))}
            </div>
          </ProfileSection>
        )}

        {/* What Makes Us Unique */}
        {uniqueDifferentiators.length > 0 && (
          <ProfileSection label="What Makes Us Unique">
            <ul className="space-y-1.5" aria-label="Unique differentiators">
              {uniqueDifferentiators.map((item, i) => (
                <li key={i} className="text-sm text-deep-charcoal flex items-start gap-2">
                  <ThiingsIcon name="check" pxSize={14} className="text-burgundy mt-0.5 flex-shrink-0" aria-hidden={true} />
                  {item}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}

        {/* Key Knowledge */}
        {thingsToKnow.length > 0 && (
          <ProfileSection label="Key Knowledge">
            <ul className="space-y-1.5" aria-label="Key knowledge points">
              {thingsToKnow.map((item, i) => (
                <li key={i} className="text-sm text-deep-charcoal flex items-start gap-2">
                  <ThiingsIcon name="check" pxSize={14} className="text-burgundy mt-0.5 flex-shrink-0" aria-hidden={true} />
                  {item}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}

        {/* Sample Greeting — accent border quote style */}
        {greetingPreview && (
          <ProfileSection label="Sample Greeting">
            <blockquote className="border-l-4 border-burgundy/30 pl-3 text-sm text-deep-charcoal italic leading-relaxed">
              &ldquo;{greetingPreview}&rdquo;
            </blockquote>
          </ProfileSection>
        )}

        {/* Characteristic Phrases */}
        {phrasesToUse.length > 0 && (
          <ProfileSection label="Characteristic Phrases">
            <ul className="space-y-2" aria-label="Characteristic phrases">
              {phrasesToUse.map((phrase, i) => (
                <li
                  key={i}
                  className="border-l-4 border-burgundy/20 pl-3 text-sm text-deep-charcoal italic leading-relaxed"
                >
                  &ldquo;{phrase}&rdquo;
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}
      </div>

      {/* Primary + Secondary actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={isLoading}
          aria-label="Approve this persona and continue to the next step"
          className="
            flex-1 px-6 py-3
            bg-burgundy hover:bg-burgundy-dark
            text-white font-bold text-sm
            rounded-xl
            flex items-center justify-center gap-2
            transition-colors duration-150
            active:scale-[0.98]
            focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          <ThiingsIcon name="check" pxSize={16} aria-hidden={true} />
          Looks Great
        </button>

        <button
          type="button"
          onClick={onEdit}
          disabled={isLoading}
          aria-label="Go back to the interview to refine the persona"
          className="
            px-6 py-3
            bg-white hover:bg-soft-gray
            border border-border-gray text-deep-charcoal font-semibold text-sm
            rounded-xl
            transition-colors duration-150
            active:scale-[0.98]
            focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          Refine More
        </button>
      </div>

      {/* Tertiary destructive action — visually de-emphasised */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onRestart}
          disabled={isLoading}
          aria-label="Discard this persona and restart the entire learning process"
          className="
            text-xs text-muted-stone hover:text-warm-stone
            font-medium transition-colors duration-150
            underline underline-offset-2
            focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2 rounded
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Start over from scratch
        </button>
      </div>
    </motion.section>
  );
}
