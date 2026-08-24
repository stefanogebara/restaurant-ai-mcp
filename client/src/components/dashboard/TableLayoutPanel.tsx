import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Table, ActiveParty } from '../../types/host.types';
import TableGrid from '../host/TableGrid';
import FloorPlanView from '../host/FloorPlanView';
import TableStatusLegend from '../host/TableStatusLegend';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

interface TableLayoutPanelProps {
  tables: Table[];
  activeParties: ActiveParty[];
  onRefresh: () => void;
  onToast?: (message: string, type: 'success' | 'error') => void;
  isLoading?: boolean;
  /** Modo Serviço — repassa o tema noturno para a planta do salão. */
  night?: boolean;
}

export default function TableLayoutPanel({
  tables,
  activeParties,
  onRefresh,
  onToast,
  isLoading,
  night = false,
}: TableLayoutPanelProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'grid' | 'floorplan'>(() => {
    const saved = localStorage.getItem('seatable_table_view_mode');
    return saved === 'grid' ? 'grid' : 'floorplan';
  });
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  const freeTable = useMutation({
    mutationFn: async (tableId: string) => {
      const response = await authFetch('/api/host-dashboard?action=free-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId }),
      });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => { onToast?.(t('tableLayout.tableFreed'), 'success'); onRefresh(); setSelectedTable(null); },
    onError: () => onToast?.(t('tableLayout.errorFree'), 'error'),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ tableId, status }: { tableId: string; status: string }) => {
      const response = await authFetch('/api/host-dashboard?action=update-table-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId, status }),
      });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => { onToast?.(t('tableLayout.tableUpdated'), 'success'); onRefresh(); setSelectedTable(null); },
    onError: () => onToast?.(t('tableLayout.errorUpdate'), 'error'),
  });

  const handleTableClick = (table: Table) => setSelectedTable(table);
  const handleFreeTable = (tableId: string) => freeTable.mutate(tableId);
  const handleUpdateStatus = (tableId: string, status: string) => updateStatus.mutate({ tableId, status });

  if (isLoading) {
    return (
      <div role="status" aria-label={t('common.loading')} className="p-6">
        <div className="h-6 w-40 bg-border-gray rounded-lg animate-pulse mb-4" />
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square bg-soft-gray rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-glass-border-dark">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold uppercase tracking-widest text-deep-charcoal whitespace-nowrap">{t('tableLayout.title')}</span>
            <span className="relative flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              {t('dashboard.live')}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to="/host-dashboard/floor-plan"
              className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-glass-border-dark px-3 py-2 text-xs font-semibold text-deep-charcoal transition-colors hover:bg-soft-gray"
            >
              <ThiingsIcon name="edit" pxSize={14} />
              <span>{t('tableLayout.editFloorPlan', 'Edit Floor Plan')}</span>
            </Link>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-soft-gray rounded-lg p-0.5">
              <button
                onClick={() => { setViewMode('floorplan'); localStorage.setItem('seatable_table_view_mode', 'floorplan'); }}
                aria-label={t('tableLayout.floorPlanView', 'Floor Plan View')}
                className={`min-h-[36px] min-w-[36px] flex items-center justify-center px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                  viewMode === 'floorplan'
                    ? 'bg-deep-charcoal text-white'
                    : 'text-warm-stone hover:text-deep-charcoal'
                }`}
              >
                <ThiingsIcon name="map" pxSize={16} />
              </button>
              <button
                onClick={() => { setViewMode('grid'); localStorage.setItem('seatable_table_view_mode', 'grid'); }}
                aria-label={t('tableLayout.gridView', 'Grid View')}
                className={`min-h-[36px] min-w-[36px] flex items-center justify-center px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-deep-charcoal text-white'
                    : 'text-warm-stone hover:text-deep-charcoal'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className={`p-5 sm:p-6 min-h-[420px] ${viewMode === 'grid' ? 'bg-soft-gray' : ''}`}>
          <div className="mb-4">
            <TableStatusLegend />
          </div>
          {viewMode === 'floorplan' ? (
            <FloorPlanView
              tables={tables}
              activeParties={activeParties}
              onTableClick={handleTableClick}
              night={night}
            />
          ) : (
            <TableGrid
              tables={tables}
              onTableClick={handleTableClick}
            />
          )}
        </div>

      </div>

      {/* Table Actions Modal */}
      {selectedTable && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTable(null); }}
        >
          <div className="bg-glass-modal backdrop-blur-glass-modal rounded-t-2xl sm:rounded-2xl shadow-glass-modal border border-glass-border max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-deep-charcoal">
                    {t('tableLayout.table')} {selectedTable.table_number}
                  </h3>
                  <p className="text-sm text-stone-gray">
                    {selectedTable.capacity} {t('tableLayout.seats')} &middot; {t(`floorPlan.location.${(selectedTable.location || 'indoor').toLowerCase()}`, selectedTable.location)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                aria-label={t('common.close')}
                className="text-muted-stone hover:text-stone-gray transition-colors p-1.5 rounded-lg"
              >
                <ThiingsIcon name="close" pxSize={20} />
              </button>
            </div>

            {/* Joinable info */}
            {selectedTable.is_joinable && selectedTable.joinable_with?.length > 0 && (
              <div className="mb-4 p-3 bg-[#9F1239]/5 border border-[#9F1239]/15 rounded-xl">
                <div className="text-sm font-semibold text-[#9F1239] mb-1.5">{t('tableLayout.joinableTables')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTable.joinable_with.map((linkedId: string) => {
                    const linked = tables.find((tbl) => tbl.id === linkedId);
                    return linked ? (
                      <span key={linkedId} className="px-2 py-0.5 bg-white/60 border border-glass-border-dark rounded-lg text-xs font-medium">
                        {t('tableLayout.table')} {linked.table_number}
                      </span>
                    ) : null;
                  })}
                </div>
                <p className="text-xs text-stone-gray mt-1.5">
                  {t('tableLayout.combinedCapacity')}:{' '}
                  {selectedTable.capacity +
                    selectedTable.joinable_with.reduce((sum: number, id: string) => {
                      const tbl = tables.find((tb) => tb.id === id);
                      return sum + (tbl?.capacity || 0);
                    }, 0)}{' '}
                  {t('tableLayout.seats')}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2.5">
              {selectedTable.status === 'Occupied' && (
                <ActionButton
                  label={t('tableLayout.freeTable')}
                  sublabel={t('tableLayout.freeTableSub')}
                  color="green"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />}
                  onClick={() => handleFreeTable(selectedTable.id)}
                />
              )}
              {selectedTable.status === 'Being Cleaned' && (
                <ActionButton
                  label={t('tableLayout.markClean')}
                  sublabel={t('tableLayout.markCleanSub')}
                  color="green"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />}
                  onClick={() => handleUpdateStatus(selectedTable.id, 'Available')}
                />
              )}
              {selectedTable.status === 'Available' && (
                <ActionButton
                  label={t('tableLayout.markReserved')}
                  sublabel={t('tableLayout.markReservedSub')}
                  color="blue"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                  onClick={() => handleUpdateStatus(selectedTable.id, 'Reserved')}
                />
              )}
              {selectedTable.status !== 'Being Cleaned' && selectedTable.status !== 'Available' && (
                <ActionButton
                  label={t('tableLayout.needsCleaning')}
                  sublabel={t('tableLayout.needsCleaningSub')}
                  color="amber"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />}
                  onClick={() => handleUpdateStatus(selectedTable.id, 'Being Cleaned')}
                />
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Link
                to="/host-dashboard/floor-plan"
                onClick={() => setSelectedTable(null)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-glass-border-dark px-4 py-3 text-sm font-semibold text-deep-charcoal transition-colors hover:bg-soft-gray"
              >
                <ThiingsIcon name="edit" pxSize={16} />
                <span>{t('tableLayout.editInFloorPlan', 'Edit in Floor Plan')}</span>
              </Link>
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                className="min-h-[44px] rounded-xl border border-glass-border-dark px-4 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-soft-gray"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Internal button ----

interface ActionButtonProps {
  label: string;
  sublabel: string;
  color: 'green' | 'blue' | 'amber';
  icon: React.ReactNode;
  onClick: () => void;
}

// "green" → ACTUAL green palette. Previously this used Tailwind's rose
// tokens (the brand's primary action color), so "Free this table" — a
// positive available-status action — rendered identical to destructive
// red/burgundy CTAs. Carla on a busy shift could not tell the difference,
// which is exactly the problem flagged in audit Finding 13.
const actionColors = {
  green: {
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-600',
    title: 'text-emerald-900',
    sub: 'text-emerald-700',
  },
  blue: {
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-200',
    iconBg: 'bg-blue-600',
    title: 'text-blue-900',
    sub: 'text-blue-700',
  },
  amber: {
    bg: 'bg-amber-50 hover:bg-amber-100',
    border: 'border-amber-200',
    iconBg: 'bg-amber-600',
    title: 'text-amber-900',
    sub: 'text-amber-700',
  },
};

function ActionButton({ label, sublabel, color, icon, onClick }: ActionButtonProps) {
  const c = actionColors[color];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 min-h-[52px] ${c.bg} rounded-xl border ${c.border} transition-colors`}
    >
      <div className={`p-2 ${c.iconBg} rounded-xl`}>
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icon}
        </svg>
      </div>
      <div className="text-left flex-1">
        <div className={`font-semibold text-sm ${c.title}`}>{label}</div>
        <div className={`text-xs ${c.sub}`}>{sublabel}</div>
      </div>
    </button>
  );
}
