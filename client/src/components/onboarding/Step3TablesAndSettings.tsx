/**
 * Step 3: Tables & Settings (Merged)
 *
 * Combined step for the simplified 4-step onboarding flow.
 * Merges table configuration with collapsed reservation settings using smart defaults.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { OnboardingStepProps, RestaurantArea, TableShape, TableConfiguration } from '../../types/onboarding.types';
import type { RestaurantSize } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';
import TableAreaCard, { TABLE_CAPACITIES } from './TableAreaCard';
import ReservationSettingsPanel from './ReservationSettingsPanel';

const AREA_TEMPLATE_KEYS: Record<string, string> = {
  Indoor: 'onboarding.areaIndoor',
  Patio: 'onboarding.areaPatio',
  Bar: 'onboarding.areaBar',
  'Private Room': 'onboarding.areaPrivateRoom',
  Custom: 'onboarding.areaCustom',
};

const AREA_TEMPLATES = ['Indoor', 'Patio', 'Bar', 'Private Room', 'Custom'];

function calculateTableDistribution(size: RestaurantSize, totalSeats: number): { capacity: number; count: number }[] {
  const distributions: Record<RestaurantSize, { capacity: number; ratio: number }[]> = {
    small: [
      { capacity: 2, ratio: 0.50 },
      { capacity: 4, ratio: 0.35 },
      { capacity: 6, ratio: 0.15 },
    ],
    medium: [
      { capacity: 2, ratio: 0.35 },
      { capacity: 4, ratio: 0.35 },
      { capacity: 6, ratio: 0.20 },
      { capacity: 8, ratio: 0.10 },
    ],
    large: [
      { capacity: 2, ratio: 0.25 },
      { capacity: 4, ratio: 0.35 },
      { capacity: 6, ratio: 0.25 },
      { capacity: 8, ratio: 0.15 },
    ],
  };

  const dist = distributions[size] || distributions.medium;
  const avgSeatsPerTable = dist.reduce((sum, d) => sum + d.capacity * d.ratio, 0);
  const estimatedTables = Math.ceil(totalSeats / avgSeatsPerTable);

  let remainingSeats = totalSeats;
  const result: { capacity: number; count: number }[] = [];

  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    const isLast = i === dist.length - 1;
    if (isLast) {
      result.push({ capacity: d.capacity, count: Math.max(0, Math.ceil(remainingSeats / d.capacity)) });
    } else {
      const count = Math.round(estimatedTables * d.ratio);
      remainingSeats -= count * d.capacity;
      result.push({ capacity: d.capacity, count: Math.max(0, count) });
    }
  }

  TABLE_CAPACITIES.forEach(cap => {
    if (!result.find(r => r.capacity === cap)) result.push({ capacity: cap, count: 0 });
  });
  result.sort((a, b) => a.capacity - b.capacity);
  return result;
}

/** Immutably set one field on a table config (keeps the value's type narrow). */
function applyTableField(
  config: TableConfiguration,
  field: 'count' | 'is_fixed_seating' | 'is_joinable',
  value: number | boolean,
): TableConfiguration {
  if (field === 'count') return { ...config, count: value as number };
  return { ...config, [field]: value as boolean };
}

