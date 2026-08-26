import { useEffect, useState, type ReactNode } from 'react';

/**
 * Reusable horizontal tab bar for split-pane settings pages. Designed to break
 * up "wall of 10 sections" pages (Voice + WhatsApp settings) into focused
 * tabs without changing how the underlying save/dirty state flows.
 *
 * Implementation notes:
 *   - All tab content is mounted at all times; the inactive panes are
 *     visually hidden via Tailwind `hidden`. This means React Query caches
 *     stay warm and any in-progress pending edits (isDirty, pendingVoiceId,
 *     etc.) survive tab switches — switching tabs never loses changes.
 *   - The active tab persists in the URL hash (e.g. `#voice`) so a
 *     deep-link or page refresh lands the user on the same tab.
 *   - Mobile uses horizontal-scroll instead of overflowing/wrapping the row.
 */

export interface SettingsTabDef {
  id: string;            // URL hash identifier (e.g. "voice")
  label: string;         // visible label (already localized by caller)
  icon?: ReactNode;      // optional leading icon
  badge?: ReactNode;     // optional trailing badge (e.g. "Pending")
  content: ReactNode;    // the panel
}

interface SettingsTabsProps {
  tabs: SettingsTabDef[];
  defaultTabId?: string;
  /** Optional storage key for the URL hash — useful when multiple SettingsTabs render on the same page (very rare). */
  hashKey?: string;
  className?: string;
}

export default function SettingsTabs({ tabs, defaultTabId, hashKey, className = '' }: SettingsTabsProps) {
  const resolvedDefault = defaultTabId ?? tabs[0]?.id;

  // Initialize from URL hash if it matches a known tab; otherwise fall back
  // to the explicit default. Guarded for SSR / non-browser environments.
  const readInitialTab = (): string => {
    if (typeof window === 'undefined') return resolvedDefault;
    const raw = window.location.hash.replace(/^#/, '');
    const desired = hashKey ? raw.split(':').slice(1).join(':') : raw;
    if (desired && tabs.some((t) => t.id === desired)) return desired;
    return resolvedDefault;
  };

  const [activeId, setActiveId] = useState<string>(readInitialTab);

  // Sync URL hash when the user clicks a tab. Use replaceState to avoid
  // polluting back-button history with every tab change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = hashKey ? `${hashKey}:${activeId}` : activeId;
    if (window.location.hash !== `#${hash}`) {
      window.history.replaceState(null, '', `#${hash}`);
    }
  }, [activeId, hashKey]);

  // Listen for external hash changes (back/forward, anchor links elsewhere).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const raw = window.location.hash.replace(/^#/, '');
      const desired = hashKey ? raw.split(':').slice(1).join(':') : raw;
      if (desired && tabs.some((t) => t.id === desired)) setActiveId(desired);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [hashKey, tabs]);

  // Roving-tabindex arrow-key navigation (WAI-ARIA tabs pattern). The
  // tabIndex juggling was already here but without key handlers the roving
  // index was a trap: keyboard users couldn't reach inactive tabs at all.
  const handleTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeId);
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') nextIdx = 0;
    if (e.key === 'End') nextIdx = tabs.length - 1;
    const next = tabs[nextIdx];
    if (next) {
      setActiveId(next.id);
      document.getElementById(`settings-tab-${next.id}`)?.focus();
    }
  };

  return (
    <div className={className}>
      {/* Tab bar — wraps into multiple rows instead of horizontal scroll.
          The audit found 6-tab pages (Voice settings) overflowed with no
          visible scroll affordance: desktop users never realised more tabs
          existed past the fold. Wrapping rows (GitHub-settings style) keep
          every tab visible at every width. */}
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={handleTablistKeyDown}
        className="flex flex-wrap gap-x-1 gap-y-0 border-b border-[#E7E5E4] -mx-1 px-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-burgundy text-deep-charcoal'
                  : 'border-transparent text-warm-stone hover:text-deep-charcoal hover:border-border-gray'
              }`}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span className="flex-shrink-0">{tab.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Panes — every pane stays in the DOM (hidden via Tailwind) so save
          state and pending edits survive tab switches. */}
      <div className="pt-6">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={`settings-panel-${tab.id}`}
              aria-labelledby={`settings-tab-${tab.id}`}
              hidden={!isActive}
            >
              {tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
