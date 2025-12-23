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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-[#E7E5E4]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#1C1917]">Reservation Notes</h2>
            <p className="text-[#57534E] text-sm">{reservation.customer_name} · {reservation.party_size} guests</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-[#F5F5F4] rounded-lg transition"
          >
            <svg className="w-6 h-6 text-[#57534E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Customer Type & First Visit */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#9F1239]" />
              <h3 className="text-lg font-semibold text-[#1C1917]">Customer Type</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={firstTimeVisitor}
                onChange={(e) => setFirstTimeVisitor(e.target.checked)}
                className="w-4 h-4 rounded border-[#E7E5E4] bg-[#F5F5F4] text-[#9F1239] focus:ring-[#9F1239]"
              />
              <span className="text-sm text-[#57534E]">First Time Visitor</span>
              <Star className="w-4 h-4 text-[#d97706]" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCustomerType('Tourist')}
              className={`p-4 rounded-xl border-2 transition-all ${
                customerType === 'Tourist'
                  ? 'bg-[#9F1239]/10 border-[#9F1239] text-[#9F1239]'
                  : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#9F1239]/50'
              }`}
            >
              <div className="text-center">
                <div className="text-lg font-semibold">🗺️ Tourist</div>
                <div className="text-xs mt-1 text-[#A8A29E]">International visitor</div>
              </div>
            </button>
            <button
              onClick={() => setCustomerType('Local')}
              className={`p-4 rounded-xl border-2 transition-all ${
                customerType === 'Local'
                  ? 'bg-[#16a34a]/10 border-[#16a34a] text-[#16a34a]'
                  : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#16a34a]/50'
              }`}
            >
              <div className="text-center">
                <div className="text-lg font-semibold">🏠 Local</div>
                <div className="text-xs mt-1 text-[#A8A29E]">Segovia resident</div>
              </div>
            </button>
          </div>
        </div>

        {/* Dietary Restrictions */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Utensils className="w-5 h-5 text-[#16a34a]" />
            <h3 className="text-lg font-semibold text-[#1C1917]">Dietary Restrictions</h3>
            <span className="text-xs text-[#A8A29E]">(Important for cochinillo alternatives)</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['Vegetarian', 'Vegan', 'Gluten-Free', 'Lactose-Free', 'Halal', 'Kosher'].map((restriction) => (
              <button
                key={restriction}
                onClick={() => toggleDietaryRestriction(restriction)}
                className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                  dietaryRestrictions.includes(restriction)
                    ? 'bg-[#16a34a]/10 border-[#16a34a] text-[#16a34a]'
                    : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#16a34a]/50'
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
            <Languages className="w-5 h-5 text-[#7c3aed]" />
            <h3 className="text-lg font-semibold text-[#1C1917]">Language Preference</h3>
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
                className={`p-3 rounded-xl border-2 transition-all ${
                  languagePreference === lang.code
                    ? 'bg-[#7c3aed]/10 border-[#7c3aed] text-[#7c3aed]'
                    : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#7c3aed]/50'
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
            <MapPin className="w-5 h-5 text-[#d97706]" />
            <h3 className="text-lg font-semibold text-[#1C1917]">Seating Preference</h3>
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
                className={`p-3 rounded-xl border-2 transition-all ${
                  seatingPreference === seat.value
                    ? 'bg-[#d97706]/10 border-[#d97706] text-[#d97706]'
                    : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#d97706]/50'
                }`}
              >
                <div className="text-2xl mb-1">{seat.icon}</div>
                <div className="text-sm font-medium">{seat.label}</div>
                <div className="text-xs text-[#A8A29E]">{seat.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Special Occasion */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-[#9F1239]" />
            <h3 className="text-lg font-semibold text-[#1C1917]">Special Occasion</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {['Birthday', 'Anniversary', 'Business', 'Tourism'].map((occasion) => (
              <button
                key={occasion}
                onClick={() => setSpecialOccasion(occasion)}
                className={`p-3 rounded-xl border-2 transition-all ${
                  specialOccasion === occasion
                    ? 'bg-[#9F1239]/10 border-[#9F1239] text-[#9F1239]'
                    : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#9F1239]/50'
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
            <Accessibility className="w-5 h-5 text-[#0891b2]" />
            <h3 className="text-lg font-semibold text-[#1C1917]">Accessibility Needs</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['None', 'Wheelchair', 'High Chair'].map((need) => (
              <button
                key={need}
                onClick={() => setAccessibilityNeeds(need)}
                className={`p-3 rounded-xl border-2 transition-all ${
                  accessibilityNeeds === need
                    ? 'bg-[#0891b2]/10 border-[#0891b2] text-[#0891b2]'
                    : 'bg-[#F5F5F4] border-[#E7E5E4] text-[#57534E] hover:border-[#0891b2]/50'
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
            <FileText className="w-5 h-5 text-[#57534E]" />
            <h3 className="text-lg font-semibold text-[#1C1917]">Internal Notes</h3>
            <span className="text-xs text-[#A8A29E]">(Staff only - not shown to customer)</span>
          </div>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="VIP status, previous visits, preferences..."
            className="w-full p-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
            rows={3}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 border border-[#E7E5E4] text-[#57534E] rounded-xl hover:bg-[#F5F5F4] transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition font-semibold"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
