import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  agentId: string;
  updatedAt: string | undefined;
  createdAt: string | undefined;
}

export default function VoiceAgentInfo({ agentId, updatedAt, createdAt }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  return (
    <section className="py-5 border-b border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] flex items-center gap-2">
          <ThiingsIcon name="info" pxSize={20} />
          {t('agentInfo.title')}
        </h2>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {t('voice.agentActive', 'Agent active')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-stone text-xs mb-1">{t('agentInfo.voiceEngine')}</p>
          <p className="text-deep-charcoal font-mono">turbo_v2.5</p>
        </div>
        <div>
          <p className="text-muted-stone text-xs mb-1">{t('agentInfo.agentId')}</p>
          <div className="flex items-center gap-2">
            <p className="text-deep-charcoal font-mono truncate">{agentId}</p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(agentId); toast.info(t('agentInfo.agentIdCopied')); }}
              aria-label={t('agentInfo.copyAgentId')}
              className="text-burgundy hover:text-burgundy-dark flex-shrink-0 transition-colors"
            >
              <ThiingsIcon name="clipboard" pxSize={14} />
            </button>
          </div>
        </div>
        {updatedAt && (
          <div>
            <p className="text-muted-stone text-xs mb-1">{t('agentInfo.lastUpdated')}</p>
            <p className="text-deep-charcoal">{new Date(updatedAt).toLocaleString()}</p>
          </div>
        )}
        {createdAt && (
          <div>
            <p className="text-muted-stone text-xs mb-1">{t('agentInfo.created')}</p>
            <p className="text-deep-charcoal">{new Date(createdAt).toLocaleString()}</p>
          </div>
        )}
      </div>
    </section>
  );
}
