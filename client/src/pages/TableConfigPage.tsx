import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableConfigAPI } from '../services/api';
import type { TableConfig } from '../services/api';

type ApiError = Error & { response?: { data?: { error?: string } } };

import { SkeletonTableConfig } from '../components/common/Skeleton';
import DashboardLayout from '../components/layout/DashboardLayout';
import TableConfigForm from '../components/host/TableConfigForm';
import type { TableFormData } from '../components/host/TableConfigForm';
import TableAdjacencyModal from '../components/host/TableAdjacencyModal';
import FloorPlanView from '../components/host/FloorPlanView';
import { hasPositionData } from '../components/host/floorPlanHelpers';
import { Link } from 'react-router-dom';
import type { Table } from '../types/host.types';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../contexts/ToastContext';

const defaultFormData: TableFormData = {
  table_number: 1,
  capacity: 4,
  location: 'Main',
  is_fixed: false,
  combination_group: '',
};

export default function TableConfigPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.tableConfig', 'Table Setup | seatable'));
  const queryClient = useQueryClient();
  // M2: use the global ToastContext instead of a local toast + setTimeout —
  // matches the rest of the codebase, eliminates the no-cleanup setTimeout (L1),
  // and gives consistent visual styling across pages.
  const { success: toastSuccess, error: toastError } = useToast();
  const [selectedTable, setSelectedTable] = useState<TableConfig | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjacencyModal, setShowAdjacencyModal] = useState(false);
  const [formData, setFormData] = useState<TableFormData>(defaultFormData);

  const { data: tablesResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['tableConfig'],
    queryFn: tableConfigAPI.listTables,
  });

  const tables = tablesResponse?.data?.tables || [];
  const stats = tablesResponse?.data?.stats || {};
  const tablesByLocation = tablesResponse?.data?.tables_by_location || {};

  const createMutation = useMutation({
    mutationFn: tableConfigAPI.createTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowAddModal(false);
      setFormData(defaultFormData);
      toastSuccess(t('settings.tableCreated'));
    },
    onError: (error: ApiError) => {
      toastError(error.response?.data?.error || t('settings.tableCreateFailed'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: tableConfigAPI.updateTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowEditModal(false);
      setSelectedTable(null);
      toastSuccess(t('settings.tableUpdated'));
    },
    onError: (error: ApiError) => {
      toastError(error.response?.data?.error || t('settings.tableUpdateFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: tableConfigAPI.deleteTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowEditModal(false);
      setSelectedTable(null);
      toastSuccess(t('settings.tableDeactivated'));
    },
    onError: (error: ApiError) => {
      toastError(error.response?.data?.error || t('settings.tableDeactivateFailed'));
    },
  });

  const adjacencyMutation = useMutation({
    mutationFn: ({ tableId, adjacentIds }: { tableId: string; adjacentIds: string[] }) =>
      tableConfigAPI.setAdjacency(tableId, adjacentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowAdjacencyModal(false);
      setSelectedTable(null);
      toastSuccess(t('settings.adjacencyUpdated'));
    },
    onError: (error: ApiError) => {
      toastError(error.response?.data?.error || t('settings.adjacencyUpdateFailed'));
    },
  });

  const handleAddTable = () => {
    createMutation.mutate({
      table_number: formData.table_number,
      capacity: formData.capacity,
      location: formData.location,
      is_fixed: formData.is_fixed,
      combination_group: formData.combination_group || undefined,
    });
  };

  const handleUpdateTable = () => {
    if (!selectedTable) return;
    updateMutation.mutate({
      table_id: selectedTable.id,
      table_number: formData.table_number,
      capacity: formData.capacity,
      location: formData.location,
      is_fixed: formData.is_fixed,
      combination_group: formData.combination_group || undefined,
    });
  };

  const handleDeleteTable = () => {
    if (!selectedTable) return;
    if (confirm(t('settings.confirmDeactivate', { number: selectedTable.table_number }))) {
      deleteMutation.mutate(selectedTable.id);
    }
  };

  const openEditModal = (table: TableConfig) => {
    setSelectedTable(table);
    setFormData({
      table_number: table.table_number,
      capacity: table.capacity,
      location: table.location,
      is_fixed: table.is_fixed,
      combination_group: table.combination_group || '',
    });
    setShowEditModal(true);
  };

  const openAdjacencyModal = (table: TableConfig) => {
    setSelectedTable(table);
    setShowAdjacencyModal(true);
  };

  const locations = [...new Set(tables.map((t: TableConfig) => t.location))] as string[];

  const activeTables = tables.filter((tb: TableConfig) => tb.is_active);
  const isPositioned = hasPositionData(activeTables as unknown as Table[]);

  if (isLoading) {
    return <DashboardLayout><SkeletonTableConfig /></DashboardLayout>;
  }

  // M1: fail loud instead of rendering a fake empty state. A list-query failure
  // (network drop, 500, RLS glitch) previously dropped the user into the "No
  // tables yet" prompt as if they'd never created any — terrifying for an
  // owner who has 12 active tables. Same anti-pattern as SubscriptionSuccess
  // H1; same fix.
  if (isError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-circle" pxSize={28} className="text-red-700" />
            </div>
            <h3 className="text-lg font-bold text-red-900 mb-2">{t('dashboard.errorTitle')}</h3>
            <p className="text-sm text-red-700 mb-4">{t('errors.serverError')}</p>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="dashboard p-6 lg:p-8 max-w-[1240px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
          {t('settings.tableConfig')} <span className="font-light text-muted-stone">/ {tables.length} {t('settings.tablesCount')}</span>
        </h1>
        <button
          onClick={() => {
            setFormData(defaultFormData);
            setShowAddModal(true);
          }}
          className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-[13px] font-medium rounded-[100px] transition-colors"
        >
          + {t('settings.addNewTable')}
        </button>
      </div>

      {/* Summary Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-10 border-y hairline py-7 sm:py-9">
        <div>
          <p className="font-serif text-[30px] sm:text-[34px] leading-none text-deep-charcoal tabular-nums">{tables.length}</p>
          <p className="text-[12px] uppercase tracking-[0.12em] text-muted-stone mt-3">{t('settings.totalTables')}</p>
        </div>
        <div>
          <p className="font-serif text-[30px] sm:text-[34px] leading-none text-deep-charcoal tabular-nums">{stats.total_capacity || 0}</p>
          <p className="text-[12px] uppercase tracking-[0.12em] text-muted-stone mt-3">{t('settings.totalSeats')}</p>
        </div>
        <div>
          <p className="font-serif text-[30px] sm:text-[34px] leading-none text-burgundy tabular-nums">{stats.active || 0}</p>
          <p className="text-[12px] uppercase tracking-[0.12em] text-muted-stone mt-3">{t('settings.activeTables')}</p>
        </div>
        <div>
          <p className="font-serif text-[30px] sm:text-[34px] leading-none text-deep-charcoal tabular-nums">{stats.locations?.length || 0}</p>
          <p className="text-[12px] uppercase tracking-[0.12em] text-muted-stone mt-3">{t('settings.locations')}</p>
        </div>
      </section>

        {/* ---- A planta do salão ----
            A página listava as mesas só como texto; a posição de cada uma
            existia no banco (position_x/y, vinda do editor) e nunca era
            mostrada aqui. Sem planta, "mesa 7" é um número — com ela, é um
            lugar. Clicar numa mesa abre a mesma edição dos cartões abaixo.
            Quando ninguém posicionou nada ainda, FloorPlanView cai no
            auto-layout e a planta continua legível. */}
        {activeTables.length > 0 && (
          <section className="glass-panel p-5 sm:p-6 mb-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
                {t('settings.floorPlanHeading', 'Planta do salão')}
              </h2>
              <div className="flex items-center gap-3">
                {!isPositioned && (
                  <span className="text-[11px] text-muted-stone">
                    {t('settings.floorPlanAutoHint', 'Disposição automática — arraste as mesas no editor para refletir o salão real.')}
                  </span>
                )}
                <Link
                  to="/host-dashboard/floor-plan"
                  className="inline-flex items-center gap-2 px-4 py-1.5 min-h-[36px] glass-pill rounded-[46px] text-xs font-medium text-muted-stone hover:text-deep-charcoal transition-colors"
                >
                  <ThiingsIcon name="edit" pxSize={14} />
                  {t('tableLayout.editFloorPlan', 'Edit Floor Plan')}
                </Link>
              </div>
            </div>
            <FloorPlanView
              tables={activeTables as unknown as Table[]}
              onTableClick={(table) => {
                const match = tables.find((tb: TableConfig) => tb.id === table.id);
                if (match) openEditModal(match);
              }}
            />
          </section>
        )}

        {/* Empty state */}
        {tables.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="max-w-md text-center">
              <ThiingsIcon name="layout-grid" pxSize={28} className="text-muted-stone mx-auto mb-4" />
              <h3 className="font-serif text-[26px] text-deep-charcoal mb-2">
                {t('settings.noTablesTitle')}
              </h3>
              <p className="text-[15px] text-muted-stone mb-6 leading-relaxed">
                {t('settings.noTablesDescription')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFormData(defaultFormData);
                  setShowAddModal(true);
                }}
                className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-medium rounded-[100px] transition-colors text-sm"
              >
                + {t('settings.addNewTable')}
              </button>
            </div>
          </div>
        )}

        {/* Tables by Location */}
        {Object.entries(tablesByLocation).map(([location, locationTables]) => (
          <div key={location} className="mb-8">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-sm font-semibold text-deep-charcoal tracking-tight">{t(`floorPlan.location.${location.toLowerCase()}`, location)}</span>
              <span className="text-[11px] font-medium text-muted-stone bg-muted-stone/[0.10] px-2.5 py-0.5 rounded-[46px]">
                {(locationTables as TableConfig[]).filter(t => t.is_active).length} {t('settings.tablesCount')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(locationTables as TableConfig[])
                .filter(t => t.is_active)
                .sort((a, b) => a.table_number - b.table_number)
                .map((table) => (
                  <div
                    key={table.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit Table ${table.table_number}`}
                    className="p-5 border-b hairline cursor-pointer hover:bg-deep-charcoal/[0.02] transition-colors relative focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30"
                    onClick={() => openEditModal(table)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditModal(table); } }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-serif text-[20px] text-deep-charcoal">{t('settings.tableLabel')} {table.table_number}</div>
                        <div className="text-sm text-muted-stone">{table.capacity} {t('settings.seats')}</div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-[46px] text-xs font-medium ${
                          table.is_fixed
                            ? 'bg-muted-stone/[0.10] text-muted-stone'
                            : 'bg-soft-gray text-deep-charcoal'
                        }`}
                      >
                        {table.is_fixed ? t('settings.tableFixed') : t('settings.tableFlexible')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      {(() => {
                        // DB enum is capitalised ("Available", "Occupied", "Being Cleaned",
                        // "Reserved"); the i18n keys (and the colour matchers below) are
                        // lowercase. Normalise once: lowercase + map "being cleaned" → "cleaning".
                        const lower = (table.status || '').toLowerCase();
                        const statusKey = lower === 'being cleaned' ? 'cleaning' : lower;
                        const dotClass =
                          statusKey === 'available' ? 'bg-rose-500'
                          : statusKey === 'occupied' ? 'bg-red-600'
                          : 'bg-amber-600';
                        return (
                          <>
                            <span className={`w-2 h-2 rounded-full ${dotClass}`}></span>
                            <span className="text-sm text-muted-stone">
                              {t(`settings.tableStatus.${statusKey}`, table.status)}
                            </span>
                          </>
                        );
                      })()}
                    </div>

                    {table.adjacent_tables && table.adjacent_tables.length > 0 && (
                      <div className="text-xs text-muted-stone mb-2">
                        {t('settings.adjacentTables', { count: table.adjacent_tables.length })}
                      </div>
                    )}

                    {table.combination_group && (
                      <div className="text-xs text-burgundy bg-burgundy/10 px-2 py-1 rounded-lg">
                        {t('settings.combinationGroup')}: {table.combination_group}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3 pt-3 border-t border-soft-gray">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditModal(table); }}
                        className="flex-1 px-3 py-1.5 text-xs bg-soft-gray text-stone-gray rounded-xl hover:bg-border-gray transition-colors"
                      >
                        {t('common.edit')}
                      </button>
                      {!table.is_fixed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openAdjacencyModal(table); }}
                          className="flex-1 px-3 py-1.5 text-xs bg-soft-gray text-stone-gray rounded-xl hover:bg-border-gray transition-colors"
                        >
                          {t('settings.setAdjacent')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}

        {/* Inactive Tables */}
        {tables.filter((t: TableConfig) => !t.is_active).length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-muted-stone mb-4">
              {t('settings.inactiveTables')} ({tables.filter((t: TableConfig) => !t.is_active).length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tables
                .filter((t: TableConfig) => !t.is_active)
                .map((table: TableConfig) => (
                  <div key={table.id} className="p-4 border-b hairline opacity-60">
                    <div className="text-lg font-bold text-muted-stone">{t('settings.tableLabel')} {table.table_number}</div>
                    <div className="text-sm text-muted-stone">{table.capacity} {t('settings.seats')} - {table.location}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

      {/* Add Table Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-table-title"
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <div className="glass-modal max-w-md w-full p-6">
            <h3 id="add-table-title" className="font-serif text-[22px] text-deep-charcoal mb-4">{t('settings.addNewTable')}</h3>
            <TableConfigForm
              formData={formData}
              setFormData={setFormData}
              locations={locations}
              onSubmit={handleAddTable}
              onCancel={() => setShowAddModal(false)}
              isLoading={createMutation.isPending}
              submitLabel={t('settings.createTable')}
            />
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {showEditModal && selectedTable && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-table-title"
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <div className="glass-modal max-w-md w-full p-6">
            <h3 id="edit-table-title" className="font-serif text-[22px] text-deep-charcoal mb-4">{t('settings.editTable')} {selectedTable.table_number}</h3>
            <TableConfigForm
              formData={formData}
              setFormData={setFormData}
              locations={locations}
              onSubmit={handleUpdateTable}
              onCancel={() => setShowEditModal(false)}
              isLoading={updateMutation.isPending}
              submitLabel={t('settings.saveChanges')}
            />
            <div className="mt-4 pt-4 border-t border-border-gray">
              <button
                onClick={handleDeleteTable}
                disabled={deleteMutation.isPending}
                className="w-full px-4 py-2 text-red-600 border border-red-600/20 rounded-xl hover:bg-red-600/10 transition-colors"
              >
                {deleteMutation.isPending ? t('settings.deactivating') : t('settings.deactivateTable')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjacency Modal */}
      {showAdjacencyModal && selectedTable && (
        <TableAdjacencyModal
          table={selectedTable}
          allTables={tables.filter((t: TableConfig) => t.is_active && !t.is_fixed && t.id !== selectedTable.id)}
          onSave={(adjacentIds) => {
            adjacencyMutation.mutate({ tableId: selectedTable.id, adjacentIds });
          }}
          onCancel={() => {
            setShowAdjacencyModal(false);
            setSelectedTable(null);
          }}
          isLoading={adjacencyMutation.isPending}
        />
      )}

      {/* Toast — now handled by global ToastContext via useToast() */}
    </div>
    </DashboardLayout>
  );
}
