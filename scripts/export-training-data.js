/**
 * Export Historical Training Data
 *
 * Fetches historical reservations from Airtable for ML model training
 * Includes customer history, feature extraction, and data quality validation
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { extractAllFeatures } = require('../api/ml/features');
const { validateFeatureVector } = require('../api/ml/validate-features');

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID || 'tbloL2huXFYQluomn';
const CUSTOMER_HISTORY_TABLE_ID = process.env.CUSTOMER_HISTORY_TABLE_ID || 'tblqK1ajV5sqICWn2';

// Output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'ml-training');

// ============================================================================
// AIRTABLE API FUNCTIONS
// ============================================================================

async function airtableRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    if (data && method !== 'GET') {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Airtable request error:`, error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Fetch all reservations with pagination
 */
async function fetchAllReservations() {
  console.log('📊 Fetching all reservations from Airtable...');

  let allRecords = [];
  let offset = null;
  let pageCount = 0;

  do {
    const endpoint = offset
      ? `${RESERVATIONS_TABLE_ID}?offset=${offset}`
      : RESERVATIONS_TABLE_ID;

    const response = await airtableRequest('GET', endpoint);

    if (!response.success) {
      console.error('❌ Failed to fetch reservations:', response.error);
      break;
    }

    allRecords = allRecords.concat(response.data.records);
    offset = response.data.offset;
    pageCount++;

    console.log(`   Page ${pageCount}: ${response.data.records.length} records (total: ${allRecords.length})`);

  } while (offset);

  console.log(`✅ Fetched ${allRecords.length} total reservations\n`);
  return allRecords;
}

/**
 * Fetch customer history by email or phone
 */
