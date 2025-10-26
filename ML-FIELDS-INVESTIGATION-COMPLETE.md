# ML Fields Investigation - Complete Analysis

**Date**: 2025-10-26
**Status**: 🔍 INVESTIGATION COMPLETE - FINAL FIX NEEDED
**Session**: Deep dive into production ML visualization failure

---

## 🎯 Original Problem

Risk badges not appearing in production host dashboard despite:
- ✅ RiskBadge component created and integrated
- ✅ TypeScript types updated
- ✅ Backend API mapping added
- ✅ Batch prediction endpoint created
- ✅ All code deployed successfully

---

## 🔬 Investigation Timeline

### Discovery 1: Field Name Mismatch (RESOLVED)
**Initial Hypothesis**: ML fields don't exist in Airtable
**Testing**: Used Playwright to inspect Airtable schema
**Finding**: Fields DO exist but with different names
- Code expected: "No Show Risk Score", "No Show Risk Level", "Prediction Confidence"
- Airtable has: "ML Risk Score", "ML Risk Level", "ML Confidence"

**Fix**: Updated field names in 3 files:
- api/_lib/airtable.js
- api/batch-predict.js
- api/reservations.js

**Result**: ✅ Field names now match
**Commit**: `01b3a4c`

---

### Discovery 2: Property Name Mismatch (RESOLVED)
**Testing**: Ran batch prediction after field name fix
**Finding**: Still only 2 of 4 fields populating (ML Confidence, ML Model Version)

**Root Cause**: predict.js returns different property names than expected:
- Returns: `noShowProbability`, `noShowRisk`, `metadata.modelVersion`
- Code expected: `probability`, `riskLevel`, `modelInfo.version`

**Fix**: Updated batch-predict.js and reservations.js to use correct properties:
```javascript
// Before
'ML Risk Score': Math.round(prediction.probability * 100),
'ML Risk Level': prediction.riskLevel,

// After
'ML Risk Score': Math.round(prediction.noShowProbability * 100),
'ML Risk Level': prediction.noShowRisk,
```

**Result**: ✅ Property names now correct
**Commit**: `a81be4f`

---

### Discovery 3: Invalid Single Select Value (PARTIALLY RESOLVED)
**Testing**: Batch prediction still failing to write ML Risk Score and ML Risk Level
**Analysis**: Examined predict.js fallback responses

**Root Cause**: Airtable "ML Risk Level" field is Single Select with valid options:
- low, medium, high, very-high

Fallback responses returned `noShowRisk: 'unknown'` which Airtable **silently rejected**.

**Fix**: Updated fallback responses in predict.js:
```javascript
// Before
return {
  error: 'Model not available',
  noShowProbability: 0.5,
  noShowRisk: 'unknown'  // ❌ Invalid!
};

// After
return {
  error: 'Model not available',
  noShowProbability: 0.5,
  noShowRisk: 'medium',  // ✅ Valid option
  confidence: 0.0,
  metadata: {
    modelVersion: '1.0.0',
    modelTrainedAt: 'unknown',
    predictedAt: new Date().toISOString()
  }
};
```

**Result**: ⚠️ Code correct but production still failing
**Commit**: `bc7dc76`

---

### Discovery 4: ML Model Not Loading in Production (CURRENT ISSUE)
**Testing**: Created new reservation in production

**Finding**: ALL 4 ML fields are MISSING (including previously working fields!)

**Hypothesis**: ML model file (`ml-models/no_show_model.json`) either:
1. Not being deployed to Vercel
2. Not accessible at runtime in serverless function
3. File path incorrect for Vercel's file system

**Evidence**:
- ✅ Model file committed to git: `git ls-files | grep ml-model`
- ✅ Model works perfectly locally: test-predict-output.js returned all fields
- ❌ Production returns fallback response (implies model not loading)
- ❌ New reservation has NO ML fields at all

**Root Cause Theories**:
1. **Serverless File System**: Vercel serverless functions may not have access to files in ml-models/ directory
2. **Build Step**: Model files may not be included in deployment artifact
3. **Path Resolution**: `__dirname` may resolve differently in serverless environment

---

## 📊 Test Results Summary

| Test | Local | Production | Status |
|------|-------|------------|--------|
| predict.js returns correct structure | ✅ | ❓ | Can't verify production |
| Model loads successfully | ✅ | ❌ | Fails in serverless |
| Direct Airtable update (all 4 fields) | ✅ | N/A | Proven writable |
| Batch prediction populates all 4 fields | ✅ | ❌ | Fails in production |
| New reservation gets ML predictions | ✅ | ❌ | Completely failing |
| Risk badges display in UI | N/A | ❌ | No data to display |

