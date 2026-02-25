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
import ThiingsIcon from '../common/ThiingsIcon';
import { calculateTableDistribution } from '../../utils/tableDistribution';

const AREA_TEMPLATES = ['Indoor', 'Patio', 'Bar', 'Private Room', 'Custom'];
const TABLE_CAPACITIES = [2, 4, 6, 8];

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
    // Default to square tables for the pre-population
    const updatedAreas = data.areas.map(area => {
      if (area.name === 'Indoor') {
        return {
          ...area,
          tables: TABLE_CAPACITIES.map(cap => ({
            capacity: cap,
            count: distribution.find(d => d.capacity === cap)?.count || 0,
            shape: 'square' as TableShape, // Default to square tables
            is_fixed_seating: false,
            is_joinable: true
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

  // Note: calculateTotals already handles the new structure correctly since
  // it iterates over all table configs regardless of shape

  const { totalTables, totalCapacity } = calculateTotals();

  // Check plan limits (Starter: 10 tables, Growth+: unlimited)
  const getPlanLimit = () => {
    // Check the actual plan from onboarding data
    const plan = data.plan?.toLowerCase() || 'starter';
    if (plan === 'growth' || plan === 'scale') {
      return Infinity; // Growth+ plans have unlimited tables
    }
    return 10; // Starter plan limit
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
      tables: [], // Start empty, user adds what they need
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

  // Get table config for specific capacity and shape
  const getTableConfig = (areaIndex: number, capacity: number, shape: TableShape): TableConfiguration | undefined => {
    return data.areas[areaIndex]?.tables.find(
      t => t.capacity === capacity && t.shape === shape
    );
  };

  // Get table count for specific capacity and shape
  const getTableCount = (areaIndex: number, capacity: number, shape: TableShape): number => {
    return getTableConfig(areaIndex, capacity, shape)?.count || 0;
  };

  // Update table configuration
  const updateTableConfig = (
    areaIndex: number,
    capacity: number,
    shape: TableShape,
    field: 'count' | 'is_fixed_seating' | 'is_joinable',
    value: number | boolean
  ) => {
    const updatedAreas = [...data.areas];
    const area = updatedAreas[areaIndex];

    // Find existing config or create new one
    let configIndex = area.tables.findIndex(t => t.capacity === capacity && t.shape === shape);

    if (configIndex === -1) {
      // Create new config
      area.tables.push({
        capacity,
        count: 0,
        shape,
        is_fixed_seating: false,
        is_joinable: true
      });
      configIndex = area.tables.length - 1;
    }

    // Update the field
    (area.tables[configIndex] as Record<string, unknown>)[field] = value;

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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Let's set up your tables</h2>
        <p className="text-stone-gray text-sm">Define your dining areas and how many tables of each size you have</p>
      </div>

      {/* Total Capacity Summary */}
      {(() => {
        const targetSeats = data.profile_data?.seat_count;
        const isMatch = targetSeats && Math.abs(totalCapacity - targetSeats) <= 2;

        return (
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
        );
      })()}

      {/* Pre-configured notice */}
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

      {/* Plan Limit Warning */}
      {totalTables > getPlanLimit() && (
        <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <ThiingsIcon name="alert-triangle" pxSize={24} className="text-burgundy flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-deep-charcoal font-semibold">Basic Plan Limit</p>
              <p className="text-stone-gray text-sm mt-1">
                You've configured {totalTables} tables, but the Basic plan supports up to {getPlanLimit()} tables.
              </p>
              <div className="mt-3 space-x-3">
                <button
                  onClick={() => window.location.href = '/#pricing'}
                  className="px-4 py-2 bg-burgundy text-white font-semibold rounded-xl text-sm hover:bg-burgundy-dark transition-colors"
                >
                  Upgrade to Professional
                </button>
                <span className="text-stone-gray text-sm">or remove {totalTables - getPlanLimit()} tables</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Areas Configuration */}
      <div className="space-y-4">
        {data.areas.map((area, areaIndex) => (
          <div key={areaIndex} className="bg-soft-gray border border-border-gray rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={area.name}
                onChange={(e) => updateAreaName(areaIndex, e.target.value)}
                className="text-lg font-semibold bg-transparent border-none text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy rounded px-2 py-1"
              />
              {data.areas.length > 1 && (
                <button
                  onClick={() => removeArea(areaIndex)}
                  className="p-2 hover:bg-red-600/10 text-red-600 rounded-xl transition-colors"
                  aria-label="Remove area"
                >
                  <ThiingsIcon name="trash" pxSize={20} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              {TABLE_CAPACITIES.map((capacity) => (
                <div key={capacity} className="bg-white rounded-xl p-4 border border-border-gray">
                  <h4 className="text-sm font-semibold text-deep-charcoal mb-3">
                    {capacity}-Person Tables
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Round Tables */}
                    <div className="p-3 bg-soft-gray rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full border-2 border-burgundy" />
                        <span className="text-sm font-medium text-deep-charcoal">Round</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={getTableCount(areaIndex, capacity, 'round') || ''}
                        placeholder="0"
                        onChange={(e) => updateTableConfig(areaIndex, capacity, 'round', 'count', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy text-sm"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          checked={getTableConfig(areaIndex, capacity, 'round')?.is_fixed_seating || false}
                          onChange={(e) => updateTableConfig(areaIndex, capacity, 'round', 'is_fixed_seating', e.target.checked)}
                          className="w-4 h-4 rounded border-border-gray text-burgundy focus:ring-burgundy"
                        />
                        <span className="text-xs text-stone-gray">Fixed seating</span>
                      </div>
                    </div>

                    {/* Square Tables */}
                    <div className="p-3 bg-soft-gray rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded border-2 border-burgundy" />
                        <span className="text-sm font-medium text-deep-charcoal">Square</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={getTableCount(areaIndex, capacity, 'square') || ''}
                        placeholder="0"
                        onChange={(e) => updateTableConfig(areaIndex, capacity, 'square', 'count', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy text-sm"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          checked={getTableConfig(areaIndex, capacity, 'square')?.is_fixed_seating || false}
                          onChange={(e) => updateTableConfig(areaIndex, capacity, 'square', 'is_fixed_seating', e.target.checked)}
                          className="w-4 h-4 rounded border-border-gray text-burgundy focus:ring-burgundy"
                        />
                        <span className="text-xs text-stone-gray">Fixed seating</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add Area Buttons */}
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

      {errors.areas && (
        <p className="text-sm text-burgundy">{errors.areas}</p>
      )}
      {errors.tables && (
        <p className="text-sm text-burgundy">{errors.tables}</p>
      )}

      <p className="text-xs text-muted-stone">
        You can always adjust your table layout later in Settings.
      </p>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          Back
        </button>
        <button
          onClick={handleContinue}
          className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300"
        >
          Continue
          <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
