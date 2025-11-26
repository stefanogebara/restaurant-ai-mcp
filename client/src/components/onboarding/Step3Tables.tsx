/**
 * Step 3: Table Configuration
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
import type { OnboardingStepProps, RestaurantArea } from '../../types/onboarding.types';
import type { RestaurantSize } from '../../types/profile.types';
import '../../landing/styles/glass-morphism.css';

const AREA_TEMPLATES = ['Indoor', 'Patio', 'Bar', 'Private Room', 'Custom'];
const TABLE_CAPACITIES = [2, 4, 6, 8];

/**
 * Calculate recommended table distribution based on restaurant size and total seats
 */
function calculateTableDistribution(size: RestaurantSize, totalSeats: number): { capacity: number; count: number }[] {
  // Distribution ratios based on restaurant size
  const distributions: Record<RestaurantSize, { capacity: number; ratio: number }[]> = {
    small: [
      { capacity: 2, ratio: 0.50 },  // 50% of tables are 2-tops
      { capacity: 4, ratio: 0.35 },  // 35% are 4-tops
      { capacity: 6, ratio: 0.15 },  // 15% are 6-tops
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

  // Calculate average seats per table based on distribution
  const avgSeatsPerTable = dist.reduce((sum, d) => sum + d.capacity * d.ratio, 0);

  // Estimate total tables needed
  const estimatedTables = Math.ceil(totalSeats / avgSeatsPerTable);

  // Calculate table counts for each capacity
  let remainingSeats = totalSeats;
  const result: { capacity: number; count: number }[] = [];

  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    const isLast = i === dist.length - 1;

    if (isLast) {
      // Last capacity type gets remaining tables
      const count = Math.max(0, Math.ceil(remainingSeats / d.capacity));
      result.push({ capacity: d.capacity, count });
    } else {
      // Calculate count based on ratio
      const count = Math.round(estimatedTables * d.ratio);
      const seatsUsed = count * d.capacity;
      remainingSeats -= seatsUsed;
      result.push({ capacity: d.capacity, count: Math.max(0, count) });
    }
  }

  // Ensure all capacities are represented
  TABLE_CAPACITIES.forEach(cap => {
    if (!result.find(r => r.capacity === cap)) {
      result.push({ capacity: cap, count: 0 });
    }
  });

  // Sort by capacity
  result.sort((a, b) => a.capacity - b.capacity);

  return result;
}

export default function Step3Tables({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const hasInitialized = useRef(false);

  // Clear errors when table configuration changes
  useEffect(() => {
    // Clear the tables error when areas data changes
    if (errors.tables) {
      setErrors((prev) => {
        const { tables, ...rest } = prev;
        return rest;
      });
    }
  }, [data.areas]);

  // Pre-populate tables from profile data
  useEffect(() => {
    // Only run once and if profile data exists
    if (hasInitialized.current) return;

    const profileData = data.profile_data;
    if (!profileData?.size || !profileData?.seat_count) return;

    // Check if tables are already configured (not all zeros)
    const hasExistingTables = data.areas.some(area =>
      area.tables.some(t => t.count > 0)
    );

    if (hasExistingTables) {
      hasInitialized.current = true;
      return;
    }

    // Calculate recommended table distribution
    const distribution = calculateTableDistribution(
      profileData.size as RestaurantSize,
      profileData.seat_count
    );

    // Update the Indoor area with the calculated distribution
    const updatedAreas = data.areas.map(area => {
      if (area.name === 'Indoor') {
        return {
          ...area,
          tables: TABLE_CAPACITIES.map(cap => ({
            capacity: cap,
            count: distribution.find(d => d.capacity === cap)?.count || 0
          }))
        };
      }
      return area;
    });

    updateData({ areas: updatedAreas });
    hasInitialized.current = true;
  }, [data.profile_data, data.areas, updateData]);

  // Calculate total tables and capacity
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

  // Check plan limits (Basic: 10 tables, Pro: unlimited)
  const getPlanLimit = () => {
    // This would come from subscription data in production
    // For now, assume Basic plan
    return 10; // Basic plan limit
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (data.areas.length === 0) {
      newErrors.areas = 'At least one area is required';
    }

    if (totalTables === 0) {
      newErrors.tables = 'At least one table is required';
    }

    const planLimit = getPlanLimit();
    if (totalTables > planLimit) {
      newErrors.tables = `Basic plan supports up to ${planLimit} tables. You've configured ${totalTables} tables.`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate() && onNext) {
      onNext();
    }
  };

  const addArea = (template: string) => {
    const areaName = template === 'Custom' ? `Area ${data.areas.length + 1}` : template;
    const newArea: RestaurantArea = {
      name: areaName,
      is_active: true,
      tables: TABLE_CAPACITIES.map((capacity) => ({ capacity, count: 0 })),
    };
    updateData({ areas: [...data.areas, newArea] });
  };

  const removeArea = (index: number) => {
    const updatedAreas = data.areas.filter((_, i) => i !== index);
    updateData({ areas: updatedAreas });
  };

  const updateAreaName = (index: number, name: string) => {
    const updatedAreas = [...data.areas];
    updatedAreas[index] = { ...updatedAreas[index], name };
    updateData({ areas: updatedAreas });
  };

  const updateTableCount = (areaIndex: number, capacityIndex: number, count: number) => {
    const updatedAreas = [...data.areas];
    updatedAreas[areaIndex].tables[capacityIndex].count = Math.max(0, count);
    updateData({ areas: updatedAreas });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Let's set up your tables</h2>
        <p className="text-gray-300 text-sm">Configure your dining areas and table layout</p>
      </div>

      {/* Total Capacity Summary */}
      {(() => {
        const targetSeats = data.profile_data?.seat_count;
        const isMatch = targetSeats && Math.abs(totalCapacity - targetSeats) <= 2;
        const isOver = targetSeats && totalCapacity > targetSeats + 2;
        const isUnder = targetSeats && totalCapacity < targetSeats - 2;

        return (
          <div className={`bg-gradient-to-r ${isMatch ? 'from-green-500/20 to-emerald-500/20 border-green-400/50' : 'from-indigo-500/20 to-purple-500/20 border-white/30'} border rounded-lg p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-lg">Total Capacity</p>
                <p className="text-gray-300 text-sm">Across all areas</p>
                {targetSeats && (
                  <p className={`text-sm mt-1 ${isMatch ? 'text-green-400' : isOver ? 'text-amber-400' : isUnder ? 'text-amber-400' : 'text-gray-400'}`}>
                    {isMatch ? '✓ Matches your profile!' : `Target: ${targetSeats} seats`}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${isMatch ? 'text-green-400' : 'text-white'}`}>{totalCapacity} seats</p>
                <p className="text-indigo-300 text-sm">{totalTables} tables</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pre-configured notice */}
      {data.profile_data?.size && data.profile_data?.seat_count && totalTables > 0 && (
        <div className="bg-indigo-500/10 border border-indigo-400/30 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-indigo-200">
              Tables pre-configured based on your {data.profile_data.size} restaurant profile ({data.profile_data.seat_count} seats). Adjust as needed.
            </p>
          </div>
        </div>
      )}

      {/* Plan Limit Warning */}
      {totalTables > getPlanLimit() && (
        <div className="bg-amber-500/20 border border-amber-400/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-white font-semibold">Basic Plan Limit</p>
              <p className="text-amber-200 text-sm mt-1">
                You've configured {totalTables} tables, but Basic plan supports up to {getPlanLimit()} tables.
              </p>
              <div className="mt-3 space-x-3">
                <button
                  onClick={() => window.location.href = '/#pricing'}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-lg text-sm hover:opacity-90"
                >
                  Upgrade to Professional
                </button>
                <span className="text-gray-300 text-sm">or remove {totalTables - getPlanLimit()} tables</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Areas Configuration */}
      <div className="space-y-4">
        {data.areas.map((area, areaIndex) => (
          <div key={areaIndex} className="bg-white/5 border border-white/20 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={area.name}
                onChange={(e) => updateAreaName(areaIndex, e.target.value)}
                className="text-lg font-semibold bg-transparent border-none text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded px-2 py-1"
              />
              {data.areas.length > 1 && (
                <button
                  onClick={() => removeArea(areaIndex)}
                  className="p-2 hover:bg-red-500/20 text-red-300 rounded-lg transition-colors"
                  title="Remove area"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {area.tables.map((tableConfig, tableIndex) => (
                <div key={tableIndex} className="bg-white/10 rounded-lg p-3">
                  <label className="block text-sm font-medium text-white mb-2">
                    {tableConfig.capacity}-person tables
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tableConfig.count}
                    onChange={(e) => updateTableCount(areaIndex, tableIndex, parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {tableConfig.count * tableConfig.capacity} seats
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add Area Buttons */}
      <div>
        <p className="text-sm font-semibold text-white mb-2">Add another area:</p>
        <div className="flex flex-wrap gap-2">
          {AREA_TEMPLATES.map((template) => (
            <button
              key={template}
              onClick={() => addArea(template)}
              disabled={template !== 'Custom' && data.areas.some((a) => a.name === template)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
            >
              + {template}
            </button>
          ))}
        </div>
      </div>

      {errors.areas && (
        <p className="text-sm text-red-400">{errors.areas}</p>
      )}
      {errors.tables && (
        <p className="text-sm text-red-400">{errors.tables}</p>
      )}

      <p className="text-xs text-gray-400">
        Pro tip: You can always adjust this later in Settings
      </p>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={handleContinue}
          className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2"
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
