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
      className="[&_[role=tablist]]:border-brand-line [&_[role=tab]]:text-brand-muted [&_[role=tab][aria-selected=true]]:border-brand-action [&_[role=tab][aria-selected=true]]:text-brand-ink"
    />
  );
}
