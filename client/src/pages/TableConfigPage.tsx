import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableConfigAPI } from '../services/api';
import type { TableConfig } from '../services/api';

import { SkeletonTableConfig } from '../components/common/Skeleton';
import DashboardLayout from '../components/layout/DashboardLayout';

interface TableFormData {
  table_number: number;
  capacity: number;
  location: string;
  is_fixed: boolean;
  combination_group: string;
}

const defaultFormData: TableFormData = {
  table_number: 1,
  capacity: 4,
  location: 'Main',
  is_fixed: false,
  combination_group: '',
};

export default function TableConfigPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState<TableConfig | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjacencyModal, setShowAdjacencyModal] = useState(false);
  const [formData, setFormData] = useState<TableFormData>(defaultFormData);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch tables
  const { data: tablesResponse, isLoading } = useQuery({
    queryKey: ['tableConfig'],
    queryFn: tableConfigAPI.listTables,
  });

  const tables = tablesResponse?.data?.tables || [];
  const stats = tablesResponse?.data?.stats || {};
  const tablesByLocation = tablesResponse?.data?.tables_by_location || {};

  // Create table mutation
  const createMutation = useMutation({
    mutationFn: tableConfigAPI.createTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowAddModal(false);
      setFormData(defaultFormData);
      showToast('Table created successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to create table', 'error');
    },
  });

  // Update table mutation
  const updateMutation = useMutation({
    mutationFn: tableConfigAPI.updateTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowEditModal(false);
      setSelectedTable(null);
      showToast('Table updated successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to update table', 'error');
    },
  });

  // Delete table mutation
  const deleteMutation = useMutation({
    mutationFn: tableConfigAPI.deleteTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowEditModal(false);
      setSelectedTable(null);
      showToast('Table deactivated successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to delete table', 'error');
    },
  });

  // Set adjacency mutation
  const adjacencyMutation = useMutation({
    mutationFn: ({ tableId, adjacentIds }: { tableId: string; adjacentIds: string[] }) =>
      tableConfigAPI.setAdjacency(tableId, adjacentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableConfig'] });
      setShowAdjacencyModal(false);
      setSelectedTable(null);
      showToast('Adjacency relationships updated', 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to update adjacency', 'error');
    },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
    if (confirm(`Are you sure you want to deactivate Table ${selectedTable.table_number}?`)) {
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

  // Get unique locations for dropdown
  const locations = [...new Set(tables.map((t: TableConfig) => t.location))] as string[];

  if (isLoading) {
    return <DashboardLayout><SkeletonTableConfig /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
    <div className="dashboard p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
          {t('settings.tableConfig')} <span className="font-light text-warm-stone">/ {tables.length} tables</span>
        </h1>
        <button
          onClick={() => {
            setFormData(defaultFormData);
            setShowAddModal(true);
          }}
          className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-[13px] font-semibold rounded-[10px] transition-colors"
        >
          + {t('settings.addNewTable')}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-border-gray">
          <div className="text-xs font-medium text-muted-stone mb-2">{t('settings.totalTables')}</div>
          <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">{tables.length}</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-border-gray">
          <div className="text-xs font-medium text-muted-stone mb-2">{t('settings.totalSeats')}</div>
          <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">{stats.total_capacity || 0}</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-border-gray">
          <div className="text-xs font-medium text-muted-stone mb-2">{t('settings.activeTables')}</div>
          <div className="text-[32px] font-bold tracking-tight leading-none text-green-600">{stats.active || 0}</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-border-gray">
          <div className="text-xs font-medium text-muted-stone mb-2">{t('settings.locations')}</div>
          <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">{stats.locations?.length || 0}</div>
        </div>
      </div>

        {/* Tables by Location */}
        {Object.entries(tablesByLocation).map(([location, locationTables]) => (
          <div key={location} className="mb-8">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-sm font-semibold text-deep-charcoal tracking-tight">{location}</span>
              <span className="text-[11px] font-medium text-warm-stone bg-soft-gray px-2.5 py-1 rounded-full">
                {(locationTables as TableConfig[]).filter(t => t.is_active).length} tables
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(locationTables as TableConfig[])
                .filter(t => t.is_active)
                .sort((a, b) => a.table_number - b.table_number)
                .map((table) => (
                  <div
                    key={table.id}
                    className="bg-white rounded-2xl p-6 border border-border-gray cursor-pointer hover:border-stone-300 transition-colors relative"
                    onClick={() => openEditModal(table)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-xl font-semibold text-deep-charcoal">Table {table.table_number}</div>
                        <div className="text-sm text-warm-stone">{table.capacity} seats</div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          table.is_fixed
                            ? 'bg-soft-gray text-warm-stone'
                            : 'bg-soft-gray text-deep-charcoal'
                        }`}
                      >
                        {table.is_fixed ? 'Fixed' : 'Flexible'}
                      </span>
                    </div>

                    {/* Status indicator */}
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          table.status === 'available'
                            ? 'bg-green-500'
                            : table.status === 'occupied'
                            ? 'bg-red-600'
                            : 'bg-amber-600'
                        }`}
                      ></span>
                      <span className="text-sm text-warm-stone capitalize">{table.status}</span>
                    </div>

                    {/* Adjacency info */}
                    {table.adjacent_tables && table.adjacent_tables.length > 0 && (
                      <div className="text-xs text-muted-stone mb-2">
                        Adjacent to {table.adjacent_tables.length} table(s)
                      </div>
                    )}

                    {/* Combination group */}
                    {table.combination_group && (
                      <div className="text-xs text-burgundy bg-burgundy/10 px-2 py-1 rounded">
                        Group: {table.combination_group}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-soft-gray">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(table);
                        }}
                        className="flex-1 px-3 py-1.5 text-xs bg-soft-gray text-stone-gray rounded-xl hover:bg-border-gray transition-colors"
                      >
                        {t('common.edit')}
                      </button>
                      {!table.is_fixed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAdjacencyModal(table);
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-burgundy/10 text-burgundy rounded-xl hover:bg-burgundy/20 transition-colors"
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

        {/* Inactive Tables Section */}
        {tables.filter((t: TableConfig) => !t.is_active).length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-muted-stone mb-4">
              {t('settings.inactiveTables')} ({tables.filter((t: TableConfig) => !t.is_active).length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tables
                .filter((t: TableConfig) => !t.is_active)
                .map((table: TableConfig) => (
                  <div
                    key={table.id}
                    className="bg-soft-gray rounded-2xl p-4 border border-border-gray opacity-60"
                  >
                    <div className="text-lg font-bold text-muted-stone">Table {table.table_number}</div>
                    <div className="text-sm text-muted-stone">{table.capacity} seats - {table.location}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-deep-charcoal mb-4">{t('settings.addNewTable')}</h3>
            <TableForm
              formData={formData}
              setFormData={setFormData}
              locations={locations}
              onSubmit={handleAddTable}
              onCancel={() => setShowAddModal(false)}
              isLoading={createMutation.isPending}
              submitLabel="Create Table"
            />
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {showEditModal && selectedTable && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-deep-charcoal mb-4">{t('settings.editTable')} {selectedTable.table_number}</h3>
            <TableForm
              formData={formData}
              setFormData={setFormData}
              locations={locations}
              onSubmit={handleUpdateTable}
              onCancel={() => setShowEditModal(false)}
              isLoading={updateMutation.isPending}
              submitLabel="Save Changes"
            />
            <div className="mt-4 pt-4 border-t border-border-gray">
              <button
                onClick={handleDeleteTable}
                disabled={deleteMutation.isPending}
                className="w-full px-4 py-2 text-red-600 border border-red-600/20 rounded-xl hover:bg-red-600/10 transition-colors"
              >
                {deleteMutation.isPending ? 'Deactivating...' : 'Deactivate Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjacency Modal */}
      {showAdjacencyModal && selectedTable && (
        <AdjacencyModal
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

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-6 py-3 rounded-xl z-50 ${
            toast.type === 'success' ? 'bg-deep-charcoal text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}

// Table Form Component
function TableForm({
  formData,
  setFormData,
  locations,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: {
  formData: TableFormData;
  setFormData: (data: TableFormData) => void;
  locations: string[];
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">Table Number</label>
          <input
            type="number"
            min="1"
            value={formData.table_number}
            onChange={(e) => setFormData({ ...formData, table_number: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-border-gray rounded-lg focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">Capacity</label>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-border-gray rounded-lg focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-gray mb-1">Location</label>
        <div className="flex gap-2">
          <select
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="flex-1 px-3 py-2 border border-border-gray rounded-lg focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          >
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__new__">+ New Location</option>
          </select>
        </div>
        {formData.location === '__new__' && (
          <input
            type="text"
            placeholder="Enter new location name"
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="mt-2 w-full px-3 py-2 border border-border-gray rounded-lg focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-gray mb-1">Table Type</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!formData.is_fixed}
              onChange={() => setFormData({ ...formData, is_fixed: false })}
              className="w-4 h-4 text-green-500 accent-green-500"
            />
            <span className="text-sm text-warm-stone">Flexible (can combine)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={formData.is_fixed}
              onChange={() => setFormData({ ...formData, is_fixed: true })}
              className="w-4 h-4 text-amber-600 accent-amber-600"
            />
            <span className="text-sm text-warm-stone">Fixed (booth/round)</span>
          </label>
        </div>
      </div>

      {!formData.is_fixed && (
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">
            Combination Group (optional)
          </label>
          <input
            type="text"
            value={formData.combination_group}
            onChange={(e) => setFormData({ ...formData, combination_group: e.target.value })}
            placeholder="e.g., window-row, center-section"
            className="w-full px-3 py-2 border border-border-gray rounded-lg focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          />
          <p className="text-xs text-muted-stone mt-1">
            Tables in the same group can be combined together
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-deep-charcoal text-white rounded-xl hover:bg-charcoal-dark transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  );
}

// Adjacency Modal Component
function AdjacencyModal({
  table,
  allTables,
  onSave,
  onCancel,
  isLoading,
}: {
  table: TableConfig;
  allTables: TableConfig[];
  onSave: (adjacentIds: string[]) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(table.adjacent_tables || []);

  const toggleTable = (tableId: string) => {
    setSelectedIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  // Group tables by location for easier selection
  const tablesByLocation: Record<string, TableConfig[]> = {};
  allTables.forEach((t) => {
    const loc = t.location || 'Main';
    if (!tablesByLocation[loc]) tablesByLocation[loc] = [];
    tablesByLocation[loc].push(t);
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-deep-charcoal mb-2">
          Set Adjacent Tables for Table {table.table_number}
        </h3>
        <p className="text-sm text-muted-stone mb-4">
          Select which tables can be combined with this table. Only flexible tables in the same location are shown.
        </p>

        {Object.entries(tablesByLocation).map(([location, locationTables]) => (
          <div key={location} className="mb-4">
            <h4 className="text-sm font-medium text-warm-stone mb-2">{location}</h4>
            <div className="grid grid-cols-3 gap-2">
              {locationTables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTable(t.id)}
                  className={`p-3 rounded-2xl border-2 transition-all text-left ${
                    selectedIds.includes(t.id)
                      ? 'border-deep-charcoal bg-soft-gray'
                      : 'border-border-gray hover:border-muted-stone'
                  }`}
                >
                  <div className="font-medium text-deep-charcoal">Table {t.table_number}</div>
                  <div className="text-xs text-muted-stone">{t.capacity} seats</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {allTables.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-stone">No other flexible tables in this location</p>
          </div>
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t border-border-gray">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedIds)}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-deep-charcoal text-white rounded-xl hover:bg-charcoal-dark transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : `Save (${selectedIds.length} selected)`}
          </button>
        </div>
      </div>
    </div>
  );
}