async function fetchCustomerHistory(email, phone) {
  if (!email && !phone) return null;

  try {
    // Try email first
    if (email) {
      const filterFormula = `{Email} = '${email}'`;
      const endpoint = `${CUSTOMER_HISTORY_TABLE_ID}?filterByFormula=${encodeURIComponent(filterFormula)}`;
      const response = await airtableRequest('GET', endpoint);

      if (response.success && response.data.records.length > 0) {
        return response.data.records[0];
      }
    }

    // Try phone if email didn't work
    if (phone) {
      const filterFormula = `{Phone} = '${phone}'`;
      const endpoint = `${CUSTOMER_HISTORY_TABLE_ID}?filterByFormula=${encodeURIComponent(filterFormula)}`;
      const response = await airtableRequest('GET', endpoint);

      if (response.success && response.data.records.length > 0) {
        return response.data.records[0];
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching customer history:', error.message);
    return null;
  }
}

// ============================================================================
// DATA PROCESSING FUNCTIONS
// ============================================================================

/**
 * Filter reservations to only those with known outcomes
 * Note: Using "Cancelled" as proxy for no-shows since no explicit no-show status exists yet
 */
function filterToLabeledReservations(reservations) {
  console.log('🔍 Filtering to reservations with known outcomes...');

  const labeled = reservations.filter(r => {
    const status = r.fields.Status || r.fields.status;
    // Accept "Completed" (showed up) and "Cancelled" (treated as no-show)
    return status === 'Completed' || status === 'Cancelled';
  });

  const completed = labeled.filter(r => {
    const status = r.fields.Status || r.fields.status;
    return status === 'Completed';
  });

  const noShows = labeled.filter(r => {
    const status = r.fields.Status || r.fields.status;
    return status === 'Cancelled'; // Using Cancelled as proxy for no-shows
  });

  console.log(`   Total reservations: ${reservations.length}`);
  console.log(`   Completed: ${completed.length} (${(completed.length / labeled.length * 100).toFixed(1)}%)`);
  console.log(`   Cancelled (no-shows): ${noShows.length} (${(noShows.length / labeled.length * 100).toFixed(1)}%)`);
  console.log(`   Labeled: ${labeled.length}`);
  console.log(`   ⚠️ Note: Using 'Cancelled' as proxy for no-shows in training data\n`);

  return labeled;
}

/**
 * Extract features for all reservations
 */
async function extractFeaturesForAll(reservations) {
  console.log('⚙️ Extracting features for all reservations...');

  const results = [];
  let processed = 0;
  let errors = 0;
  let warnings = 0;

  for (const reservation of reservations) {
    try {
      const fields = reservation.fields;

      // Get customer history
      const customerHistory = await fetchCustomerHistory(
        fields.customer_email || fields['Customer Email'],
        fields.customer_phone || fields['Customer Phone']
      );

      // Create reservation object for feature extraction
      const resData = {
        reservation_id: fields.reservation_id || fields['Reservation ID'] || reservation.id,
        date: fields.date || fields['Date'],
        time: fields.time || fields['Time'],
        party_size: fields.party_size || fields['Party Size'],
        special_requests: fields.special_requests || fields['Special Requests'] || '',
        booking_created_at: fields.booking_created_at || fields['Booking Created At'] || fields.created_at,
        customer_email: fields.customer_email || fields['Customer Email'],
        customer_phone: fields.customer_phone || fields['Customer Phone'],
        confirmation_sent_at: fields.confirmation_sent_at || fields['Confirmation Sent At'],
        confirmation_clicked: fields.confirmation_clicked || fields['Confirmation Clicked']
      };

      // Extract features
      const features = extractAllFeatures(resData, customerHistory);

      // Add label (target variable)
      // Using "Cancelled" as proxy for no-show (1 = cancelled/no-show, 0 = completed)
      const status = fields.Status || fields.status;
      features.no_show = status === 'Cancelled' ? 1 : 0;
      features.reservation_id = resData.reservation_id;
      features.actual_status = status; // Keep original status for reference

      // Validate features (exclude metadata fields)
      const featuresToValidate = { ...features };
      delete featuresToValidate.no_show;
      delete featuresToValidate.reservation_id;
      delete featuresToValidate.actual_status;

      const validation = validateFeatureVector(featuresToValidate);

      if (validation.valid || validation.warnings.length === 0) {
        results.push(features);
      } else if (validation.errors.length === 0 && validation.warnings.length > 0) {
        // Only warnings, include anyway
        results.push(features);
        warnings++;
      } else {
        console.warn(`⚠️ Invalid features for ${resData.reservation_id}:`, validation.errors[0]);
        warnings++;
      }

      processed++;

      if (processed % 50 === 0) {
        console.log(`   Processed ${processed}/${reservations.length} reservations...`);
      }

    } catch (error) {
      console.error(`❌ Error processing reservation:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Feature extraction complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Valid: ${results.length}`);
  console.log(`   Warnings: ${warnings}`);
  console.log(`   Errors: ${errors}\n`);

  return results;
}

// ============================================================================
// DATA QUALITY FUNCTIONS
// ============================================================================

/**
 * Generate data quality report
 */
function generateDataQualityReport(data) {
  console.log('📋 Generating Data Quality Report...\n');
  console.log('=' .repeat(80));
  console.log('DATA QUALITY REPORT');
  console.log('=' .repeat(80));

  // Basic stats
  console.log('\n📊 DATASET STATISTICS\n');
  console.log(`   Total Records: ${data.length}`);

  // Date range
  const dates = data.map(d => new Date(d.date || '2025-01-01'));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  console.log(`   Date Range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);

  // Class distribution
  const noShows = data.filter(d => d.no_show === 1).length;
  const completed = data.filter(d => d.no_show === 0).length;
  const noShowRate = (noShows / data.length * 100).toFixed(1);

  console.log(`\n📈 CLASS DISTRIBUTION\n`);
  console.log(`   Completed: ${completed} (${(100 - noShowRate)}%)`);
  console.log(`   No-Shows: ${noShows} (${noShowRate}%)`);

  if (noShowRate < 10 || noShowRate > 40) {
    console.log(`   ⚠️ Class imbalance detected (${noShowRate}% no-shows)`);
    console.log(`   ⚠️ Recommended: 15-25% no-show rate for training`);
  } else {
    console.log(`   ✅ Class balance is good`);
  }

  // Feature completeness
  const featureNames = Object.keys(data[0]).filter(k => k !== 'no_show' && k !== 'reservation_id');
  console.log(`\n🔍 FEATURE COMPLETENESS\n`);
  console.log(`   Total Features: ${featureNames.length}`);

  let allComplete = true;
  for (const feature of featureNames.slice(0, 10)) { // Check first 10 features
    const missing = data.filter(d => d[feature] === null || d[feature] === undefined || isNaN(d[feature])).length;
    if (missing > 0) {
      console.log(`   ⚠️ ${feature}: ${missing} missing (${(missing / data.length * 100).toFixed(1)}%)`);
      allComplete = false;
    }
  }

  if (allComplete) {
    console.log(`   ✅ All features complete (no missing values)`);
  }

  // Feature ranges
  console.log(`\n📐 FEATURE RANGES (Sample)\n`);
  const sampleFeatures = [
    'booking_lead_time_hours',
    'party_size',
    'customer_no_show_rate',
    'is_repeat_customer'
  ];

  for (const feature of sampleFeatures) {
    const values = data.map(d => d[feature]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    console.log(`   ${feature.padEnd(30)} min: ${min.toFixed(1)}, max: ${max.toFixed(1)}, avg: ${avg}`);
  }

  console.log('\n' + '=' .repeat(80));
  console.log('\n');

  return {
    totalRecords: data.length,
    dateRange: { min: minDate, max: maxDate },
    classDistribution: { completed, noShows, noShowRate: parseFloat(noShowRate) },
    featureCount: featureNames.length
  };
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Save data to CSV
 */
function saveToCSV(data, filename) {
  console.log(`💾 Saving to CSV: ${filename}`);

  if (data.length === 0) {
    console.log('⚠️ No data to save');
    return;
  }

  // Get headers (all keys except reservation_id, put no_show at end)
  const headers = Object.keys(data[0]).filter(k => k !== 'no_show' && k !== 'reservation_id');
  headers.push('no_show');

  // Create CSV content
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      return typeof value === 'number' ? value : `"${value}"`;
    }).join(',');
  });

  const csvContent = [csvHeaders, ...csvRows].join('\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write file
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, csvContent);

  console.log(`✅ Saved ${data.length} records to ${filepath}\n`);
}

/**
 * Save data quality report
 */
function saveDataQualityReport(report, filename) {
  const content = JSON.stringify(report, null, 2);
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, content);
  console.log(`✅ Saved data quality report to ${filepath}\n`);
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

async function exportTrainingData() {
  console.log('🚀 Starting Historical Data Export for ML Training\n');
  console.log('=' .repeat(80));
  console.log('\n');

  try {
    // 1. Fetch all reservations
    const allReservations = await fetchAllReservations();

    if (allReservations.length === 0) {
      console.log('❌ No reservations found in Airtable');
      return;
    }

    // 2. Filter to labeled reservations (completed or no-show)
    const labeledReservations = filterToLabeledReservations(allReservations);

    if (labeledReservations.length === 0) {
      console.log('❌ No reservations with known outcomes (completed/no-show)');
      return;
    }

    // 3. Extract features for all reservations
    const featuresData = await extractFeaturesForAll(labeledReservations);

    if (featuresData.length === 0) {
      console.log('❌ No valid feature data extracted');
      return;
    }

    // 4. Generate data quality report
    const qualityReport = generateDataQualityReport(featuresData);

    // 5. Save to CSV
    saveToCSV(featuresData, 'historical_training_data.csv');

    // 6. Save quality report
    saveDataQualityReport(qualityReport, 'data_quality_report.json');

    // 7. Summary
    console.log('=' .repeat(80));
    console.log('✅ EXPORT COMPLETE!');
    console.log('=' .repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Total reservations fetched: ${allReservations.length}`);
    console.log(`   Labeled reservations: ${labeledReservations.length}`);
    console.log(`   Valid feature records: ${featuresData.length}`);
    console.log(`   No-show rate: ${qualityReport.classDistribution.noShowRate}%`);
    console.log(`   Features per record: ${qualityReport.featureCount}`);
    console.log(`\n📁 Output Files:`);
    console.log(`   ${path.join(OUTPUT_DIR, 'historical_training_data.csv')}`);
    console.log(`   ${path.join(OUTPUT_DIR, 'data_quality_report.json')}`);
    console.log(`\n🎯 Ready for Week 2 Days 11-12: Feature Engineering Pipeline\n`);

    return {
      success: true,
      recordsExported: featuresData.length,
      qualityReport
    };

  } catch (error) {
    console.error('❌ Export failed:', error);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// RUN EXPORT
// ============================================================================

if (require.main === module) {
  exportTrainingData()
    .then(result => {
      if (result.success) {
        console.log('✅ Export completed successfully');
        process.exit(0);
      } else {
        console.log('❌ Export failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { exportTrainingData };
