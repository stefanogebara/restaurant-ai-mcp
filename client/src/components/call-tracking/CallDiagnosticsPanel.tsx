import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import type { DiagnoseData } from './callTrackingTypes';

interface Props {
  diagnoseData: DiagnoseData | null;
  diagnoseLoading: boolean;
  fixToolsLoading: boolean;
  onFixTools: () => void;
  onClose: () => void;
}

export default function CallDiagnosticsPanel({
  diagnoseData,
  diagnoseLoading,
  fixToolsLoading,
  onFixTools,
  onClose,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-border-gray overflow-hidden p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ThiingsIcon name="stethoscope" size="sm" />
          <h2 className="text-lg font-semibold text-deep-charcoal">Agent Diagnostics</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 hover:bg-soft-gray rounded-lg transition-colors"
        >
          <ThiingsIcon name="close" size="sm" />
        </button>
      </div>

      {diagnoseLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : diagnoseData ? (
        <div className="space-y-4">
          {/* Agent info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-soft-gray/30 rounded-xl p-3">
              <p className="text-xs text-stone-gray mb-1">Agent Name</p>
              <p className="text-sm font-medium text-deep-charcoal">{diagnoseData.agent_name || 'Unnamed'}</p>
            </div>
            <div className="bg-soft-gray/30 rounded-xl p-3">
              <p className="text-xs text-stone-gray mb-1">Language</p>
              <p className="text-sm font-medium text-deep-charcoal uppercase">{diagnoseData.language || 'Not set'}</p>
            </div>
            <div className="bg-soft-gray/30 rounded-xl p-3">
              <p className="text-xs text-stone-gray mb-1">Tools (via tool_ids)</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-deep-charcoal">{diagnoseData.tool_ids_count} configured</p>
                {diagnoseData.tool_ids_count === 0 && (
                  <span className="px-1.5 py-0.5 bg-red-600/10 text-red-600 text-xs rounded-lg font-medium">
                    Missing
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Embedded tool names */}
          {diagnoseData.tools.length > 0 && (
            <div>
              <p className="text-xs text-stone-gray mb-2">Embedded Tools ({diagnoseData.tool_count})</p>
              <div className="flex flex-wrap gap-2">
                {diagnoseData.tools.map((tool, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-soft-gray text-deep-charcoal text-xs font-medium rounded-full border border-border-gray/50"
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tool IDs */}
          {diagnoseData.tool_ids.length > 0 && (
            <div>
              <p className="text-xs text-stone-gray mb-2">Tool IDs ({diagnoseData.tool_ids_count})</p>
              <div className="flex flex-wrap gap-2">
                {diagnoseData.tool_ids.map((id, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-soft-gray text-stone-gray text-xs font-mono rounded-full border border-border-gray/50"
                    title={id}
                  >
                    {id.substring(0, 16)}...
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* First message preview */}
          {diagnoseData.first_message && (
            <div>
              <p className="text-xs text-stone-gray mb-1">First Message Preview</p>
              <div className="bg-soft-gray/30 rounded-xl p-3">
                <p className="text-sm text-deep-charcoal italic">
                  &quot;{diagnoseData.first_message.length > 200
                    ? `${diagnoseData.first_message.substring(0, 200)}...`
                    : diagnoseData.first_message}&quot;
                </p>
              </div>
            </div>
          )}

          {/* Fix Tools warning */}
          {diagnoseData.tool_ids_count === 0 && (
            <div className="bg-amber-600/10 border border-amber-600/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <ThiingsIcon name="alert-circle" size="sm" className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-deep-charcoal">No tools configured</p>
                  <p className="text-xs text-stone-gray mt-1">
                    Your agent has no webhook tools attached. Without tools, the agent cannot check
                    availability or create reservations. Click "Fix Tools" to auto-create and attach
                    the required tools.
                  </p>
                  <button
                    type="button"
                    onClick={onFixTools}
                    disabled={fixToolsLoading}
                    className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {fixToolsLoading ? (
                      <><Spinner size="sm" />Fixing tools...</>
                    ) : (
                      <><ThiingsIcon name="wrench" size="xs" />Fix Tools</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-stone-gray text-center py-4">
          No diagnostic data available. Click "Diagnose Agent" to check your agent configuration.
        </p>
      )}
    </div>
  );
}
