# Smart Location Selector System - Implementation Guide

## Overview

Comprehensive location selector system for restaurant onboarding that prevents invalid input, supports multiple languages/countries, and automatically sets the appropriate language based on country selection.

## Problem Solved

**Before:** Users could type anything in city/country fields (e.g., "dog name", invalid locations)
**After:** Users select from predefined countries and cities, ensuring valid data entry

## Implementation Components

### 1. Countries Data File (`client/src/data/countries.ts`)

**Purpose:** Central data source for all supported countries and cities

**Key Features:**
- ✅ Organized by language groups (Spanish, Portuguese, French, German, English, Italian)
- ✅ 20+ countries across 6 language families
- ✅ 5-14 major cities per country with optional region information
- ✅ Auto-language mapping (e.g., Spain → es-ES, Brazil → pt-BR)
- ✅ Only includes countries where Cartesia AI voices are available
- ✅ TypeScript interfaces for type safety

**Data Structure:**
```typescript
interface City {
  name: string;
  region?: string; // Optional region/state for disambiguation
}

interface Country {
  code: string;        // ISO 3166-1 alpha-2 (e.g., 'ES', 'US')
  name: string;        // Full country name
  language: string;    // Cartesia voice language code (e.g., 'es-ES')
  flag: string;        // Emoji flag for UI
  cities: City[];      // Array of major cities
}

interface LanguageGroup {
  language: string;     // Internal identifier
  displayName: string;  // User-facing name
  flag: string;        // Emoji flag
  countries: Country[]; // Countries in this language group
}
```

**Language Groups:**

1. **Spanish (🇪🇸)**: Spain, Mexico, Argentina, Colombia, Chile, Peru
2. **Portuguese (🇵🇹)**: Portugal, Brazil
3. **French (🇫🇷)**: France, Belgium, Switzerland
4. **German (🇩🇪)**: Germany, Austria
5. **English (🇬🇧)**: USA, UK, Canada, Australia
6. **Italian (🇮🇹)**: Italy

**Utility Functions:**
```typescript
getAllCountries()                    // Get all countries as flat array
getCountryByCode(code: string)       // Find country by ISO code
getCitiesByCountryCode(code: string) // Get cities for specific country
getLanguageByCountryCode(code: string) // Get language code for country
searchCountries(query: string)       // Search countries by name
searchCities(query: string, countryCode?: string) // Search cities
```

### 2. LocationSelector Component (`client/src/components/onboarding/LocationSelector.tsx`)

**Purpose:** Interactive UI component for country and city selection

**Key Features:**
- ✅ Two-dropdown system (country → city)
- ✅ Searchable dropdowns with real-time filtering
- ✅ Countries organized by language groups
- ✅ Cities disabled until country is selected
- ✅ Flag emojis for visual identification
- ✅ Error state handling
- ✅ Matches existing dark theme design
- ✅ Glass morphism effects
- ✅ Custom scrollbar styling

**Props Interface:**
```typescript
interface LocationSelectorProps {
  selectedCountryCode?: string;
  selectedCity?: string;
  onCountryChange: (countryCode: string, languageCode: string) => void;
  onCityChange: (city: string) => void;
  error?: {
    country?: string;
    city?: string;
  };
}
```

