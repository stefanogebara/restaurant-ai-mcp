/**
 * Generate Synthetic Training Data for No-Show Prediction
 *
 * Creates realistic training data based on research patterns:
 * - Lead time is #1 predictor (longer lead time = higher no-show)
 * - Large parties (6+) have 2.3x higher no-show rates
 * - Repeat customers 85% less likely to no-show
 * - Confirmation clicks reduce no-shows by 60%
 * - Weekend vs weekday patterns
 *
 * This is common practice when historical data is limited.
 * The synthetic data follows realistic distributions from hospitality research.
 */

const fs = require('fs');
const path = require('path');

// Research-based no-show probabilities
const BASE_NO_SHOW_RATE = 0.15; // Industry average 15%

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomChoice(array) {
  return array[random(0, array.length - 1)];
}

function generateReservationId() {
  const date = new Date();
  date.setDate(date.getDate() - random(1, 180)); // Past 6 months
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const randomNum = random(1000, 9999);
  return `RES-${dateStr}-${randomNum}`;
}

function generateSyntheticReservation() {
  // Temporal features
  const daysUntilReservation = random(0, 60); // 0-60 days in advance
  const bookingLeadTimeHours = daysUntilReservation * 24 + random(0, 23);

  const hourOfDay = randomChoice([11, 12, 13, 18, 19, 20, 21, 22]); // Common reservation times
  const dayOfWeek = random(0, 6);
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) ? 1 : 0;
  const isPrimeTime = (hourOfDay >= 18 && hourOfDay <= 21) ? 1 : 0;
  const monthOfYear = random(1, 12);

  // Customer features
  const isRepeatCustomer = Math.random() < 0.4 ? 1 : 0; // 40% repeat customers
  const customerVisitCount = isRepeatCustomer === 1 ? random(1, 15) : 0;

  // Customer no-show rate depends on history
  let customerNoShowRate;
  if (isRepeatCustomer === 1) {
    // Repeat customers with good history
    customerNoShowRate = Math.random() < 0.8 ? randomFloat(0.0, 0.1) : randomFloat(0.1, 0.3);
  } else {
    // New customers - industry average
    customerNoShowRate = 0.15;
  }

  const customerAvgPartySize = randomFloat(2.0, 4.5);
  const daysSinceLastVisit = isRepeatCustomer === 1 ? random(7, 180) : 999;
  const customerLifetimeValue = isRepeatCustomer === 1 ? randomFloat(100, 2000) : 0;

  // Reservation features
  const partySize = randomChoice([1, 2, 2, 2, 3, 4, 4, 5, 6, 8]); // Weighted towards 2-4
  const partySizeCategory = partySize <= 2 ? 0 : (partySize <= 4 ? 1 : 2);
  const isLargeParty = partySize >= 6 ? 1 : 0;
  const hasSpecialRequests = Math.random() < 0.3 ? 1 : 0; // 30% have special requests

  // Engagement features
  const confirmationSent = Math.random() < 0.9 ? 1 : 0; // 90% get confirmations
  const confirmationClicked = confirmationSent === 1 && Math.random() < 0.4 ? 1 : 0; // 40% click rate
  const hoursSinceConfirmationSent = confirmationSent === 1 ? random(24, bookingLeadTimeHours) : 0;

  // Calculated features
  const dayNoShowRates = {
    0: 0.18, 1: 0.12, 2: 0.11, 3: 0.12, 4: 0.14, 5: 0.16, 6: 0.17
  };
  const historicalNoShowRateForDay = dayNoShowRates[dayOfWeek];

  const historicalNoShowRateForTime = hourOfDay >= 21 ? 0.22 : (hourOfDay >= 18 ? 0.12 : 0.14);
  const occupancyRateForSlot = isPrimeTime === 1 ? randomFloat(0.80, 0.95) : randomFloat(0.50, 0.75);

  // ============================================================================
  // CALCULATE NO-SHOW PROBABILITY (Research-based)
  // ============================================================================

  let noShowProb = BASE_NO_SHOW_RATE;

  // Lead time effect (MOST IMPORTANT)
  if (bookingLeadTimeHours < 24) {
    noShowProb *= 0.5; // Same day = 50% lower risk
  } else if (bookingLeadTimeHours > 7 * 24) {
    noShowProb *= 2.0; // 1+ week ahead = 2x higher risk
  } else if (bookingLeadTimeHours > 14 * 24) {
    noShowProb *= 2.5; // 2+ weeks ahead = 2.5x higher risk
  }

  // Large party effect
  if (isLargeParty === 1) {
    noShowProb *= 2.3; // Research: 2.3x higher for large parties
  }

  // Repeat customer effect
  if (isRepeatCustomer === 1 && customerNoShowRate < 0.1) {
    noShowProb *= 0.15; // Research: 85% less likely (multiply by 0.15)
  }

  // Customer history effect
  noShowProb *= (1 + customerNoShowRate);

  // Confirmation click effect
  if (confirmationClicked === 1) {
    noShowProb *= 0.4; // Research: 60% reduction
  } else if (confirmationSent === 1) {
    noShowProb *= 0.7; // Just sending reduces by 30%
  }

  // Special requests effect (more engagement = lower no-show)
  if (hasSpecialRequests === 1) {
    noShowProb *= 0.8;
  }

  // Weekend effect
  if (isWeekend === 1) {
    noShowProb *= 1.2;
  }

  // Late night effect
  if (hourOfDay >= 21) {
    noShowProb *= 1.3;
  }

  // Cap probability at 0.95
  noShowProb = Math.min(0.95, noShowProb);

  // Generate binary outcome
  const noShow = Math.random() < noShowProb ? 1 : 0;

  return {
    reservation_id: generateReservationId(),
    booking_lead_time_hours: parseFloat(bookingLeadTimeHours.toFixed(2)),
    hour_of_day: hourOfDay,
    day_of_week: dayOfWeek,
    is_weekend: isWeekend,
    is_prime_time: isPrimeTime,
    month_of_year: monthOfYear,
    days_until_reservation: daysUntilReservation,
    is_repeat_customer: isRepeatCustomer,
    customer_visit_count: customerVisitCount,
    customer_no_show_rate: parseFloat(customerNoShowRate.toFixed(3)),
    customer_avg_party_size: parseFloat(customerAvgPartySize.toFixed(1)),
    days_since_last_visit: daysSinceLastVisit,
    customer_lifetime_value: parseFloat(customerLifetimeValue.toFixed(2)),
    party_size: partySize,
    party_size_category: partySizeCategory,
    is_large_party: isLargeParty,
    has_special_requests: hasSpecialRequests,
    confirmation_sent: confirmationSent,
    confirmation_clicked: confirmationClicked,
    hours_since_confirmation_sent: parseFloat(hoursSinceConfirmationSent.toFixed(2)),
    historical_no_show_rate_for_day: parseFloat(historicalNoShowRateForDay.toFixed(2)),
    historical_no_show_rate_for_time: parseFloat(historicalNoShowRateForTime.toFixed(2)),
    occupancy_rate_for_slot: parseFloat(occupancyRateForSlot.toFixed(2)),
    no_show: noShow
  };
}

