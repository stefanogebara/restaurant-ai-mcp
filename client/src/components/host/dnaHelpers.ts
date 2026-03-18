import React from 'react';
import ThiingsIcon from '../common/ThiingsIcon';

export interface DNAStats {
  total_profiles: number;
  avg_confidence: number;
  dining_styles: Record<string, number>;
  day_type_preferences: Record<string, number>;
  time_slot_preferences: Record<string, number>;
  spontaneity_distribution: {
    very_spontaneous: number;
    spontaneous: number;
    moderate: number;
    planner: number;
    advance_planner: number;
  };
  total_occasions_detected: number;
  total_predictions_made: number;
}

export interface DNAOccasion {
  id: string;
  customer_id: string;
  occasion_type: string;
  occasion_date: string;
  recurrence: string;
  party_size: number;
  next_predicted_date: string;
  probability_score: number;
}

export interface CustomerListItem {
  customer_id: string;
  customer_name: string | null;
  dining_style: string;
  typical_party_size: number;
  profile_confidence: number;
  avg_check_per_person: number | null;
  spontaneity_score: number;
  preferred_time_slot: string;
  analysis_version: string | null;
}

export function getDiningStyleIcon(style: string): React.ReactElement {
  switch (style) {
    case 'business': return React.createElement(ThiingsIcon, { name: 'coffee', pxSize: 16 });
    default:         return React.createElement(ThiingsIcon, { name: 'users', pxSize: 16 });
  }
}

export function getDiningStyleColor(style: string): string {
  switch (style) {
    case 'solo':     return 'bg-stone-gray/10 border-stone-gray/30 text-stone-gray';
    case 'couple':   return 'bg-burgundy/10 border-burgundy/30 text-burgundy';
    case 'family':   return 'bg-violet-600/10 border-violet-600/30 text-violet-600';
    case 'business': return 'bg-amber-600/10 border-amber-600/30 text-amber-600';
    case 'group':    return 'bg-rose-600/10 border-rose-600/30 text-rose-600';
    default:         return 'bg-stone-gray/10 border-stone-gray/30 text-stone-gray';
  }
}

export function getSpontaneityColor(level: string): string {
  switch (level) {
    case 'very_spontaneous': return 'bg-burgundy';
    case 'spontaneous':      return 'bg-amber-600';
    case 'moderate':         return 'bg-amber-600';
    case 'planner':          return 'bg-rose-600';
    case 'advance_planner':  return 'bg-violet-600';
    default:                 return 'bg-stone-gray';
  }
}

export function getSpontaneityLabel(level: string): string {
  return level.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
