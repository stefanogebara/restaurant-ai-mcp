import ThiingsIcon from '../common/ThiingsIcon';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  agentId: string;
  updatedAt: string | undefined;
  createdAt: string | undefined;
}

export default function VoiceAgentInfo({ agentId, updatedAt, createdAt }: Props) {
  const toast = useToast();

  return (
    <section className="py-5 border-b border-[#E5E7EB]">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4 flex items-center gap-2">
        <ThiingsIcon name="info" pxSize={20} />
        Agent Info
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-stone text-xs mb-1">Voice Engine</p>
          <p className="text-deep-charcoal font-mono">turbo_v2.5</p>
        </div>
        <div>
          <p className="text-muted-stone text-xs mb-1">Agent ID</p>
          <div className="flex items-center gap-2">
            <p className="text-deep-charcoal font-mono truncate">{agentId}</p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(agentId); toast.info('Agent ID copied'); }}
              aria-label="Copy Agent ID"
              className="text-burgundy hover:text-burgundy-dark flex-shrink-0 transition-colors"
            >
              <ThiingsIcon name="clipboard" pxSize={14} />
            </button>
          </div>
        </div>
        {updatedAt && (
          <div>
            <p className="text-muted-stone text-xs mb-1">Last Updated</p>
            <p className="text-deep-charcoal">{new Date(updatedAt).toLocaleString()}</p>
          </div>
        )}
        {createdAt && (
          <div>
            <p className="text-muted-stone text-xs mb-1">Created</p>
            <p className="text-deep-charcoal">{new Date(createdAt).toLocaleString()}</p>
          </div>
        )}
      </div>
    </section>
  );
}
