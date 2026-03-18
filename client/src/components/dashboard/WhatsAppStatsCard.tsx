import { useWhatsAppStatus, useWhatsAppStats } from '../../hooks/useWhatsAppSettings';

export default function WhatsAppStatsCard() {
  const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
  const { data: stats, isLoading: statsLoading } = useWhatsAppStats();

  // Auto-hide when WhatsApp is not enabled
  if (statusLoading || !status?.enabled) return null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-whatsapp/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-whatsapp" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-deep-charcoal">WhatsApp</h3>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700">
          <span className="w-1 h-1 rounded-full bg-rose-500" />
          Active
        </span>
      </div>

      {statsLoading ? (
        <div role="status" aria-label="Loading WhatsApp stats" className="animate-pulse flex gap-4">
          <div className="h-12 flex-1 bg-soft-gray rounded-lg" />
          <div className="h-12 flex-1 bg-soft-gray rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-soft-gray rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-deep-charcoal">{stats?.active_sessions ?? 0}</p>
            <p className="text-[10px] text-warm-stone">Active Chats</p>
          </div>
          <div className="bg-soft-gray rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-deep-charcoal">{stats?.messages_this_month ?? 0}</p>
            <p className="text-[10px] text-warm-stone">Messages/Mo</p>
          </div>
        </div>
      )}
    </div>
  );
}
