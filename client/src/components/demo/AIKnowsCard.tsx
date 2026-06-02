/**
 * AIKnowsCard
 *
 * "Your AI already knows your restaurant" — surfaces the enriched data
 * (menu items extracted from the website, popular dishes mentioned in
 * reviews, vibe tags, praise/complaint themes) so the user trusts that
 * when they sign up, the AI receptionist will actually use this.
 *
 * Renders only when at least one enrichment section is present. Defensive
 * about the shape — every nested field is optional.
 */

import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';

export interface EnrichedMenuItem {
  name?: string;
  price?: string | null;
  description?: string | null;
  category?: string | null;
}

export interface EnrichedMenu {
  menu_items?: EnrichedMenuItem[];
  popular_dishes?: string[];
  social_handles?: { instagram?: string | null; facebook?: string | null };
  hours_text?: string | null;
  source_url?: string;
}

export interface EnrichedInsights {
  popular_dishes?: string[];
  praise_themes?: string[];
  complaint_themes?: string[];
  vibe_tags?: string[];
  ai_voice_notes?: string[];
}

interface AIKnowsCardProps {
  menu?: EnrichedMenu | null;
  insights?: EnrichedInsights | null;
}

export default function AIKnowsCard({ menu, insights }: AIKnowsCardProps) {
  const { t } = useTranslation();

  // Combine popular dishes from both sources, de-dup case-insensitively.
  const allPopular = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of [...(insights?.popular_dishes || []), ...(menu?.popular_dishes || [])]) {
      const key = d?.toLowerCase()?.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(d);
      }
      if (out.length >= 5) break;
    }
    return out;
  })();

  const menuItems = (menu?.menu_items || []).filter(m => m?.name).slice(0, 6);
  const praise = (insights?.praise_themes || []).filter(Boolean).slice(0, 4);
  const complaints = (insights?.complaint_themes || []).filter(Boolean).slice(0, 4);
  const vibeTags = (insights?.vibe_tags || []).filter(Boolean).slice(0, 4);
  const voiceNotes = (insights?.ai_voice_notes || []).filter(Boolean).slice(0, 3);

  const hasAnything =
    allPopular.length > 0 ||
    menuItems.length > 0 ||
    praise.length > 0 ||
    complaints.length > 0 ||
    vibeTags.length > 0 ||
    voiceNotes.length > 0;

  if (!hasAnything) return null;

  return (
    <section className="bg-warm-white border border-burgundy/15 rounded-2xl p-6 space-y-5">
      <header>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-burgundy bg-burgundy/[0.08] px-2.5 py-1 rounded-full mb-3">
          <ThiingsIcon name="sparkles" size="xs" />
          {t('demo.aiKnows.badge', "Your AI is already trained")}
        </span>
        <h2 className="text-base font-semibold text-deep-charcoal">
          {t('demo.aiKnows.heading', "Here's what your AI receptionist already knows")}
        </h2>
        <p className="text-xs text-warm-stone mt-1">
          {t('demo.aiKnows.subtitle', "We read your website and recent reviews so the AI can actually help guests — not just answer with generic scripts.")}
        </p>
      </header>

      {/* Vibe tags — quick scannable identity */}
      {vibeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-warm-stone self-center mr-1">
            {t('demo.aiKnows.theVibe', 'The vibe:')}
          </span>
          {vibeTags.map((tag, i) => (
            <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white border border-burgundy/20 text-burgundy">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Popular dishes */}
        {allPopular.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-stone mb-2">
              {t('demo.aiKnows.signatureDishes', 'Signature dishes')}
            </p>
            <ul className="space-y-1.5 text-sm text-deep-charcoal">
              {allPopular.map((dish, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="text-burgundy text-base leading-tight">•</span>
                  <span>{dish}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Praise themes — what guests love */}
        {praise.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-stone mb-2">
              {t('demo.aiKnows.whatGuestsLove', 'What guests love')}
            </p>
            <ul className="space-y-1.5 text-sm text-deep-charcoal">
              {praise.map((theme, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="text-emerald-600 text-base leading-tight">✓</span>
                  <span>{theme}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Complaint themes — what to handle */}
        {complaints.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-stone mb-2">
              {t('demo.aiKnows.handleProactively', 'Handle proactively')}
            </p>
            <ul className="space-y-1.5 text-sm text-deep-charcoal">
              {complaints.map((theme, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="text-amber-600 text-base leading-tight">!</span>
                  <span>{theme}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Menu items grid */}
        {menuItems.length > 0 && (
          <div className={praise.length > 0 || complaints.length > 0 ? '' : 'md:col-span-2'}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-stone mb-2">
              {t('demo.aiKnows.menuPreview', 'Menu (from your website)')}
            </p>
            <ul className="space-y-1.5 text-sm">
              {menuItems.map((item, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 text-deep-charcoal">
                  <span className="truncate">{item.name}</span>
                  {item.price && (
                    <span className="text-xs font-medium text-warm-stone whitespace-nowrap">{item.price}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* AI voice notes — show how the AI will use this */}
      {voiceNotes.length > 0 && (
        <div className="pt-3 border-t border-burgundy/10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-stone mb-2">
            {t('demo.aiKnows.aiWillSay', 'Your AI will know to:')}
          </p>
          <ul className="space-y-1 text-xs text-stone-700">
            {voiceNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden="true" className="text-burgundy">→</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