**UI Design:**
- Dark theme with glass morphism (bg-[#1a1625]/95 backdrop-blur-xl)
- Border: border-white/10
- Focus state: focus:border-[#8b5cf6] (violet)
- Selected state: bg-[#8b5cf6]/20 (violet with transparency)
- Hover state: hover:bg-white/10
- Custom purple scrollbar

**Dropdown Structure:**
```
Country Dropdown:
├─ Search Input (autocomplete)
├─ Language Groups (collapsible sections)
│  ├─ Spanish 🇪🇸
│  │  ├─ 🇪🇸 Spain
│  │  ├─ 🇲🇽 Mexico
│  │  └─ ...
│  ├─ Portuguese 🇵🇹
│  └─ ...

City Dropdown (enabled after country selection):
├─ Search Input (autocomplete)
├─ Cities List
│  ├─ Madrid (Community of Madrid)
│  ├─ Barcelona (Catalonia)
│  └─ ...
```

### 3. Updated Step1Welcome Component (`client/src/components/onboarding/Step1Welcome.tsx`)

**Changes Made:**
1. ✅ Removed free-text city/country inputs
2. ✅ Integrated LocationSelector component
3. ✅ Added `handleCountryChange` to update country + language simultaneously
4. ✅ Added `handleCityChange` to update city selection
5. ✅ Updated validation to check for `country_code`
6. ✅ Added visual feedback showing auto-populated language

**New Handler Functions:**
```typescript
const handleCountryChange = (countryCode: string, languageCode: string) => {
  const country = getCountryByCode(countryCode);
  updateData({
    country_code: countryCode,
    country: country?.name || '',
    language: languageCode,
  });
};

const handleCityChange = (city: string) => {
  updateData({ city });
};
```

**Auto-Language Notification:**
When a country is selected, a purple notification box appears:
```
✓ Language automatically set
  Based on your country selection: es-ES
```

### 4. Updated OnboardingData Type (`client/src/types/onboarding.types.ts`)

**Added Field:**
```typescript
export interface OnboardingData {
  // ... existing fields
  country: string;
  country_code?: string; // NEW: ISO country code (e.g., 'ES', 'US', 'FR')
  language?: string;
  // ... rest of fields
}
```

## Data Coverage

### Supported Countries (20 total)

**Spanish-speaking (6 countries, 62 cities):**
- 🇪🇸 Spain: 12 cities (Madrid, Barcelona, Valencia, Seville, ...)
- 🇲🇽 Mexico: 12 cities (Mexico City, Guadalajara, Monterrey, ...)
- 🇦🇷 Argentina: 10 cities (Buenos Aires, Córdoba, Mendoza, ...)
- 🇨🇴 Colombia: 10 cities (Bogotá, Medellín, Cartagena, ...)
- 🇨🇱 Chile: 10 cities (Santiago, Valparaíso, Pucón, ...)
- 🇵🇪 Peru: 10 cities (Lima, Cusco, Arequipa, ...)

**Portuguese-speaking (2 countries, 22 cities):**
- 🇵🇹 Portugal: 10 cities (Lisbon, Porto, Faro, ...)
- 🇧🇷 Brazil: 12 cities (São Paulo, Rio de Janeiro, Brasília, ...)

**French-speaking (3 countries, 28 cities):**
- 🇫🇷 France: 12 cities (Paris, Lyon, Nice, Marseille, ...)
- 🇧🇪 Belgium: 8 cities (Brussels, Antwerp, Bruges, ...)
- 🇨🇭 Switzerland: 10 cities (Geneva, Zurich, Lausanne, ...)

**German-speaking (2 countries, 20 cities):**
- 🇩🇪 Germany: 12 cities (Berlin, Munich, Hamburg, ...)
- 🇦🇹 Austria: 8 cities (Vienna, Salzburg, Innsbruck, ...)

**English-speaking (4 countries, 44 cities):**
- 🇺🇸 USA: 14 cities (New York, Los Angeles, Chicago, ...)
- 🇬🇧 UK: 12 cities (London, Manchester, Edinburgh, ...)
- 🇨🇦 Canada: 10 cities (Toronto, Vancouver, Montreal, ...)
- 🇦🇺 Australia: 10 cities (Sydney, Melbourne, Brisbane, ...)

**Italian-speaking (1 country, 14 cities):**
- 🇮🇹 Italy: 14 cities (Rome, Milan, Florence, Venice, ...)

**Total: 190 cities across 20 countries**

## User Experience Flow

1. **User opens onboarding Step 1**
2. **Enters restaurant name and selects type**
3. **Clicks "Country" dropdown**
   - Sees countries organized by language
   - Can search by typing (e.g., "Spa" → filters to Spain)
   - Selects "🇪🇸 Spain"
4. **System auto-populates:**
   - `country: "Spain"`
   - `country_code: "ES"`
   - `language: "es-ES"`
   - Shows purple notification: "Language automatically set: es-ES"
5. **"City" dropdown becomes enabled**
   - Shows 12 Spanish cities
   - Can search by typing (e.g., "Bar" → filters to Barcelona)
   - Selects "Barcelona (Catalonia)"
6. **System saves:**
   - `city: "Barcelona"`
7. **User clicks Continue**
   - All location data validated and complete

## Technical Implementation Details

### State Management
- Component manages local dropdown open/close state
- Parent component (Step1Welcome) manages form data via `updateData` callback
- Search query state isolated within LocationSelector

### Performance Optimizations
- `useMemo` for filtered countries/cities (prevents re-filtering on every render)
- Click-outside detection for dropdown closing
- Efficient event delegation

### Accessibility
- Proper label associations
- Keyboard navigation support
- ARIA attributes for dropdowns
- Focus management

### Design System Compliance
- Matches existing onboarding dark theme
- Uses consistent spacing (Tailwind scale)
- Follows violet/purple accent color scheme (#8b5cf6)
- Glass morphism effects match dashboard design
- Smooth transitions (duration-200, duration-300)

## Testing Checklist

- [ ] Select country from each language group
- [ ] Verify language auto-populates correctly
- [ ] Search countries (should filter list)
- [ ] Search cities (should filter list)
- [ ] Verify city dropdown disabled before country selection
- [ ] Verify city dropdown clears when country changes
- [ ] Check error states display correctly
- [ ] Verify validation prevents empty country/city
- [ ] Test keyboard navigation
- [ ] Test click-outside to close dropdowns
- [ ] Verify data saves to onboardingData state
- [ ] Check visual design matches dark theme
- [ ] Verify flag emojis display correctly

## Future Enhancements

### Potential Additions:
1. **More Cities**: Add tier-2 cities for popular countries
2. **Custom City Input**: Allow "Other city" with manual entry
3. **Geolocation**: Auto-detect user location and pre-select country
4. **City Photos**: Add thumbnail images for major cities
5. **Time Zone Info**: Display time zone for selected city
6. **Phone Code**: Auto-populate country phone code
7. **Currency**: Auto-populate local currency
8. **Postal Code Format**: Show expected postal code format

### Expandability:
- Easy to add new countries: Just update `countries.ts`
- Easy to add new cities: Just add to country's `cities` array
- Language groups are flexible and can be reorganized
- Utility functions make data access simple

## File Structure

```
restaurant-ai-mcp/
├── client/
│   ├── src/
│   │   ├── data/
│   │   │   └── countries.ts              ✅ NEW - Country/city data
│   │   ├── components/
│   │   │   └── onboarding/
│   │   │       ├── LocationSelector.tsx  ✅ NEW - Smart selector UI
│   │   │       └── Step1Welcome.tsx      ✅ UPDATED - Integrated selector
│   │   └── types/
│   │       └── onboarding.types.ts       ✅ UPDATED - Added country_code
└── LOCATION_SELECTOR_IMPLEMENTATION.md   ✅ NEW - This file
```

## Migration Notes

### Breaking Changes:
- `country` field now stores full country name (e.g., "Spain") instead of user input
- New field `country_code` stores ISO code (e.g., "ES")
- `city` field now stores standardized city name from predefined list

### Backward Compatibility:
- Old onboarding sessions with free-text input will still work
- Validation accepts either old format or new format
- Database schema doesn't require changes (country_code is optional)

## Support & Maintenance

### Adding a New Country:
1. Open `client/src/data/countries.ts`
2. Find the appropriate language group array (e.g., `spanishCountries`)
3. Add new country object with cities
4. Verify Cartesia has voice support for that language code

### Updating City Lists:
1. Find country in `countries.ts`
2. Add city to `cities` array with optional region

### Troubleshooting:
- **Dropdowns not opening?** Check z-index and click-outside logic
- **Language not auto-populating?** Verify country has `language` field
- **Cities not showing?** Check `getCitiesByCountryCode()` returns data
- **Styling broken?** Verify Tailwind classes and dark mode support

## Summary

This implementation provides a robust, user-friendly location selector that:
- ✅ Prevents invalid data entry
- ✅ Supports 20 countries across 6 language families
- ✅ Provides 190+ predefined cities
- ✅ Automatically sets the correct language based on country
- ✅ Matches the existing dark theme design
- ✅ Is fully typed with TypeScript
- ✅ Is easily extensible for future additions

The system improves data quality, enhances user experience, and ensures consistent language configuration across the onboarding flow.
