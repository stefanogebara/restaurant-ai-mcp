import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  engineStatus: string | undefined;
  currentOpenAIVoice: string;
}

const STATUS_STYLES: Record<string, string> = {
  active:  'text-rose-700 bg-rose-50',
  testing: 'text-amber-700 bg-amber-50',
};

export default function OpenAIEngineInfo({ engineStatus, currentOpenAIVoice }: Props) {
  const status = engineStatus || 'active';

  return (
    <section className="bg-white border border-border-gray rounded-2xl p-6">
      <h2 className="text-lg font-bold text-deep-charcoal mb-4 flex items-center gap-2">
        <ThiingsIcon name="info" pxSize={20} />
        Engine Info
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-stone text-xs mb-1">Engine</p>
          <p className="text-deep-charcoal font-mono">OpenAI Realtime API</p>
        </div>
        <div>
          <p className="text-muted-stone text-xs mb-1">WebSocket Endpoint</p>
          <p className="text-deep-charcoal font-mono truncate">seatable-voice.fly.dev</p>
        </div>
        <div>
          <p className="text-muted-stone text-xs mb-1">Status</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? 'text-warm-stone bg-soft-gray'}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <div>
          <p className="text-muted-stone text-xs mb-1">Voice</p>
          <p className="text-deep-charcoal font-mono">{currentOpenAIVoice}</p>
        </div>
      </div>
    </section>
  );
}