---

## 🏗️ Production Architecture Issue

**Current Flow (BROKEN)**:
```
New Reservation Created
  ↓
api/reservations.js calls predictNoShow()
  ↓
api/ml/predict.js tries to loadModel()
  ↓
fs.existsSync(MODEL_PATH) → false (in serverless!)
  ↓
Returns fallback response with error
  ↓
Fallback response used to update Airtable
  ↓
??? Something failing here - NO fields written
```

**Why Fallback Might Fail**:
1. Fallback response structure changed between deploys
2. Airtable update call timing out
3. Error thrown after predict but before Airtable update
4. Try/catch swallowing the error silently

---

## 🔧 Recommended Solutions

### Option 1: Inline Model Data (RECOMMENDED)
**Pros**: Works in serverless, no file system dependency
**Cons**: Increases code bundle size slightly

**Implementation**:
```javascript
// api/ml/model-data.js
module.exports = {
  version: '1.0.0',
  trainedAt: '2025-10-25T12:33:01.163Z',
  type: 'RandomForest',
  featureNames: [...],
  model: {
    featureImportance: [...]
  }
};

// api/ml/predict.js
const MODEL_DATA = require('./model-data');
```

### Option 2: Use Environment Variables
**Pros**: Clean separation of code and data
**Cons**: Model JSON too large for env vars (4KB limit)

### Option 3: Use Vercel Blob Storage
**Pros**: Designed for this use case
**Cons**: Requires additional setup, cost considerations

### Option 4: Hardcode Fallback Until Production Model Ready
**Pros**: Unblocks UI development
**Cons**: Not real predictions

---

## 📝 Current Code State

### Files Modified This Session:
1. `api/_lib/airtable.js` - Field name corrections ✅
2. `api/batch-predict.js` - Property name corrections ✅
3. `api/reservations.js` - Property name corrections ✅
4. `api/ml/predict.js` - Fallback response fixes ✅

### Files Created This Session:
1. `check-ml-fields.js` - Airtable verification script
2. `test-ml-update.js` - Direct Airtable API test
3. `test-predict-output.js` - Local prediction test
4. `check-debug-reservation.js` - New reservation check

### Test Files Status:
- ✅ All local tests pass
- ❌ All production tests fail

---

## 🎯 Next Steps (PRIORITY ORDER)

### CRITICAL - Immediate Action Required:
1. **Investigate why latest deploy broke everything**
   - Check Vercel deployment logs
   - Verify bc7dc76 deployed successfully
   - Check if fallback response is even being returned

2. **Implement inline model data solution**
   - Extract model JSON to module.exports
   - Update loadModel() to use require() instead of fs.readFileSync()
   - Test locally
   - Deploy and verify

3. **Add comprehensive logging**
   - Log what predict() returns
   - Log what gets sent to Airtable
   - Log Airtable response
   - Check Vercel function logs

### HIGH - Verification:
4. **Run complete test suite after fix**
   - Create new reservation
   - Check all 4 ML fields populate
   - Run batch prediction
   - Verify UI displays risk badges
   - Test all 4 risk levels

5. **Document production verification**
   - Screenshot of working risk badges
   - API response examples
   - Airtable data examples

---

## 💡 Key Learnings

1. **Airtable Silent Failures**: Invalid Single Select values fail silently
2. **Property Name Mismatches**: predict.js and calling code must agree on property names
3. **Serverless Constraints**: File system access unreliable in serverless functions
4. **Field Name Conventions**: Airtable field names must match exactly (case-sensitive)
5. **Testing Strategy**: Always test direct Airtable API before assuming code is broken

---

## 🤖 Code Quality Notes

**What Worked Well**:
- Clean component architecture (RiskBadge.tsx)
- Comprehensive type definitions
- Non-blocking ML integration (failures don't block reservations)
- Batch prediction endpoint design

**What Needs Improvement**:
- Model loading strategy for serverless
- Error logging and visibility
- Fallback response consistency
- Production testing before deployment

---

**Status**: Ready for final fix implementation
**Blocking**: ML model not loading in Vercel serverless environment
**Solution**: Inline model data or use Vercel-compatible storage

🤖 Generated with [Claude Code](https://claude.com/claude-code)
