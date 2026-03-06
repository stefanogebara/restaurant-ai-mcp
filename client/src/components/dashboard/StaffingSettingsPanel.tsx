import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffingConfig, useSaveStaffingConfig } from '../../hooks/useStaffingConfig';
import type { StaffingConfig, StaffingRole } from '../../hooks/useStaffingConfig';
import { useToast } from '../../contexts/ToastContext';

export default function StaffingSettingsPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: config, isLoading } = useStaffingConfig();
  const saveMutation = useSaveStaffingConfig();

  const [pendingRoles, setPendingRoles] = useState<StaffingRole[] | null>(null);

  const roles = pendingRoles ?? config?.roles ?? [];
  const isDirty = pendingRoles !== null;

  const handleChange = (index: number, value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) return;
    const base = config?.roles ?? [];
    const updated = base.map((r, i) =>
      i === index ? { ...r, covers_per_staff: parsed } : r
    );
    setPendingRoles(updated);
  };

  const handleSave = () => {
    if (!isDirty || !pendingRoles) return;
    const payload: StaffingConfig = { roles: pendingRoles };
    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(t('settings.staffingRatiosSaved'));
        setPendingRoles(null);
      },
      onError: () => toast.error(t('settings.staffingRatiosSaveFailed')),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-40" />
        {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
          {t('settings.staffingRatios')}
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? t('common.loading') : t('common.save')}
        </button>
      </div>

      <p className="text-xs text-warm-stone">
        {t('settings.staffingRatiosDesc')}
      </p>

      <div className="space-y-3">
        {roles.map((role, index) => (
          <div key={role.name} className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-deep-charcoal w-16">{role.name}</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-warm-stone" htmlFor={`role-${role.name}`}>
                {t('settings.coversPerStaff')}
              </label>
              <input
                id={`role-${role.name}`}
                type="number"
                min={1}
                max={99}
                value={
                  pendingRoles
                    ? (pendingRoles[index]?.covers_per_staff ?? role.covers_per_staff)
                    : role.covers_per_staff
                }
                onChange={(e) => handleChange(index, e.target.value)}
                className="w-16 border border-border-gray rounded-lg px-2 py-1 text-sm text-deep-charcoal text-right focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                aria-label={`${role.name} covers per staff`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
