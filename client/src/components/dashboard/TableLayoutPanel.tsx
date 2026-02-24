import { useState } from 'react';
import type { Table, ActiveParty } from '../../types/host.types';
import TableGrid from '../host/TableGrid';
import FloorPlanView from '../host/FloorPlanView';
import TableStatusLegend from '../host/TableStatusLegend';
import { authFetch } from '../../services/api';

interface TableLayoutPanelProps {
  tables: Table[];
  activeParties: ActiveParty[];
  onRefresh: () => void;
  onToast?: (message: string, type: 'success' | 'error') => void;
  language?: 'en' | 'es';
  isLoading?: boolean;
}

const translations = {
  en: {
    tableLayout: 'Table Layout',
    tapToManage: 'Tap any table to manage its status',
    table: 'Table',
    seats: 'seats',
    joinableTables: 'Joinable Tables',
    combinedCapacity: 'Combined capacity',
    freeTable: 'Free Table',
    freeTableSub: 'Mark as available',
    markClean: 'Mark Clean',
    markCleanSub: 'Table is ready',
    markReserved: 'Mark Reserved',
    markReservedSub: 'Reserve for upcoming guest',
    needsCleaning: 'Needs Cleaning',
    needsCleaningSub: 'Mark for staff attention',
    markAvailable: 'Mark as Available',
    markAvailableSub: 'Table ready for new guests',
    cancel: 'Cancel',
    tableUpdated: 'Table updated successfully',
    tableFreed: 'Table freed successfully',
    errorUpdate: 'Error updating table',
    errorFree: 'Error freeing table',
  },
  es: {
    tableLayout: 'Disposición de Mesas',
    tapToManage: 'Toca cualquier mesa para gestionar su estado',
    table: 'Mesa',
    seats: 'personas',
    joinableTables: 'Mesas Combinables',
    combinedCapacity: 'Capacidad combinada',
    freeTable: 'Liberar Mesa',
    freeTableSub: 'Marcar como disponible',
    markClean: 'Marcar Limpia',
    markCleanSub: 'Mesa lista',
    markReserved: 'Marcar Reservada',
    markReservedSub: 'Reservar para próximo cliente',
    needsCleaning: 'Marcar Limpieza',
    needsCleaningSub: 'Mesa en proceso de limpieza',
    markAvailable: 'Marcar Disponible',
    markAvailableSub: 'Mesa lista para nuevos clientes',
    cancel: 'Cancelar',
    tableUpdated: 'Mesa actualizada exitosamente',
    tableFreed: 'Mesa liberada exitosamente',
    errorUpdate: 'Error al actualizar mesa',
    errorFree: 'Error al liberar mesa',
  },
};

export default function TableLayoutPanel({
  tables,
  activeParties,
  onRefresh,
  onToast,
  language = 'en',
  isLoading,
}: TableLayoutPanelProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'floorplan'>('floorplan');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const t = translations[language];

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
  };

  const handleFreeTable = async (tableId: string) => {
    try {
      const response = await authFetch('/api/host-dashboard?action=free-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId }),
      });
      if (response.ok) {
        onToast?.(t.tableFreed, 'success');
        onRefresh();
        setSelectedTable(null);
      } else {
        throw new Error('Failed');
      }
    } catch (error) {
      console.error('Error freeing table:', error);
      onToast?.(t.errorFree, 'error');
    }
  };

  const handleUpdateStatus = async (tableId: string, status: string) => {
    try {
      const response = await authFetch('/api/host-dashboard?action=update-table-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId, status }),
      });
      if (response.ok) {
        onToast?.(t.tableUpdated, 'success');
        onRefresh();
        setSelectedTable(null);
      } else {
        throw new Error('Failed');
      }
    } catch (error) {
      console.error('Error updating table status:', error);
      onToast?.(t.errorUpdate, 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6">
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
      <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold text-deep-charcoal tracking-tight whitespace-nowrap">{t.tableLayout}</span>
            <span className="relative flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-soft-gray rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('floorplan')}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'floorplan'
                  ? 'bg-deep-charcoal text-white'
                  : 'text-warm-stone hover:text-deep-charcoal'
              }`}
              title="Floor Plan View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-deep-charcoal text-white'
                  : 'text-warm-stone hover:text-deep-charcoal'
              }`}
              title="Grid View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
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
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border-gray max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-deep-charcoal">
                    {t.table} {selectedTable.table_number}
                  </h3>
                  <p className="text-sm text-stone-gray">
                    {selectedTable.capacity} {t.seats} &middot; {selectedTable.location}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="text-muted-stone hover:text-stone-gray transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Joinable info */}
            {selectedTable.is_joinable && selectedTable.joinable_with?.length > 0 && (
              <div className="mb-4 p-3 bg-burgundy/5 border border-burgundy/15 rounded-xl">
                <div className="text-sm font-semibold text-burgundy mb-1.5">{t.joinableTables}</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTable.joinable_with.map((linkedId: string) => {
                    const linked = tables.find((t) => t.id === linkedId);
                    return linked ? (
                      <span key={linkedId} className="px-2 py-0.5 bg-white border border-border-gray rounded-md text-xs font-medium">
                        {t.table} {linked.table_number}
                      </span>
                    ) : null;
                  })}
                </div>
                <p className="text-xs text-stone-gray mt-1.5">
                  {t.combinedCapacity}:{' '}
                  {selectedTable.capacity +
                    selectedTable.joinable_with.reduce((sum: number, id: string) => {
                      const t = tables.find((tb) => tb.id === id);
                      return sum + (t?.capacity || 0);
                    }, 0)}{' '}
                  {t.seats}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2.5">
              {selectedTable.status === 'Occupied' && (
                <ActionButton
                  label={t.freeTable}
                  sublabel={t.freeTableSub}
                  color="green"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />}
                  onClick={() => handleFreeTable(selectedTable.id)}
                />
              )}
              {selectedTable.status === 'Being Cleaned' && (
                <ActionButton
                  label={t.markClean}
                  sublabel={t.markCleanSub}
                  color="green"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />}
                  onClick={() => handleUpdateStatus(selectedTable.id, 'Available')}
                />
              )}
              {selectedTable.status === 'Available' && (
                <ActionButton
                  label={t.markReserved}
                  sublabel={t.markReservedSub}
                  color="blue"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                  onClick={() => handleUpdateStatus(selectedTable.id, 'Reserved')}
                />
              )}
              {selectedTable.status !== 'Being Cleaned' && selectedTable.status !== 'Available' && (
                <ActionButton
                  label={t.needsCleaning}
                  sublabel={t.needsCleaningSub}
                  color="amber"
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />}
                  onClick={() => handleUpdateStatus(selectedTable.id, 'Being Cleaned')}
                />
              )}
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

const actionColors = {
  green: {
    bg: 'bg-green-50 hover:bg-green-100',
    border: 'border-green-200',
    iconBg: 'bg-green-600',
    title: 'text-green-900',
    sub: 'text-green-700',
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
      <div className={`p-2 ${c.iconBg} rounded-lg`}>
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
