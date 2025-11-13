# Restaurant Profile System - Integration Guide

## Overview

This guide explains how to integrate the newly created Restaurant Profile system into the onboarding flow. The profile system customizes the dashboard based on restaurant characteristics.

## Files Created

### 1. Database Migration
**File**: `database/supabase/migrations/20251106_add_metric_profile.sql`

Adds `metric_profile` JSONB column to `restaurant_info` table with:
- Default simple profile for existing restaurants
- GIN indexes for fast JSONB queries
- Validation constraints for template and restaurant_type

**To Apply**: Run this migration in Supabase SQL editor or via Supabase CLI.

### 2. TypeScript Types
**File**: `client/src/types/profile.types.ts`

Contains:
- `RestaurantProfile` interface
- `ProfileQuestionnaireData` interface
- Template configurations with recommended metrics
- Label constants for all enums
- Helper types for customizations

### 3. Profile Questionnaire Component
**File**: `client/src/components/onboarding/RestaurantProfileQuestionnaire.tsx`

4-step questionnaire:
1. Restaurant Type (traditional, modern, fast-casual, fine-dining)
2. Size & Location (seat count, location type)
3. Primary Concerns (select 3-5)
4. Dashboard Complexity (simple, balanced, advanced)

### 4. Profile Context
**File**: `client/src/contexts/ProfileContext.tsx`

Provides:
- `useProfile()` hook for accessing profile data
- `useCustomization()` hook for specific settings
- `useMetricVisibility()` hook for checking metric visibility
- Auto-fetches profile from API
- Handles updates and caching

### 5. API Endpoints
**File**: `api/restaurant-settings.js` (updated)

New endpoints:
- `GET /api/restaurant-settings/profile` - Get profile
- `PUT /api/restaurant-settings/profile` - Update profile
- `POST /api/restaurant-settings/profile/recommend` - Get recommendation

### 6. Onboarding Integration Component
**File**: `client/src/components/onboarding/Step1_5Profile.tsx`

Bridge component between onboarding flow and profile questionnaire.

### 7. Updated Types
**File**: `client/src/types/onboarding.types.ts` (updated)

Added `profile_data?: ProfileQuestionnaireData` to `OnboardingData` interface.

## Integration Steps

### Step 1: Update Onboarding.tsx

You need to modify `client/src/pages/Onboarding.tsx`:

#### A. Add Import
```typescript
import Step1_5Profile from '../components/onboarding/Step1_5Profile';
```

#### B. Update Total Steps
Change line 92:
```typescript
// Before
if (currentStep < 5) {

// After
if (currentStep < 6) {  // Now 6 steps total
```

Change line 138:
```typescript
// Before
const progressPercentage = (currentStep / 5) * 100;

// After
const progressPercentage = (currentStep / 6) * 100;
```

Change progress bar text (line 170):
```typescript
// Before
Step {currentStep} of 5

// After
Step {currentStep} of 6
```

#### C. Add Profile Step Rendering

Insert this block after Step1Welcome (around line 200):
```typescript
{currentStep === 2 && (
  <Step1_5Profile
    key="step1_5"
    data={onboardingData}
    updateData={updateData}
    onNext={nextStep}
    onBack={prevStep}
  />
)}
```

#### D. Update Other Step Numbers

Shift all subsequent steps:
- Step2Contact: `currentStep === 2` → `currentStep === 3`
- Step3Tables: `currentStep === 3` → `currentStep === 4`
- Step4Settings: `currentStep === 4` → `currentStep === 5`
- Step5Team: `currentStep === 5` → `currentStep === 6`

### Step 2: Update Onboarding API

Modify `api/onboarding/complete.js` (or similar) to handle profile data:

```javascript
// After saving restaurant_info, if profile_data exists:
if (onboardingData.profile_data && onboardingData.restaurant_id) {
  const { restaurant_type, size, location_type, primary_concerns, template } = onboardingData.profile_data;

  // Fetch recommendation
  const response = await fetch('/api/restaurant-settings/profile/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_type,
      size,
      location_type,
      primary_concerns
    })
  });

  const { data } = await response.json();
  const recommendedProfile = data.recommended_profile;

  // Override template if user selected one
  if (template) {
    recommendedProfile.template = template;
  }

  // Save profile
  await fetch('/api/restaurant-settings/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Restaurant-ID': onboardingData.restaurant_id
    },
    body: JSON.stringify({ metric_profile: recommendedProfile })
  });
}
```

## Testing the Integration

