import { useEffect, useRef, useState } from 'react';
import SettingsTabs, { type SettingsTabDef } from '../common/SettingsTabs';

/** Keep the selected tab visible when a mobile deep link opens a later channel. */
export default function VoiceSettingsTabs({ tabs }: { tabs: SettingsTabDef[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const list = container.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) return;
    const updateEdges = () => setEdges({
      start: list.scrollLeft < 3,
      end: list.scrollWidth - list.clientWidth - list.scrollLeft < 3,
    });
    const showSelected = () => {
      const selected = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!selected || list.scrollWidth <= list.clientWidth) {
        updateEdges();
        return;
      }
      const selectedLeft = selected.getBoundingClientRect().left;
      const listLeft = list.getBoundingClientRect().left;
      list.scrollLeft += selectedLeft - listLeft - (list.clientWidth - selected.clientWidth) / 2;
      updateEdges();
    };
    showSelected();
    list.addEventListener('scroll', updateEdges, { passive: true });
    const observer = new MutationObserver(showSelected);
    observer.observe(list, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', updateEdges);
    };
  }, []);

  return (
    <div ref={root}>
      <div className="relative">
        <SettingsTabs
          tabs={tabs}
          hashKey="voice-settings"
          className="[&_[role=tablist]]:flex-nowrap [&_[role=tablist]]:gap-x-0 [&_[role=tablist]]:overflow-x-auto [&_[role=tablist]]:overscroll-x-contain [&_[role=tab]]:shrink-0 [&_[role=tab]]:px-2 [&_[role=tab]]:text-[13px] [&_[role=tab][aria-selected=true]]:border-brand-action sm:[&_[role=tablist]]:flex-wrap sm:[&_[role=tab]]:px-3.5 sm:[&_[role=tab]]:text-sm"
        />
        {!edges.start && <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-[42px] w-7 bg-gradient-to-r from-brand-paper to-transparent sm:hidden" />}
        {!edges.end && <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-[42px] w-7 bg-gradient-to-l from-brand-paper to-transparent sm:hidden" />}
      </div>
    </div>
  );
}
