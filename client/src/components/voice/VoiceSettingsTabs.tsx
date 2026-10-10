import SettingsTabs, { type SettingsTabDef } from '../common/SettingsTabs';
import { useTranslation } from 'react-i18next';

/** Keep all channels discoverable without a cramped six-tab mobile row. */
export default function VoiceSettingsTabs({ tabs }: { tabs: SettingsTabDef[] }) {
  const { t } = useTranslation();
  return (
    <SettingsTabs
      tabs={tabs}
      hashKey="voice-settings"
      mobileSelectLabel={t('voiceSettings.section', 'Section')}
      className="[&>div:first-child]:relative [&>div:first-child]:w-fit [&>div:first-child]:max-w-[calc(100vw-64px)] [&>div:first-child]:border-0 [&>div:first-child]:pl-12 [&>div:first-child]:py-0 [&>div:first-child]:after:pointer-events-none [&>div:first-child]:after:absolute [&>div:first-child]:after:right-[3px] [&>div:first-child]:after:top-[18px] [&>div:first-child]:after:size-[7px] [&>div:first-child]:after:rotate-45 [&>div:first-child]:after:border-b [&>div:first-child]:after:border-r [&>div:first-child]:after:border-brand-ink [&>div:first-child]:after:content-[''] [&>div:first-child_select]:min-h-11 [&>div:first-child_select]:min-w-[72px] [&>div:first-child_select]:w-auto [&>div:first-child_select]:max-w-full [&>div:first-child_select]:appearance-none [&>div:first-child_select]:border-0 [&>div:first-child_select]:px-0 [&>div:first-child_select]:pr-6 [&>div:first-child_select]:text-[29px] [&>div:first-child_select]:font-medium [&>div:first-child_select]:tracking-[-0.05em] [&>div:first-child_select]:[field-sizing:content] [&>div:last-child]:pt-4 sm:[&>div:first-child]:pl-0 sm:[&>div:last-child]:pt-4 [&_[role=tablist]]:border-brand-line [&_[role=tab]]:text-brand-muted [&_[role=tab][aria-selected=true]]:border-brand-action [&_[role=tab][aria-selected=true]]:text-brand-ink"
    />
  );
}