### 1. Test Migration
```sql
-- In Supabase SQL Editor
SELECT metric_profile FROM restaurant_info LIMIT 1;

-- Should return JSONB object with template, restaurant_type, etc.
```

### 2. Test API Endpoints

**Get Profile:**
```bash
curl -H "X-Restaurant-ID: your-restaurant-id" \
  http://localhost:3001/api/restaurant-settings/profile
```

**Update Profile:**
```bash
curl -X PUT \
  -H "X-Restaurant-ID: your-restaurant-id" \
  -H "Content-Type: application/json" \
  -d '{"metric_profile": {...}}' \
  http://localhost:3001/api/restaurant-settings/profile
```

**Get Recommendation:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_type": "traditional",
    "size": "small",
    "location_type": "residential",
    "primary_concerns": ["no_shows", "regular_customers", "peak_hours"]
  }' \
  http://localhost:3001/api/restaurant-settings/profile/recommend
```

### 3. Test Onboarding Flow

1. Start onboarding at `/onboarding`
2. Complete Step 1 (Welcome)
3. You should see Step 1.5 (Profile Questionnaire)
4. Fill out all 4 sub-steps
5. Continue to remaining steps
6. Verify profile saved in database

### 4. Test Profile Context

In any dashboard component:
```typescript
import { useProfile, useMetricVisibility } from '../contexts/ProfileContext';

function MyComponent() {
  const { profile, isLoading } = useProfile();
  const showMLMetrics = useMetricVisibility('ml_confidence');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Dashboard: {profile?.template} mode</h1>
      {showMLMetrics && <MLConfidenceWidget />}
    </div>
  );
}
```

## Configuration Options

### Template Profiles

**Simple** (Traditional restaurants):
- 5 visible metrics (tables, reservations, actions, occupancy, arrivals)
- Large font, simple risk display
- No technical details

**Balanced** (Modern restaurants):
- 10 visible metrics including revenue, party size, no-show rate
- Medium font, detailed risk display
- Some insights

**Advanced** (Tech-savvy, fast-casual):
- 17+ visible metrics including ML confidence, prediction accuracy
- Small font, technical risk display
- Full analytics

### Customization Options

```typescript
interface ProfileCustomizations {
  risk_display: 'simple' | 'detailed' | 'technical';
  time_format: '12h' | '24h';
  currency: string;  // ISO code
  show_technical_details: boolean;
  font_size: 'small' | 'medium' | 'large';
  language: 'en' | 'es' | 'pt' | 'fr' | 'it';
  color_scheme: 'default' | 'high-contrast' | 'colorblind';
  notification_level: 'all' | 'essential' | 'critical';
}
```

## Next Steps (Future Enhancements)

1. **Dashboard Implementation**: Update `HostDashboard.tsx` to use profile context and hide/show metrics accordingly

2. **Settings Page**: Create a settings page where users can modify their profile after onboarding

3. **A/B Testing**: Track which templates lead to better engagement

4. **Smart Recommendations**: Use ML to suggest template changes based on usage patterns

5. **Localization**: Translate questionnaire labels to all supported languages

6. **Profile Migration**: For existing restaurants, show a modal prompting them to complete profile setup

## File Summary

### Created Files (7):
1. `database/supabase/migrations/20251106_add_metric_profile.sql`
2. `client/src/types/profile.types.ts`
3. `client/src/components/onboarding/RestaurantProfileQuestionnaire.tsx`
4. `client/src/contexts/ProfileContext.tsx`
5. `client/src/components/onboarding/Step1_5Profile.tsx`
6. `PROFILE_SYSTEM_INTEGRATION_GUIDE.md` (this file)

### Modified Files (2):
1. `api/restaurant-settings.js` (added profile endpoints)
2. `client/src/types/onboarding.types.ts` (added profile_data field)

### Files to Modify (2):
1. `client/src/pages/Onboarding.tsx` (integrate profile step)
2. `api/onboarding/complete.js` (save profile on completion)

## Backup Files

A backup of the original `restaurant-settings.js` was created at:
- `api/restaurant-settings.backup.js`

## Questions or Issues?

If you encounter any issues during integration, check:
1. All imports are correct
2. TypeScript types are properly imported
3. API endpoints return expected data structures
4. Migration was applied successfully in Supabase
5. Restaurant ID is being passed correctly to API calls

For Phase 2 (making dashboard actually use these profiles), you'll need to:
- Wrap the HostDashboard in ProfileProvider
- Use `useMetricVisibility()` to conditionally render metrics
- Use `useCustomization()` to apply font sizes, colors, etc.
- Create toggle components for showing/hiding metric sections
