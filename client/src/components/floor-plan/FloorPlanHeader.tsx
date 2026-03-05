import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  saveStatus: 'idle' | 'saving' | 'saved';
  linkMode: boolean;
  onToggleLinkMode: () => void;
  onAddTable: () => void;
}

export default function FloorPlanHeader({ saveStatus, linkMode, onToggleLinkMode, onAddTable }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-deep-charcoal tracking-tight">{t('floorPlan.title')}</h1>
        <p className="text-sm text-warm-stone mt-0.5">
          {t('floorPlan.subtitle')}
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Save status indicator */}
        <span className={`text-xs font-medium transition-all px-2.5 py-1 rounded-full ${
          saveStatus === 'idle'
            ? 'opacity-0 pointer-events-none'
            : 'opacity-100'
        } ${
          saveStatus === 'saving'
            ? 'bg-soft-gray text-muted-stone'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {saveStatus === 'saving' ? t('floorPlan.saving') : t('floorPlan.saved')}
        </span>

        {/* Link mode toggle */}
        <button
          type="button"
          onClick={onToggleLinkMode}
          className={`min-h-[38px] px-4 py-2 rounded-xl text-sm font-medium border transition-all flex items-center gap-1.5 ${
            linkMode
              ? 'bg-burgundy/8 text-burgundy border-burgundy/25'
              : 'bg-white text-stone-gray border-border-gray hover:border-stone-gray/60 hover:text-deep-charcoal'
          }`}
        >
          <ThiingsIcon name="link" pxSize={15} />
          {linkMode ? t('floorPlan.linking') : t('floorPlan.linkTables')}
        </button>

        {/* Add table */}
        <button
          type="button"
          onClick={onAddTable}
          className="min-h-[38px] px-4 py-2 rounded-xl text-sm font-medium bg-deep-charcoal text-white hover:bg-stone-mid transition-colors flex items-center gap-1.5"
        >
          <ThiingsIcon name="plus" pxSize={15} />
          {t('floorPlan.addTable')}
        </button>
      </div>
    </div>
  );
}
