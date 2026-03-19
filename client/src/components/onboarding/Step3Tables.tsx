/**
 * Step 3: Table Configuration - Modern Elegant Design
 *
 * Allows restaurants to configure:
 * - Multiple dining areas (Indoor, Patio, Bar, Private Room)
 * - Table counts by capacity (2, 4, 6, 8+ person tables)
 * - Real-time capacity calculation
 * - Plan limit enforcement (Basic: max 10 tables)
 * - Auto-populate from profile (size/seat_count)
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps, RestaurantArea, TableShape, TableConfiguration } from '../../types/onboarding.types';
import type { RestaurantSize } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';
import { calculateTableDistribution } from '../../utils/tableDistribution';
import TableAreaCard, { TABLE_CAPACITIES } from './TableAreaCard';

const AREA_TEMPLATES = ['Indoor', 'Patio', 'Bar', 'Private Room', 'Custom'];

export default function Step3Tables({ data, updateData, onNext, onBack }: OnboardingStepProps) {
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
    const updatedAreas = data.areas.map(area => {
      if (area.name === 'Indoor') {
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

  const getPlanLimit = () => {
    const plan = data.plan?.toLowerCase() || 'starter';
    return (plan === 'growth' || plan === 'scale') ? Infinity : 10;
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (data.areas.length === 0) newErrors.areas = 'At least one area is required';
    if (totalTables === 0) newErrors.tables = 'At least one table is required';
    const planLimit = getPlanLimit();
    if (totalTables > planLimit) {
      newErrors.tables = `Basic plan supports up to ${planLimit} tables. You've configured ${totalTables} tables.`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addArea = (template: string) => {
    const areaName = template === 'Custom' ? `Area ${data.areas.length + 1}` : template;
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

  const getTableConfig = (areaIndex: number, capacity: number, shape: TableShape): TableConfiguration | undefined => {
    return data.areas[areaIndex]?.tables.find(t => t.capacity === capacity && t.shape === shape);
  };

  const getTableCount = (areaIndex: number, capacity: number, shape: TableShape): number => {
    return getTableConfig(areaIndex, capacity, shape)?.count || 0;
  };

  const updateTableConfig = (areaIndex: number, capacity: number, shape: TableShape, field: 'count' | 'is_fixed_seating' | 'is_joinable', value: number | boolean) => {
    const updatedAreas = [...data.areas];
    const area = updatedAreas[areaIndex];
    let configIndex = area.tables.findIndex(t => t.capacity === capacity && t.shape === shape);
    if (configIndex === -1) {
      area.tables.push({ capacity, count: 0, shape, is_fixed_seating: false, is_joinable: true });
      configIndex = area.tables.length - 1;
    }
    (area.tables[configIndex] as unknown as Record<string, unknown>)[field] = value;
    updateData({ areas: updatedAreas });
  };

  const targetSeats = data.profile_data?.seat_count;
  const isMatch = targetSeats ? Math.abs(totalCapacity - targetSeats) <= 2 : false;
  const planLimit = getPlanLimit();

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Let's set up your tables</h2>
        <p className="text-stone-gray text-sm">Define your dining areas and how many tables of each size you have</p>
      </div>

      <div className={`bg-soft-gray border ${isMatch ? 'border-burgundy/40' : 'border-border-gray'} rounded-xl p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-deep-charcoal font-semibold text-lg">Total Capacity</p>
            <p className="text-stone-gray text-sm">Across all dining areas</p>
            {targetSeats && (
              <p className={`text-sm mt-1 ${isMatch ? 'text-burgundy' : 'text-stone-gray'}`}>
                {isMatch ? 'Matches your profile' : `Target: ${targetSeats} seats`}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${isMatch ? 'text-burgundy' : 'text-deep-charcoal'}`}>{totalCapacity} seats</p>
            <p className="text-burgundy text-sm font-medium">{totalTables} tables</p>
          </div>
        </div>
      </div>

      {data.profile_data?.size && data.profile_data?.seat_count && totalTables > 0 && (
        <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <ThiingsIcon name="info" pxSize={20} className="text-burgundy" />
            <p className="text-sm text-stone-gray">
              Tables pre-configured based on your {data.profile_data.size} restaurant profile ({data.profile_data.seat_count} seats). Adjust as needed.
            </p>
          </div>
        </div>
      )}

      {totalTables > planLimit && (
        <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <ThiingsIcon name="alert-triangle" pxSize={24} className="text-burgundy flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-deep-charcoal font-semibold">Basic Plan Limit</p>
              <p className="text-stone-gray text-sm mt-1">
                You've configured {totalTables} tables, but the Basic plan supports up to {planLimit} tables.
              </p>
              <div className="mt-3 space-x-3">
                <button onClick={() => window.location.href = '/#pricing'} className="px-4 py-2 bg-burgundy text-white font-semibold rounded-xl text-sm hover:bg-burgundy-dark transition-colors">
                  Upgrade to Professional
                </button>
                <span className="text-stone-gray text-sm">or remove {totalTables - planLimit} tables</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
        <p className="text-sm font-semibold text-deep-charcoal mb-2">Add another area:</p>
        <div className="flex flex-wrap gap-2">
          {AREA_TEMPLATES.map((template) => (
            <button
              key={template}
              onClick={() => addArea(template)}
              disabled={template !== 'Custom' && data.areas.some((a) => a.name === template)}
              className="px-4 py-2 bg-white hover:bg-soft-gray disabled:bg-soft-gray disabled:text-muted-stone disabled:cursor-not-allowed text-deep-charcoal border border-border-gray rounded-xl transition-colors text-sm"
            >
              + {template}
            </button>
          ))}
        </div>
      </div>

      {errors.areas && <p className="text-sm text-burgundy">{errors.areas}</p>}
      {errors.tables && <p className="text-sm text-burgundy">{errors.tables}</p>}

      <p className="text-xs text-muted-stone">You can always adjust your table layout later in Settings.</p>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2">
          <ThiingsIcon name="chevron-left" pxSize={20} />
          Back
        </button>
        <button onClick={() => validate() && onNext?.()} className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300">
          Continue
          <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