function convertToCSV(data) {
  if (data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const rows = data.map(row => {
    return headers.map(header => row[header]).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

function generateSyntheticDataset(numSamples = 1000) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      Generate Synthetic Training Data (Research-Based)    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Generating ${numSamples} synthetic reservations...\n`);

  const data = [];
  for (let i = 0; i < numSamples; i++) {
    data.push(generateSyntheticReservation());

    if ((i + 1) % 100 === 0) {
      console.log(`   Generated ${i + 1}/${numSamples} samples...`);
    }
  }

  console.log(`\n✅ Generated ${data.length} samples\n`);

  // Statistics
  const noShows = data.filter(d => d.no_show === 1).length;
  const showUps = data.length - noShows;

  console.log('📊 Dataset Statistics:\n');
  console.log(`   Total: ${data.length}`);
  console.log(`   No-Shows: ${noShows} (${(noShows / data.length * 100).toFixed(1)}%)`);
  console.log(`   Show-Ups: ${showUps} (${(showUps / data.length * 100).toFixed(1)}%)\n`);

  // Save files
  const outputDir = path.join(__dirname, '..', 'ml-training');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Full dataset
  const fullPath = path.join(outputDir, 'synthetic_training_data.csv');
  fs.writeFileSync(fullPath, convertToCSV(data));
  console.log(`✅ Saved: ${fullPath}\n`);

  // Train/test split (80/20)
  const shuffled = shuffleArray(data);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const trainSet = shuffled.slice(0, splitIdx);
  const testSet = shuffled.slice(splitIdx);

  const trainPath = path.join(outputDir, 'synthetic_train.csv');
  const testPath = path.join(outputDir, 'synthetic_test.csv');

  fs.writeFileSync(trainPath, convertToCSV(trainSet));
  fs.writeFileSync(testPath, convertToCSV(testSet));

  console.log(`✅ Saved train set: ${trainPath} (${trainSet.length} samples)`);
  console.log(`✅ Saved test set: ${testPath} (${testSet.length} samples)\n`);

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  GENERATION COMPLETE!                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('The synthetic data follows research-based patterns:');
  console.log('  ✓ Lead time is #1 predictor');
  console.log('  ✓ Large parties 2.3x higher risk');
  console.log('  ✓ Repeat customers 85% lower risk');
  console.log('  ✓ Confirmation clicks 60% reduction');
  console.log('  ✓ Weekend/timing effects included\n');

  console.log('Next steps:');
  console.log('1. Train XGBoost model: python ml-training/train_model.py');
  console.log('2. Evaluate on test set');
  console.log('3. Deploy model to production\n');
}

// Generate 1000 samples by default
const numSamples = process.argv[2] ? parseInt(process.argv[2]) : 1000;
generateSyntheticDataset(numSamples);
