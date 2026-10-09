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
      className="[&>div:first-child]:border-0 [&>div:first-child]:pl-12 [&>div:first-child]:py-0 [&>div:first-child_select]:min-h-10 [&>div:first-child_select]:w-[168px] [&>div:first-child_select]:max-w-[168px] [&>div:first-child_select]:rounded-full [&>div:first-child_select]:border [&>div:first-child_select]:border-brand-line [&>div:first-child_select]:px-3 [&>div:first-child_select]:text-[18px] [&>div:first-child_select]:tracking-[-0.03em] [&>div:first-child_select]:font-normal [&>div:last-child]:pt-3 sm:[&>div:first-child]:pl-0 sm:[&>div:last-child]:pt-4 [&_[role=tablist]]:border-brand-line [&_[role=tab]]:text-brand-muted [&_[role=tab][aria-selected=true]]:border-brand-action [&_[role=tab][aria-selected=true]]:text-brand-ink"
    />
  );
}
