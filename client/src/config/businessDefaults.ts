/**
 * Business Default Constants
 *
 * Centralized values for revenue calculations, customer segmentation,
 * and risk thresholds used across host dashboard components.
 */

import { formatCurrency } from '../utils/currency';

/** Default average revenue per person (BRL) for potential-value calculations */
export const DEFAULT_AVG_REVENUE_PER_PERSON = 50;

/** LTV tier thresholds for customer segmentation (raw values) */
export const LTV_TIERS = {
  vip: { min: 500, label: `${formatCurrency(500)}+` },
  regular: { min: 200, label: `${formatCurrency(200)}-${formatCurrency(500)}` },
  occasional: { min: 50, label: `${formatCurrency(50)}-${formatCurrency(200)}` },
  new: { min: 0, label: `<${formatCurrency(50)}` },
} as const;

/** Party size threshold considered "large" for risk assessment */
export const LARGE_PARTY_THRESHOLD = 8;

/** Recommended deposit range for high-risk reservations */
export const DEPOSIT_RECOMMENDATION = `${formatCurrency(10)}-${formatCurrency(20)}`;
