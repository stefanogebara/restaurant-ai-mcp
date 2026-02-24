/**
 * Reservation Notes Editor for Segovia Restaurants
 *
 * Tourism-focused quick-select UI for capturing:
 * - Dietary restrictions (vegetarian alternatives to cochinillo)
 * - Language preferences (Spanish, English, Chinese, French)
 * - Seating preferences (Terrace views, window seats)
 * - Special occasions
 * - Customer type (Tourist vs Local)
 */

import { useState } from 'react';
import type { UpcomingReservation } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';

interface ReservationNotesEditorProps {
  reservation: UpcomingReservation;
  onSave: (updates: Partial<UpcomingReservation>) => void;
  onCancel: () => void;
}

export default function ReservationNotesEditor({
  reservation,
  onSave,
  onCancel
}: ReservationNotesEditorProps) {
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(
    reservation.dietary_restrictions || []
  );
  const [languagePreference, setLanguagePreference] = useState<string>(
    reservation.language_preference || ''
  );
  const [seatingPreference, setSeatingPreference] = useState<string>(
    reservation.seating_preference || ''
  );
  const [specialOccasion, setSpecialOccasion] = useState<string>(
    reservation.special_occasion || ''
  );
  const [customerType, setCustomerType] = useState<string>(
    reservation.customer_type || ''
  );
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string>(
    reservation.accessibility_needs || ''
  );
  const [internalNotes, setInternalNotes] = useState<string>(
    reservation.internal_notes || ''
  );
  const [firstTimeVisitor, setFirstTimeVisitor] = useState<boolean>(
    reservation.first_time_visitor !== false
  );

  const toggleDietaryRestriction = (restriction: string) => {
    if (dietaryRestrictions.includes(restriction)) {
      setDietaryRestrictions(dietaryRestrictions.filter(r => r !== restriction));
    } else {
      setDietaryRestrictions([...dietaryRestrictions, restriction]);
    }
  };

  const handleSave = () => {
    onSave({
      dietary_restrictions: dietaryRestrictions,
      language_preference: languagePreference,
      seating_preference: seatingPreference,
      special_occasion: specialOccasion,
      customer_type: customerType,
      accessibility_needs: accessibilityNeeds,
      internal_notes: internalNotes,
      first_time_visitor: firstTimeVisitor,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-border-gray">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-deep-charcoal">Reservation Notes</h2>
            <p className="text-stone-gray text-sm">{reservation.customer_name} · {reservation.party_size} guests</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-soft-gray rounded-xl transition"
          >
            <ThiingsIcon name="close" pxSize={24} />
          </button>
        </div>

        {/* Customer Type & First Visit */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ThiingsIcon name="users" pxSize={20} />
              <h3 className="text-lg font-semibold text-deep-charcoal">Customer Type</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={firstTimeVisitor}
                onChange={(e) => setFirstTimeVisitor(e.target.checked)}
                className="w-4 h-4 rounded border-border-gray bg-soft-gray text-burgundy focus:ring-burgundy"
              />
              <span className="text-sm text-stone-gray">First Time Visitor</span>
              <ThiingsIcon name="star" pxSize={16} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCustomerType('Tourist')}
              className={`p-4 rounded-2xl border-2 transition-all ${
                customerType === 'Tourist'
                  ? 'bg-burgundy/10 border-burgundy text-burgundy'
                  : 'bg-soft-gray border-border-gray text-stone-gray hover:border-burgundy/50'
              }`}
            >
              <div className="text-center">
                <ThiingsIcon name="map" pxSize={22} className="mx-auto mb-1" />
                <div className="text-sm font-semibold">Tourist</div>
                <div className="text-xs mt-0.5 text-muted-stone">International visitor</div>
              </div>
            </button>
            <button
              onClick={() => setCustomerType('Local')}
              className={`p-4 rounded-2xl border-2 transition-all ${
                customerType === 'Local'
                  ? 'bg-green-600/10 border-green-600 text-green-600'
                  : 'bg-soft-gray border-border-gray text-stone-gray hover:border-green-600/50'
              }`}
            >
              <div className="text-center">
                <ThiingsIcon name="home" pxSize={22} className="mx-auto mb-1" />
                <div className="text-sm font-semibold">Local</div>
                <div className="text-xs mt-0.5 text-muted-stone">Segovia resident</div>
              </div>
            </button>
          </div>
        </div>

        {/* Dietary Restrictions */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ThiingsIcon name="utensils" pxSize={20} />
            <h3 className="text-lg font-semibold text-deep-charcoal">Dietary Restrictions</h3>
            <span className="text-xs text-muted-stone">(Important for cochinillo alternatives)</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['Vegetarian', 'Vegan', 'Gluten-Free', 'Lactose-Free', 'Halal', 'Kosher'].map((restriction) => (
              <button
                key={restriction}
                onClick={() => toggleDietaryRestriction(restriction)}
                className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
                  dietaryRestrictions.includes(restriction)
                    ? 'bg-green-600/10 border-green-600 text-green-600'
                    : 'bg-soft-gray border-border-gray text-stone-gray hover:border-green-600/50'
                }`}
              >
                <span className="font-medium">{restriction}</span>
                {dietaryRestrictions.includes(restriction) && <ThiingsIcon name="check" pxSize={16} />}
              </button>
            ))}
          </div>
        </div>

        {/* Language Preference */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ThiingsIcon name="languages" pxSize={20} />
            <h3 className="text-lg font-semibold text-deep-charcoal">Language Preference</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { code: 'Spanish', flag: '🇪🇸', name: 'Español' },
              { code: 'English', flag: '🇬🇧', name: 'English' },
              { code: 'Chinese', flag: '🇨🇳', name: '中文' },
              { code: 'French', flag: '🇫🇷', name: 'Français' }
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguagePreference(lang.code)}
                className={`p-3 rounded-2xl border-2 transition-all ${
                  languagePreference === lang.code
                    ? 'bg-violet-600/10 border-violet-600 text-violet-600'
                    : 'bg-soft-gray border-border-gray text-stone-gray hover:border-violet-600/50'
                }`}
              >
                <div className="text-2xl mb-1">{lang.flag}</div>
                <div className="text-sm font-medium">{lang.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Seating Preference */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ThiingsIcon name="map-pin" pxSize={20} />
            <h3 className="text-lg font-semibold text-deep-charcoal">Seating Preference</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { value: 'Terrace', icon: '🌳', label: 'Terrace', desc: 'Outdoor views' },
              { value: 'Window', icon: '🪟', label: 'Window', desc: 'Street views' },
              { value: 'Indoor', icon: '🏛️', label: 'Indoor', desc: 'Main dining' },
              { value: 'Bar', icon: '🍷', label: 'Bar', desc: 'Counter seats' }
            ].map((seat) => (
              <button
                key={seat.value}
                onClick={() => setSeatingPreference(seat.value)}
                className={`p-3 rounded-2xl border-2 transition-all ${
                  seatingPreference === seat.value
                    ? 'bg-amber-600/10 border-amber-600 text-amber-600'
                    : 'bg-soft-gray border-border-gray text-stone-gray hover:border-amber-600/50'
                }`}
              >
                <div className="text-2xl mb-1">{seat.icon}</div>
                <div className="text-sm font-medium">{seat.label}</div>
                <div className="text-xs text-muted-stone">{seat.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Special Occasion */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ThiingsIcon name="calendar" pxSize={20} />
            <h3 className="text-lg font-semibold text-deep-charcoal">Special Occasion</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {['Birthday', 'Anniversary', 'Business', 'Tourism'].map((occasion) => (
              <button
                key={occasion}
                onClick={() => setSpecialOccasion(occasion)}
                className={`p-3 rounded-2xl border-2 transition-all ${
                  specialOccasion === occasion
                    ? 'bg-burgundy/10 border-burgundy text-burgundy'
                    : 'bg-soft-gray border-border-gray text-stone-gray hover:border-burgundy/50'
                }`}
              >
                <div className="font-medium">{occasion}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Accessibility Needs */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ThiingsIcon name="accessibility" pxSize={20} />
            <h3 className="text-lg font-semibold text-deep-charcoal">Accessibility Needs</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['None', 'Wheelchair', 'High Chair'].map((need) => (
              <button
                key={need}
                onClick={() => setAccessibilityNeeds(need)}
                className={`p-3 rounded-2xl border-2 transition-all ${
                  accessibilityNeeds === need
                    ? 'bg-cyan-600/10 border-cyan-600 text-cyan-600'
                    : 'bg-soft-gray border-border-gray text-stone-gray hover:border-cyan-600/50'
                }`}
              >
                <div className="font-medium">{need}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Internal Notes */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ThiingsIcon name="file-text" pxSize={20} />
            <h3 className="text-lg font-semibold text-deep-charcoal">Internal Notes</h3>
            <span className="text-xs text-muted-stone">(Staff only - not shown to customer)</span>
          </div>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="VIP status, previous visits, preferences..."
            className="w-full p-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
            rows={3}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-burgundy text-white rounded-xl hover:bg-burgundy-dark transition-colors font-semibold"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
