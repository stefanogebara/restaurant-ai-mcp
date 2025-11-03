/**
 * Pricing Rule Create/Edit Modal
 * Simple 3-step wizard for non-tech-savvy restaurant staff
 */

import { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Clock, TrendingUp, Calendar, Info } from 'lucide-react';

interface PricingRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editRule?: any; // Existing rule for editing
}

type RuleType = 'time_based' | 'demand_based' | 'event_based' | null;
type ModifierType = 'percentage' | 'fixed';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function PricingRuleModal({ isOpen, onClose, onSuccess, editRule }: PricingRuleModalProps) {
  const [step, setStep] = useState(1);
  const [ruleType, setRuleType] = useState<RuleType>(null);
  const [ruleName, setRuleName] = useState('');

  // Time-based fields
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('22:00');

  // Demand-based fields
  const [occupancyThreshold, setOccupancyThreshold] = useState(80);

  // Event-based fields
  const [eventName, setEventName] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');

  // Price modifier
  const [modifierType, setModifierType] = useState<ModifierType>('percentage');
  const [modifierValue, setModifierValue] = useState(25);
  const [priority, setPriority] = useState(100);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing rule data when editing
  useEffect(() => {
    if (editRule) {
      setRuleType(editRule.rule_type);
      setRuleName(editRule.rule_name);
      setModifierType(editRule.price_modifier_type);
      setModifierValue(editRule.price_modifier_value);
      setPriority(editRule.priority);

      if (editRule.rule_type === 'time_based') {
        setStartTime(editRule.time_slot_start || '19:00');
        setEndTime(editRule.time_slot_end || '22:00');
        if (editRule.day_of_week) {
          setSelectedDays(editRule.day_of_week.split(','));
        }
      } else if (editRule.rule_type === 'demand_based') {
        setOccupancyThreshold(editRule.occupancy_threshold || 80);
      } else if (editRule.rule_type === 'event_based') {
        setEventName(editRule.event_name || '');
        setEventStartDate(editRule.event_start_date || '');
        setEventEndDate(editRule.event_end_date || '');
      }
    }
  }, [editRule]);

  const handleClose = () => {
    setStep(1);
    setRuleType(null);
    setRuleName('');
    setSelectedDays([]);
    setOccupancyThreshold(80);
    setEventName('');
    setEventStartDate('');
    setEventEndDate('');
    setModifierValue(25);
    onClose();
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const calculatePreview = () => {
    const basePrice = 50;
    let finalPrice = basePrice;

    if (modifierType === 'percentage') {
      finalPrice = basePrice * (1 + modifierValue / 100);
    } else {
      finalPrice = basePrice + modifierValue;
    }

    return { basePrice, finalPrice };
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Build rule data based on type
      const ruleData: any = {
        rule_name: ruleName,
        rule_type: ruleType,
        price_modifier_type: modifierType,
        price_modifier_value: modifierValue,
        priority: priority,
        is_active: true
      };

      // Add type-specific fields
      if (ruleType === 'time_based') {
        ruleData.day_of_week = selectedDays.join(',');
        ruleData.time_slot_start = startTime + ':00';
        ruleData.time_slot_end = endTime + ':00';
      } else if (ruleType === 'demand_based') {
        ruleData.occupancy_threshold = occupancyThreshold;
      } else if (ruleType === 'event_based') {
        ruleData.event_name = eventName;
        ruleData.event_start_date = eventStartDate;
        ruleData.event_end_date = eventEndDate;
      }

      // Create or update
      const endpoint = editRule
        ? `/api/pricing?action=update-rule&rule_id=${editRule.id}`
        : '/api/pricing?action=create-rule';

      const method = editRule ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      });

      const result = await response.json();

      if (result.success) {
        onSuccess();
        handleClose();
      } else {
        alert(result.error || 'Failed to save rule');
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save rule. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const { basePrice, finalPrice } = calculatePreview();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-2xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-2xl font-bold text-foreground">
            {editRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 p-4 bg-muted/30">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                s < step ? 'bg-emerald-500 text-white' :
                s === step ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {s < step ? <Check className="w-5 h-5" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-1 rounded ${s < step ? 'bg-emerald-500' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Step 1: Choose Rule Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-2">What triggers this pricing change?</h3>
                <p className="text-sm text-muted-foreground">Choose when you want to adjust your prices</p>
              </div>

              <div className="space-y-3">
                {/* Time-Based */}
                <button
                  onClick={() => {
                    setRuleType('time_based');
                    setRuleName('Weekend Dinner Premium');
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    ruleType === 'time_based'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-border hover:border-blue-500/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Clock className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground mb-1">Time-Based Pricing</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Change prices at specific times or days
                      </p>
                      <div className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded inline-block">
                        Example: Friday/Saturday dinner rush (7-10 PM)
                      </div>
                    </div>
                  </div>
                </button>

                {/* Demand-Based */}
                <button
                  onClick={() => {
                    setRuleType('demand_based');
                    setRuleName('High Occupancy Surge');
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    ruleType === 'demand_based'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-border hover:border-emerald-500/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground mb-1">Demand-Based Pricing</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Change prices when restaurant fills up
                      </p>
                      <div className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded inline-block">
                        Example: When 80% full, increase prices by 20%
                      </div>
                    </div>
                  </div>
                </button>

                {/* Event-Based */}
                <button
                  onClick={() => {
                    setRuleType('event_based');
                    setRuleName('Special Event Premium');
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    ruleType === 'event_based'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-border hover:border-purple-500/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground mb-1">Event-Based Pricing</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Change prices for special dates
                      </p>
                      <div className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded inline-block">
                        Example: Valentine's Day, New Year's Eve
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Set Details */}
          {step === 2 && ruleType && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-2">Set Rule Details</h3>
                <p className="text-sm text-muted-foreground">When should this rule apply?</p>
              </div>

              {/* Rule Name */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Rule Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Weekend Dinner Premium"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Time-Based Fields */}
              {ruleType === 'time_based' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Which Days? <span className="text-red-400">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            selectedDays.includes(day)
                              ? 'bg-blue-500 text-white'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        Start Time <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        End Time <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Demand-Based Fields */}
              {ruleType === 'demand_based' && (
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    When Occupancy Reaches <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="50"
                      max="100"
                      step="5"
                      value={occupancyThreshold}
                      onChange={(e) => setOccupancyThreshold(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <div className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg font-bold min-w-[80px] text-center">
                      {occupancyThreshold}%
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Rule activates when restaurant is {occupancyThreshold}% full
                  </p>
                </div>
              )}

              {/* Event-Based Fields */}
              {ruleType === 'event_based' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Event Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder="e.g., Valentine's Day"
                      className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        Start Date <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={eventStartDate}
                        onChange={(e) => setEventStartDate(e.target.value)}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        End Date <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={eventEndDate}
                        onChange={(e) => setEventEndDate(e.target.value)}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Priority */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  Priority
                  <span className="text-xs font-normal text-muted-foreground">(higher number = checked first)</span>
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value))}
                  min="1"
                  max="999"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground"
                />
              </div>
            </div>
          )}

          {/* Step 3: Set Price Change */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-2">Set Price Adjustment</h3>
                <p className="text-sm text-muted-foreground">How much should prices change?</p>
              </div>

              {/* Modifier Type */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setModifierType('percentage')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      modifierType === 'percentage'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-bold text-foreground mb-1">Percentage</div>
                    <div className="text-xs text-muted-foreground">Increase/decrease by %</div>
                  </button>
                  <button
                    onClick={() => setModifierType('fixed')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      modifierType === 'fixed'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-bold text-foreground mb-1">Fixed Amount</div>
                    <div className="text-xs text-muted-foreground">Add/subtract €</div>
                  </button>
                </div>
              </div>

              {/* Modifier Value */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  {modifierType === 'percentage' ? 'Percentage Change' : 'Amount Change'}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={modifierType === 'percentage' ? -50 : -20}
                    max={modifierType === 'percentage' ? 50 : 20}
                    step={modifierType === 'percentage' ? 5 : 1}
                    value={modifierValue}
                    onChange={(e) => setModifierValue(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <div className={`px-4 py-2 rounded-lg font-bold min-w-[100px] text-center text-lg ${
                    modifierValue > 0
                      ? 'bg-red-500/20 text-red-400'
                      : modifierValue < 0
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {modifierValue > 0 ? '+' : ''}{modifierValue}{modifierType === 'percentage' ? '%' : '€'}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {modifierValue > 0 ? 'Increase' : modifierValue < 0 ? 'Decrease' : 'No change to'} base price
                </p>
              </div>

              {/* Preview */}
              <div className="bg-blue-500/10 border-2 border-blue-500/30 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-5 h-5 text-blue-400" />
                  <h4 className="font-bold text-blue-400">Price Preview</h4>
                </div>
                <div className="flex items-center justify-center gap-4 text-2xl font-bold">
                  <span className="text-muted-foreground line-through">€{basePrice.toFixed(2)}</span>
                  <ArrowRight className="w-6 h-6 text-blue-400" />
                  <span className={modifierValue > 0 ? 'text-red-400' : modifierValue < 0 ? 'text-green-400' : 'text-foreground'}>
                    €{finalPrice.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-center text-muted-foreground mt-2">
                  Based on €{basePrice} average base price
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-border bg-muted/30 flex items-center justify-between gap-3 sticky bottom-0">
          <button
            onClick={step === 1 ? handleClose : () => setStep(step - 1)}
            className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg transition-colors flex items-center gap-2"
            disabled={isSubmitting}
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <button
            onClick={step === 3 ? handleSubmit : () => setStep(step + 1)}
            disabled={
              isSubmitting ||
              (step === 1 && !ruleType) ||
              (step === 2 && (
                !ruleName ||
                (ruleType === 'time_based' && selectedDays.length === 0) ||
                (ruleType === 'event_based' && (!eventName || !eventStartDate || !eventEndDate))
              ))
            }
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? 'Saving...' : step === 3 ? 'Create Rule' : 'Next'}
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
