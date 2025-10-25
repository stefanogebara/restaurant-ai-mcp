/**
 * Create Training Dataset for No-Show Prediction
 *
 * Exports historical reservations, applies feature engineering,
 * and creates training/test CSV files for XGBoost model training.
 *
 * Output:
 * - ml-training/training_data.csv (all data with features + labels)
 * - ml-training/train.csv (80% for training)
 * - ml-training/test.csv (20% for evaluation)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { extractAllFeatures, getFeatureNames } = require('../api/ml/features');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const CUSTOMER_HISTORY_TABLE_ID = process.env.CUSTOMER_HISTORY_TABLE_ID;

// ============================================================================
// AIRTABLE HELPERS
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
      timeout: 30000
    };

    if (data !== null && method !== 'GET') {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Airtable ${method} error:`, error.response?.data || error.message);
    return {
      success: false,
      error: true,
      message: error.response?.data?.error?.message || error.message
    };
  }
}

// ============================================================================
// FETCH HISTORICAL RESERVATIONS
// ============================================================================

async function fetchAllReservations() {
  console.log('\n📥 Fetching all historical reservations from Airtable...\n');

  let allRecords = [];
  let offset = null;
  let pageCount = 0;

  do {
    pageCount++;
    const endpoint = offset
      ? `${RESERVATIONS_TABLE_ID}?offset=${offset}`
      : RESERVATIONS_TABLE_ID;

    const result = await airtableRequest('GET', endpoint);

    if (!result.success) {
      throw new Error(`Failed to fetch reservations: ${result.message}`);
    }

    allRecords = allRecords.concat(result.data.records);
    offset = result.data.offset;

    console.log(`   Page ${pageCount}: Fetched ${result.data.records.length} records (Total: ${allRecords.length})`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));

  } while (offset);

  console.log(`✅ Fetched ${allRecords.length} total reservations\n`);
  return allRecords;
}

// ============================================================================
// FETCH CUSTOMER HISTORY FOR RESERVATIONS
// ============================================================================

async function fetchCustomerHistory(customerHistoryLinks) {
  if (!customerHistoryLinks || customerHistoryLinks.length === 0) {
    return null;
  }

  const customerId = customerHistoryLinks[0];

  try {
    const result = await airtableRequest('GET', `${CUSTOMER_HISTORY_TABLE_ID}/${customerId}`);

    if (result.success) {
      return result.data;
    }
  } catch (error) {
    console.error(`Error fetching customer ${customerId}:`, error.message);
  }

  return null;
}

// ============================================================================
// FILTER RESERVATIONS WITH KNOWN OUTCOMES
// ============================================================================

function filterReservationsWithOutcomes(reservations) {
  console.log('\n📊 Filtering reservations with known outcomes...\n');

  const validStatuses = ['Completed', 'completed', 'No-Show', 'no-show'];

  const filtered = reservations.filter(r => {
    const status = r.fields.Status || r.fields.status;
    return validStatuses.includes(status);
  });

  const completed = filtered.filter(r => {
    const status = r.fields.Status || r.fields.status;
    return status === 'Completed' || status === 'completed';
  }).length;

  const noShows = filtered.filter(r => {
    const status = r.fields.Status || r.fields.status;
    return status === 'No-Show' || status === 'no-show';
  }).length;

  console.log(`   Total reservations: ${reservations.length}`);
  console.log(`   With known outcomes: ${filtered.length}`);
  console.log(`   Completed: ${completed} (${(completed / filtered.length * 100).toFixed(1)}%)`);
  console.log(`   No-Shows: ${noShows} (${(noShows / filtered.length * 100).toFixed(1)}%)`);
  console.log(`   Filtered out: ${reservations.length - filtered.length}\n`);

  if (noShows === 0) {
    console.warn('⚠️  WARNING: No no-show records found! Model cannot learn no-show patterns.');
    console.warn('   Consider manually marking some test reservations as no-shows for training.\n');
  }

  return filtered;
}

// ============================================================================
// EXTRACT FEATURES FROM RESERVATIONS
// ============================================================================

async function extractFeaturesFromReservations(reservations) {
  console.log('\n🔧 Extracting features from reservations...\n');

  const trainingData = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < reservations.length; i++) {
    const reservation = reservations[i];

    try {
      // Get customer history if available
      let customerHistory = null;
      const customerLinks = reservation.fields['Customer History'];

      if (customerLinks && customerLinks.length > 0) {
        customerHistory = await fetchCustomerHistory(customerLinks);
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Extract features
      const features = extractAllFeatures(
        {
          ...reservation.fields,
          date: reservation.fields.Date,
          time: reservation.fields.Time,
          party_size: reservation.fields['Party Size'],
          customer_name: reservation.fields['Customer Name'],
          special_requests: reservation.fields['Special Requests'] || '',
          booking_created_at: reservation.fields['Booking Created At'] || reservation.fields['Created At'],
          created_at: reservation.fields['Created At'],
          confirmation_sent: reservation.fields['Confirmation Sent'],
          confirmation_clicked: reservation.fields['Confirmation Clicked'],
          confirmation_sent_at: reservation.fields['Confirmation Sent At']
        },
        customerHistory,
        null // No historical stats for now
      );

      // Determine label (1 = no-show, 0 = showed up)
      const status = reservation.fields.Status || reservation.fields.status;
      const label = (status === 'No-Show' || status === 'no-show') ? 1 : 0;

      trainingData.push({
        reservation_id: reservation.fields['Reservation ID'],
        ...features,
        no_show: label
      });

      successCount++;

      if ((i + 1) % 10 === 0) {
        console.log(`   Processed ${i + 1}/${reservations.length} reservations...`);
      }

    } catch (error) {
      errorCount++;
      console.error(`   Error processing reservation ${reservation.id}:`, error.message);
    }
  }

  console.log(`\n✅ Feature extraction complete:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);

  return trainingData;
}

// ============================================================================
// CONVERT TO CSV
// ============================================================================

function convertToCSV(data) {
  if (data.length === 0) {
    return '';
  }

  // Get headers
  const headers = Object.keys(data[0]);

  // Create CSV rows
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Handle strings with commas
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(',');
  });

  // Combine headers and rows
  return [headers.join(','), ...rows].join('\n');
}

// ============================================================================
// SHUFFLE AND SPLIT
// ============================================================================

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function trainTestSplit(data, testSize = 0.2) {
  console.log('\n📊 Splitting into train/test sets...\n');

  const shuffled = shuffleArray(data);
  const splitIdx = Math.floor(shuffled.length * (1 - testSize));

  const trainSet = shuffled.slice(0, splitIdx);
  const testSet = shuffled.slice(splitIdx);

  console.log(`   Train set: ${trainSet.length} samples (${(trainSet.length / data.length * 100).toFixed(1)}%)`);
  console.log(`   Test set: ${testSet.length} samples (${(testSet.length / data.length * 100).toFixed(1)}%)\n`);

  return { trainSet, testSet };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function createTrainingDataset() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      Create Training Dataset for XGBoost No-Show Model    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Validate environment variables
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !RESERVATIONS_TABLE_ID) {
    console.error('\n❌ Missing required environment variables:');
    console.error('   - AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? '✓' : '✗');
    console.error('   - AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? '✓' : '✗');
    console.error('   - RESERVATIONS_TABLE_ID:', RESERVATIONS_TABLE_ID ? '✓' : '✗');
    process.exit(1);
  }

  try {
    // Step 1: Fetch all reservations
    const allReservations = await fetchAllReservations();

    // Step 2: Filter for reservations with known outcomes
    const reservationsWithOutcomes = filterReservationsWithOutcomes(allReservations);

    if (reservationsWithOutcomes.length < 50) {
      console.warn('⚠️  WARNING: Less than 50 reservations with known outcomes.');
      console.warn('   ML model training requires at least 100-200 samples for good accuracy.\n');
    }

    // Step 3: Extract features
    const trainingData = await extractFeaturesFromReservations(reservationsWithOutcomes);

    if (trainingData.length === 0) {
      console.error('❌ No training data generated. Exiting.');
      process.exit(1);
    }

    // Step 4: Save complete dataset
    console.log('💾 Saving training dataset...\n');

    const outputDir = path.join(__dirname, '..', 'ml-training');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fullDatasetPath = path.join(outputDir, 'training_data.csv');
    const fullDatasetCSV = convertToCSV(trainingData);
    fs.writeFileSync(fullDatasetPath, fullDatasetCSV);
    console.log(`   ✅ Saved complete dataset: ${fullDatasetPath}`);
    console.log(`   Size: ${trainingData.length} samples\n`);

    // Step 5: Split and save train/test sets
    const { trainSet, testSet } = trainTestSplit(trainingData, 0.2);

    const trainPath = path.join(outputDir, 'train.csv');
    const testPath = path.join(outputDir, 'test.csv');

    fs.writeFileSync(trainPath, convertToCSV(trainSet));
    fs.writeFileSync(testPath, convertToCSV(testSet));

    console.log(`   ✅ Saved train set: ${trainPath}`);
    console.log(`   ✅ Saved test set: ${testPath}\n`);

    // Step 6: Display summary statistics
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  DATASET SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const noShowCount = trainingData.filter(d => d.no_show === 1).length;
    const showUpCount = trainingData.filter(d => d.no_show === 0).length;

    console.log(`Total Samples: ${trainingData.length}`);
    console.log(`Features: ${getFeatureNames().length}`);
    console.log(`No-Shows: ${noShowCount} (${(noShowCount / trainingData.length * 100).toFixed(1)}%)`);
    console.log(`Show-Ups: ${showUpCount} (${(showUpCount / trainingData.length * 100).toFixed(1)}%)`);
    console.log('');

    console.log('Train/Test Split:');
    console.log(`  Train: ${trainSet.length} samples`);
    console.log(`  Test: ${testSet.length} samples`);
    console.log('');

    console.log('✅ Training dataset created successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Review ml-training/training_data.csv to verify data quality');
    console.log('2. Set up Python environment: pip install xgboost scikit-learn pandas');
    console.log('3. Train model: python ml-training/train_model.py');
    console.log('');

  } catch (error) {
    console.error('\n❌ Dataset creation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run script
createTrainingDataset().catch(console.error);