export default function Step3TablesAndSettings({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (errors.tables) {
      setErrors((prev) => { const next = { ...prev }; delete next.tables; return next; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.areas]);

  useEffect(() => {
    if (hasInitialized.current) return;
    const profileData = data.profile_data;
    if (!profileData?.size || !profileData?.seat_count) return;
    const hasExistingTables = data.areas.some(area => area.tables.some(t => t.count > 0));
    if (hasExistingTables) { hasInitialized.current = true; return; }

    const distribution = calculateTableDistribution(profileData.size as RestaurantSize, profileData.seat_count);
    const indoorName = t('onboarding.areaIndoor');
    const updatedAreas = data.areas.map(area => {
      if (area.name === indoorName || area.name === 'Indoor') {
        return {
          ...area,
          tables: TABLE_CAPACITIES.map(cap => ({
            capacity: cap,
            count: distribution.find(d => d.capacity === cap)?.count || 0,
            shape: 'square' as TableShape,
            is_fixed_seating: false,
            is_joinable: true,
          })),
        };
      }
      return area;
    });
    updateData({ areas: updatedAreas });
    hasInitialized.current = true;
  }, [data.profile_data, data.areas, updateData]);

  const calculateTotals = () => {
    let totalTables = 0;
    let totalCapacity = 0;
    data.areas.forEach((area) => {
      area.tables.forEach((config) => {
        totalTables += config.count;
        totalCapacity += config.capacity * config.count;
      });
    });
    return { totalTables, totalCapacity };
  };

  const { totalTables, totalCapacity } = calculateTotals();

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (data.areas.length === 0) newErrors.areas = t('onboarding.areaRequired');
    if (totalTables === 0) newErrors.tables = t('onboarding.tableRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addArea = (template: string) => {
    const translatedName = AREA_TEMPLATE_KEYS[template] ? t(AREA_TEMPLATE_KEYS[template]) : template;
    const areaName = template === 'Custom' ? `${translatedName} ${data.areas.length + 1}` : translatedName;
    const newArea: RestaurantArea = { name: areaName, is_active: true, tables: [] };
    updateData({ areas: [...data.areas, newArea] });
  };

  const removeArea = (index: number) => {
    updateData({ areas: data.areas.filter((_, i) => i !== index) });
  };

  const updateAreaName = (index: number, name: string) => {
    const updatedAreas = [...data.areas];
    updatedAreas[index] = { ...updatedAreas[index], name };
    updateData({ areas: updatedAreas });
  };

  const getTableCount = (areaIndex: number, capacity: number, shape: TableShape): number => {
    return data.areas[areaIndex]?.tables.find(t => t.capacity === capacity && t.shape === shape)?.count || 0;
  };

  const getTableConfig = (areaIndex: number, capacity: number, shape: TableShape): TableConfiguration | undefined => {
    return data.areas[areaIndex]?.tables.find(t => t.capacity === capacity && t.shape === shape);
  };

  const updateTableConfig = (areaIndex: number, capacity: number, shape: TableShape, field: 'count' | 'is_fixed_seating' | 'is_joinable', value: number | boolean) => {
    // Fully immutable update — the previous version did `[...data.areas]`
    // (shallow) then mutated `area.tables` and the table object in place,
    // violating the project immutability rule and defeating referential
    // equality (memoized children, the localStorage persist snapshot).
    const updatedAreas = data.areas.map((area, i) => {
      if (i !== areaIndex) return area;
      const existingIdx = area.tables.findIndex(tc => tc.capacity === capacity && tc.shape === shape);
      if (existingIdx === -1) {
        const fresh: TableConfiguration = { capacity, count: 0, shape, is_fixed_seating: false, is_joinable: true };
        return { ...area, tables: [...area.tables, applyTableField(fresh, field, value)] };
      }
      return {
        ...area,
        tables: area.tables.map((tc, ti) => (ti === existingIdx ? applyTableField(tc, field, value) : tc)),
      };
    });
    updateData({ areas: updatedAreas });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">{t('onboarding.step3Heading')}</h2>
        <p className="text-stone-gray text-sm">{t('onboarding.step3Subtitle')}</p>
      </div>

      <div className="bg-soft-gray border border-glass-border-dark rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-deep-charcoal font-semibold text-lg">{t('onboarding.totalCapacity')}</p>
            <p className="text-stone-gray text-sm">{t('onboarding.acrossAllAreas')}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-deep-charcoal">{totalCapacity} {t('onboarding.seats')}</p>
            <p className="text-burgundy text-sm font-medium">{totalTables} {t('onboarding.tablesCount')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {data.areas.map((area, areaIndex) => (
          <TableAreaCard
            key={areaIndex}
            area={area}
            areaIndex={areaIndex}
            canRemove={data.areas.length > 1}
            getTableCount={getTableCount}
            getTableConfig={getTableConfig}
            updateTableConfig={updateTableConfig}
            updateAreaName={updateAreaName}
            onRemove={removeArea}
          />
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-deep-charcoal mb-2">{t('onboarding.addAnotherArea')}</p>
        <div className="flex flex-wrap gap-2">
          {AREA_TEMPLATES.map((template) => (
            <button
              key={template}
              onClick={() => addArea(template)}
              disabled={template !== 'Custom' && data.areas.some((a) => a.name === template || a.name === t(AREA_TEMPLATE_KEYS[template] || ''))}
              className="px-4 py-2 bg-white/60 backdrop-blur-glass-chip hover:bg-white/85 disabled:bg-white/30 disabled:text-muted-stone disabled:cursor-not-allowed text-deep-charcoal border border-glass-border-dark rounded-xl transition-colors text-sm"
            >
              + {t(AREA_TEMPLATE_KEYS[template] || template)}
            </button>
          ))}
        </div>
      </div>

      {errors.areas && <p className="text-sm text-burgundy">{errors.areas}</p>}
      {errors.tables && <p className="text-sm text-burgundy">{errors.tables}</p>}

      <ReservationSettingsPanel
        advanceBookingDays={data.advance_booking_days}
        bufferTime={data.buffer_time}
        cancellationPolicy={data.cancellation_policy}
        onUpdate={(key, value) => updateData({ [key]: value })}
      />

      <p className="text-xs text-muted-stone">{t('onboarding.adjustLater')}</p>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 bg-white/60 backdrop-blur-glass-chip hover:bg-white/85 border border-glass-border-dark text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2">
          <ThiingsIcon name="chevron-left" pxSize={20} />
          {t('onboarding.back')}
        </button>
        <button onClick={() => validate() && onNext?.()} className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300">
          {t('onboarding.continue')}
          <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
