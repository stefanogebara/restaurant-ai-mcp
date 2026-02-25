/**
 * Step 3: Tables & Settings (Merged)
 *
 * Combined step for the simplified 4-step onboarding flow.
 * Merges table configuration with collapsed reservation settings using smart defaults.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps, RestaurantArea, TableShape, TableConfiguration } from '../../types/onboarding.types';
import type { RestaurantSize } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';

const AREA_TEMPLATES = ['Indoor', 'Patio', 'Bar', 'Private Room', 'Custom'];
const TABLE_CAPACITIES = [2, 4, 6, 8];

const CANCELLATION_POLICIES = [
  'Free cancellation up to 2 hours before reservation',
  'Free cancellation up to 24 hours before reservation',
  'Free cancellation up to 48 hours before reservation',
  'No cancellations allowed',
];

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
    if (!result.find(r => r.capacity === cap)) {
      result.push({ capacity: cap, count: 0 });
    }
  });

  result.sort((a, b) => a.capacity - b.capacity);
  return result;
}

export default function Step3TablesAndSettings({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (errors.tables) {
      setErrors((prev) => {
        const { tables, ...rest } = prev;
        return rest;
      });
    }
  }, [data.areas]);

  // Pre-populate tables from profile data
  useEffect(() => {
    if (hasInitialized.current) return;
    const profileData = data.profile_data;
    if (!profileData?.size || !profileData?.seat_count) return;

    const hasExistingTables = data.areas.some(area => area.tables.some(t => t.count > 0));
    if (hasExistingTables) {
      hasInitialized.current = true;
      return;
    }

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

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (data.areas.length === 0) newErrors.areas = 'At least one area is required';
    if (totalTables === 0) newErrors.tables = 'At least one table is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate() && onNext) onNext();
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

  const getTableCount = (areaIndex: number, capacity: number, shape: TableShape): number => {
    return data.areas[areaIndex]?.tables.find(t => t.capacity === capacity && t.shape === shape)?.count || 0;
  };

  const getTableConfig = (areaIndex: number, capacity: number, shape: TableShape): TableConfiguration | undefined => {
    return data.areas[areaIndex]?.tables.find(t => t.capacity === capacity && t.shape === shape);
  };

  const updateTableConfig = (
    areaIndex: number,
    capacity: number,
    shape: TableShape,
    field: 'count' | 'is_fixed_seating' | 'is_joinable',
    value: number | boolean,
  ) => {
    const updatedAreas = [...data.areas];
    const area = updatedAreas[areaIndex];
    let configIndex = area.tables.findIndex(t => t.capacity === capacity && t.shape === shape);

    if (configIndex === -1) {
      area.tables.push({ capacity, count: 0, shape, is_fixed_seating: false, is_joinable: true });
      configIndex = area.tables.length - 1;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (area.tables[configIndex] as any)[field] = value;
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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Tables & Settings</h2>
        <p className="text-stone-gray text-sm">Set up your dining areas and reservation preferences</p>
      </div>

      {/* Total Capacity Summary */}
      <div className="bg-soft-gray border border-border-gray rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-deep-charcoal font-semibold text-lg">Total Capacity</p>
            <p className="text-stone-gray text-sm">Across all dining areas</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-deep-charcoal">{totalCapacity} seats</p>
            <p className="text-burgundy text-sm font-medium">{totalTables} tables</p>
          </div>
        </div>
      </div>

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
                  <h4 className="text-sm font-semibold text-deep-charcoal mb-3">{capacity}-Person Tables</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Round */}
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
                    {/* Square */}
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

      {errors.areas && <p className="text-sm text-burgundy">{errors.areas}</p>}
      {errors.tables && <p className="text-sm text-burgundy">{errors.tables}</p>}

      {/* Collapsible Reservation Settings */}
      <div className="border border-border-gray rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
          className="w-full flex items-center justify-between px-5 py-4 bg-soft-gray hover:bg-stone-pale transition-colors"
        >
          <div className="flex items-center gap-3">
            <ThiingsIcon name="gear" pxSize={20} className="text-stone-gray" />
            <div className="text-left">
              <span className="text-sm font-semibold text-deep-charcoal">Reservation Settings</span>
              <p className="text-xs text-warm-stone">
                Booking window: {data.advance_booking_days} days | Buffer: {data.buffer_time} min
              </p>
            </div>
          </div>
          <ThiingsIcon name="chevron-down" pxSize={20} className={`text-stone-gray transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {showSettings && (
          <div className="px-5 py-4 space-y-4 bg-white">
            {/* Advance Booking Days */}
            <div>
              <label htmlFor="advance_booking_days" className="block text-sm font-semibold text-deep-charcoal mb-2">
                How far in advance can customers book?
              </label>
              <select
                id="advance_booking_days"
                value={data.advance_booking_days}
                onChange={(e) => updateData({ advance_booking_days: parseInt(e.target.value) })}
                className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days (Recommended)</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>

            {/* Buffer Time */}
            <div>
              <label htmlFor="buffer_time" className="block text-sm font-semibold text-deep-charcoal mb-2">
                Buffer time between reservations
              </label>
              <select
                id="buffer_time"
                value={data.buffer_time}
                onChange={(e) => updateData({ buffer_time: parseInt(e.target.value) })}
                className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
              >
                <option value={0}>0 minutes (No buffer)</option>
                <option value={15}>15 minutes (Recommended)</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>

            {/* Cancellation Policy */}
            <div>
              <label htmlFor="cancellation_policy" className="block text-sm font-semibold text-deep-charcoal mb-2">
                Cancellation Policy
              </label>
              <select
                id="cancellation_policy"
                value={data.cancellation_policy}
                onChange={(e) => updateData({ cancellation_policy: e.target.value })}
                className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
              >
                {CANCELLATION_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>{policy}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-stone">
        You can always adjust tables and settings later in your dashboard.
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
