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
import {
  Utensils,
  Languages,
  MapPin,
  Calendar,
  Users,
  Accessibility,
  FileText,
  Star,
  Check
} from 'lucide-react';

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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-[#1E1E1E] rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Reservation Notes</h2>
            <p className="text-gray-400 text-sm">{reservation.customer_name} · {reservation.party_size} guests</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Customer Type & First Visit */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Customer Type</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={firstTimeVisitor}
                onChange={(e) => setFirstTimeVisitor(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              <span className="text-sm text-gray-300">First Time Visitor</span>
              <Star className="w-4 h-4 text-yellow-400" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCustomerType('Tourist')}
              className={`p-4 rounded-lg border-2 transition-all ${
                customerType === 'Tourist'
                  ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="text-center">
                <div className="text-lg font-semibold">🗺️ Tourist</div>
                <div className="text-xs mt-1">International visitor</div>
              </div>
            </button>
            <button
              onClick={() => setCustomerType('Local')}
              className={`p-4 rounded-lg border-2 transition-all ${
                customerType === 'Local'
                  ? 'bg-green-500/20 border-green-500 text-green-400'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="text-center">
                <div className="text-lg font-semibold">🏠 Local</div>
                <div className="text-xs mt-1">Segovia resident</div>
              </div>
            </button>
          </div>
        </div>

        {/* Dietary Restrictions */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Utensils className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Dietary Restrictions</h3>
            <span className="text-xs text-gray-500">(Important for cochinillo alternatives)</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['Vegetarian', 'Vegan', 'Gluten-Free', 'Lactose-Free', 'Halal', 'Kosher'].map((restriction) => (
              <button
                key={restriction}
                onClick={() => toggleDietaryRestriction(restriction)}
                className={`p-3 rounded-lg border-2 transition-all flex items-center justify-between ${
                  dietaryRestrictions.includes(restriction)
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="font-medium">{restriction}</span>
                {dietaryRestrictions.includes(restriction) && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        {/* Language Preference */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Languages className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Language Preference</h3>
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
                className={`p-3 rounded-lg border-2 transition-all ${
                  languagePreference === lang.code
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
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
            <MapPin className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white">Seating Preference</h3>
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
                className={`p-3 rounded-lg border-2 transition-all ${
                  seatingPreference === seat.value
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="text-2xl mb-1">{seat.icon}</div>
                <div className="text-sm font-medium">{seat.label}</div>
                <div className="text-xs text-gray-500">{seat.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Special Occasion */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-pink-400" />
            <h3 className="text-lg font-semibold text-white">Special Occasion</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {['Birthday', 'Anniversary', 'Business', 'Tourism'].map((occasion) => (
              <button
                key={occasion}
                onClick={() => setSpecialOccasion(occasion)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  specialOccasion === occasion
                    ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
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
            <Accessibility className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">Accessibility Needs</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['None', 'Wheelchair', 'High Chair'].map((need) => (
              <button
                key={need}
                onClick={() => setAccessibilityNeeds(need)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  accessibilityNeeds === need
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
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
            <FileText className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-white">Internal Notes</h3>
            <span className="text-xs text-gray-500">(Staff only - not shown to customer)</span>
          </div>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="VIP status, previous visits, preferences..."
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
