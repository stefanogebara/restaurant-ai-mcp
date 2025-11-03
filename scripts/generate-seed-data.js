/**
 * Generate Seed Data for All Dashboards
 *
 * Creates realistic sample data for:
 * - ML ROI Dashboard (interventions, outcomes)
 * - LTV Dashboard (customer tiers, lifetime values)
 * - Pricing Rules (dynamic pricing examples)
 * - Customer DNA (behavioral profiles)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Sample customer phone numbers
const SAMPLE_CUSTOMERS = [
  '+1-555-0101', '+1-555-0102', '+1-555-0103', '+1-555-0104', '+1-555-0105',
  '+1-555-0106', '+1-555-0107', '+1-555-0108', '+1-555-0109', '+1-555-0110',
  '+1-555-0111', '+1-555-0112', '+1-555-0113', '+1-555-0114', '+1-555-0115',
  '+1-555-0116', '+1-555-0117', '+1-555-0118', '+1-555-0119', '+1-555-0120'
];

const CUSTOMER_NAMES = [
  'Emma Thompson', 'James Wilson', 'Sophia Martinez', 'Oliver Brown', 'Isabella Garcia',
  'William Davis', 'Ava Rodriguez', 'Lucas Miller', 'Mia Anderson', 'Henry Taylor',
  'Charlotte Thomas', 'Alexander Jackson', 'Amelia White', 'Benjamin Harris', 'Harper Martin',
  'Michael Lee', 'Evelyn Lewis', 'Daniel Walker', 'Abigail Hall', 'Matthew Allen'
];

const TIME_SLOTS = [
  'Lunch',
  'Early Dinner',
  'Prime Dinner',
  'Late Dinner'
];

const DINING_STYLES = ['solo', 'couple', 'family', 'business', 'group'];

/**
 * Generate ML Interventions and Outcomes
 */
async function generateMLData() {
  console.log('\n📊 Generating ML ROI data...');

  // First, get real reservation IDs from the database
  const { data: reservations, error: fetchError } = await supabase
    .from('reservations')
    .select('reservation_id')
    .order('created_at', { ascending: false })
    .limit(30);

  if (fetchError || !reservations || reservations.length === 0) {
    console.log('⚠️  No reservations found. Skipping ML interventions generation.');
    return;
  }

  const interventions = [];

  // Generate interventions for each reservation
  for (let i = 0; i < reservations.length; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const reservationDate = new Date();
    reservationDate.setDate(reservationDate.getDate() - daysAgo);

    const riskScore = 50 + Math.floor(Math.random() * 50); // 50-100%
    const riskLevel = riskScore >= 80 ? 'high' : riskScore >= 60 ? 'medium' : 'low';

    const interventionTypes = ['deposit_required', 'confirmation_call', 'premium_seating'];
    const interventionType = interventionTypes[Math.floor(Math.random() * interventionTypes.length)];

    // 70% success rate for interventions
    const actualOutcome = Math.random() < 0.7 ? 'showed_up' : (Math.random() < 0.5 ? 'no_show' : 'cancelled');

    const intervention = {
      reservation_id: reservations[i].reservation_id,
      ml_risk_score: riskScore,
      ml_risk_level: riskLevel,
      intervention_type: interventionType,
      action_taken: true,
      action_timestamp: reservationDate.toISOString(),
      actual_outcome: actualOutcome,
      outcome_timestamp: actualOutcome === 'showed_up' ? reservationDate.toISOString() : null,
      cost_of_intervention: interventionType === 'deposit_required' ? 2 : interventionType === 'confirmation_call' ? 5 : 10,
      value_saved: actualOutcome === 'showed_up' ? 80 : 0,
      created_at: reservationDate.toISOString()
    };

    interventions.push(intervention);
  }

  // Insert ML interventions
  const { error: mlError } = await supabase
    .from('ml_interventions')
    .insert(interventions);

  if (mlError) {
    console.error('❌ Error inserting ML interventions:', mlError);
  } else {
    console.log(`✅ Generated ${interventions.length} ML interventions`);
  }
}

/**
 * Generate Customer Lifetime Value Data
 */
async function generateLTVData() {
  console.log('\n💰 Generating LTV data...');

  const ltvData = [];

  for (let i = 0; i < SAMPLE_CUSTOMERS.length; i++) {
    const customerId = SAMPLE_CUSTOMERS[i];
    const customerName = CUSTOMER_NAMES[i];

    // Generate varied customer tiers
    let tier, totalVisits, totalRevenue;
    const tierRoll = Math.random();

    if (tierRoll < 0.15) {
      // VIP (15%)
      tier = 'vip';
      totalVisits = 10 + Math.floor(Math.random() * 20);
      totalRevenue = 1000 + Math.floor(Math.random() * 2000);
    } else if (tierRoll < 0.40) {
      // Regular (25%)
      tier = 'regular';
      totalVisits = 5 + Math.floor(Math.random() * 5);
      totalRevenue = 500 + Math.floor(Math.random() * 500);
    } else if (tierRoll < 0.70) {
      // Occasional (30%)
      tier = 'occasional';
      totalVisits = 2 + Math.floor(Math.random() * 3);
      totalRevenue = 100 + Math.floor(Math.random() * 400);
    } else if (tierRoll < 0.85) {
      // New (15%)
      tier = 'new';
      totalVisits = 1;
      totalRevenue = 50 + Math.floor(Math.random() * 100);
    } else {
      // At Risk (15%)
      tier = 'at_risk';
      totalVisits = 5 + Math.floor(Math.random() * 10);
      totalRevenue = 500 + Math.floor(Math.random() * 1000);
    }

    const avgRevenuePerVisit = totalRevenue / totalVisits;
    const lifetimeValue = totalRevenue * 1.5; // Project 50% more

    // Churn risk (high for at_risk, low for others)
    const churnRiskScore = tier === 'at_risk' ? 75 + Math.floor(Math.random() * 20) : 10 + Math.floor(Math.random() * 40);

    const lastVisitDate = new Date();
    lastVisitDate.setDate(lastVisitDate.getDate() - (tier === 'at_risk' ? 100 + Math.floor(Math.random() * 50) : Math.floor(Math.random() * 30)));

    const predictedNextVisit = new Date(lastVisitDate);
    predictedNextVisit.setDate(predictedNextVisit.getDate() + (tier === 'vip' ? 14 : tier === 'regular' ? 30 : 60));

    ltvData.push({
      customer_id: customerId,
      customer_phone: customerId,
      customer_name: customerName,
      total_visits: totalVisits,
      total_revenue: totalRevenue,
      avg_revenue_per_visit: avgRevenuePerVisit,
      customer_tier: tier,
      lifetime_value: lifetimeValue,
      churn_risk_score: churnRiskScore,
      last_visit_date: lastVisitDate.toISOString().split('T')[0],
      predicted_next_visit_date: predictedNextVisit.toISOString().split('T')[0],
      favorite_time_slot: TIME_SLOTS[Math.floor(Math.random() * TIME_SLOTS.length)],
      favorite_day: Math.random() > 0.5 ? 'Weekend' : 'Weekday',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Insert LTV data
  const { error: ltvError } = await supabase
    .from('customer_ltv')
    .upsert(ltvData, { onConflict: 'customer_id' });

  if (ltvError) {
    console.error('❌ Error inserting LTV data:', ltvError);
  } else {
    console.log(`✅ Generated ${ltvData.length} customer LTV records`);
    console.log(`   - VIP: ${ltvData.filter(c => c.customer_tier === 'vip').length}`);
    console.log(`   - Regular: ${ltvData.filter(c => c.customer_tier === 'regular').length}`);
    console.log(`   - Occasional: ${ltvData.filter(c => c.customer_tier === 'occasional').length}`);
    console.log(`   - New: ${ltvData.filter(c => c.customer_tier === 'new').length}`);
    console.log(`   - At Risk: ${ltvData.filter(c => c.customer_tier === 'at_risk').length}`);
  }
}

/**
 * Generate Dynamic Pricing Rules
 */
async function generatePricingRules() {
  console.log('\n💵 Generating pricing rules...');

  const rules = [
    {
      rule_name: 'Weekend Prime Dinner Surge',
      rule_type: 'time_based',
      day_of_week: 'Fri,Sat',
      time_slot_start: '19:00:00',
      time_slot_end: '21:00:00',
      price_modifier_type: 'percentage',
      price_modifier_value: 25,
      is_active: true,
      priority: 10
    },
    {
      rule_name: 'Weekday Lunch Special',
      rule_type: 'time_based',
      day_of_week: 'Mon-Fri',
      time_slot_start: '11:00:00',
      time_slot_end: '14:00:00',
      price_modifier_type: 'percentage',
      price_modifier_value: -15,
      is_active: true,
      priority: 5
    },
    {
      rule_name: 'High Demand Surge (>80% occupancy)',
      rule_type: 'demand_based',
      occupancy_threshold: 80,
      price_modifier_type: 'percentage',
      price_modifier_value: 30,
      is_active: true,
      priority: 15
    },
    {
      rule_name: 'Last-Minute Availability (< 5 seats)',
      rule_type: 'demand_based',
      seats_remaining_threshold: 5,
      price_modifier_type: 'percentage',
      price_modifier_value: 35,
      is_active: true,
      priority: 20
    },
    {
      rule_name: 'New Year\'s Eve Premium',
      rule_type: 'event_based',
      event_name: 'New Year\'s Eve',
      event_start_date: '2025-12-31',
      event_end_date: '2025-12-31',
      price_modifier_type: 'percentage',
      price_modifier_value: 50,
      is_active: true,
      priority: 25
    },
    {
      rule_name: 'Valentine\'s Day Premium',
      rule_type: 'event_based',
      event_name: 'Valentine\'s Day',
      event_start_date: '2026-02-14',
      event_end_date: '2026-02-14',
      price_modifier_type: 'percentage',
      price_modifier_value: 40,
      is_active: true,
      priority: 25
    }
  ];

  const { error: rulesError } = await supabase
    .from('pricing_rules')
    .insert(rules);

  if (rulesError && rulesError.code !== '23505') {
    console.error('❌ Error inserting pricing rules:', rulesError);
  } else {
    console.log(`✅ Generated ${rules.length} pricing rules`);
  }

  // Generate sample pricing events
  const events = [];
  for (let i = 0; i < 50; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() - daysAgo);

    const timeSlots = ['Lunch', 'Early Dinner', 'Prime Dinner', 'Late Dinner'];

    events.push({
      reservation_id: `RES-PRICE-${i}`,
      event_type: 'calculation',
      base_price: 50,
      final_price: 50 + (Math.random() * 40 - 10),
      modifier_applied: (Math.random() * 40 - 10),
      pricing_rule_id: null,
      pricing_rule_name: null,
      demand_level: ['low', 'medium', 'high', 'surge'][Math.floor(Math.random() * 4)],
      occupancy_at_time: Math.floor(Math.random() * 100),
      time_slot: timeSlots[Math.floor(Math.random() * timeSlots.length)],
      date: eventDate.toISOString().split('T')[0],
      created_at: eventDate.toISOString()
    });
  }

  const { error: eventsError } = await supabase
    .from('pricing_events')
    .insert(events);

  if (eventsError) {
    console.error('❌ Error inserting pricing events:', eventsError);
  } else {
    console.log(`✅ Generated ${events.length} pricing calculation events`);
  }
}

/**
 * Generate Customer DNA Behavioral Profiles
 */
async function generateDNAProfiles() {
  console.log('\n🧬 Generating Customer DNA profiles...');

  const profiles = [];
  const occasions = [];
  const predictions = [];

  for (let i = 0; i < SAMPLE_CUSTOMERS.length; i++) {
    const customerId = SAMPLE_CUSTOMERS[i];
    const diningStyle = DINING_STYLES[Math.floor(Math.random() * DINING_STYLES.length)];

    const profile = {
      customer_id: customerId,
      preferred_time_slot: TIME_SLOTS[Math.floor(Math.random() * TIME_SLOTS.length)],
      preferred_day_type: Math.random() > 0.5 ? 'weekend' : 'weekday',
      booking_lead_time_avg: Math.floor(Math.random() * 30),
      spontaneity_score: Math.floor(Math.random() * 100),
      typical_party_size: diningStyle === 'solo' ? 1 : diningStyle === 'couple' ? 2 : diningStyle === 'family' ? 4 : diningStyle === 'business' ? 3 : 6,
      dining_style: diningStyle,
      brings_children: diningStyle === 'family' && Math.random() > 0.5,
      avg_dining_duration_minutes: 60 + Math.floor(Math.random() * 60),
      pace_preference: ['leisurely', 'moderate', 'quick'][Math.floor(Math.random() * 3)],
      noise_tolerance: ['quiet', 'moderate', 'lively'][Math.floor(Math.random() * 3)],
      primary_occasion_type: diningStyle === 'business' ? 'business' : diningStyle === 'couple' ? 'date' : 'casual',
      profile_confidence: 50 + Math.floor(Math.random() * 45),
      last_analyzed_at: new Date().toISOString()
    };

    profiles.push(profile);

    // Add occasional birthday/anniversary
    if (Math.random() > 0.7) {
      const occasionDate = new Date();
      occasionDate.setMonth(Math.floor(Math.random() * 12));
      occasionDate.setDate(Math.floor(Math.random() * 28) + 1);

      occasions.push({
        customer_id: customerId,
        occasion_type: Math.random() > 0.5 ? 'anniversary' : 'birthday',
        occasion_date: occasionDate.toISOString().split('T')[0],
        recurrence: 'annual',
        party_size: profile.typical_party_size,
        next_predicted_date: `2026-${String(occasionDate.getMonth() + 1).padStart(2, '0')}-${String(occasionDate.getDate()).padStart(2, '0')}`,
        probability_score: 0.85
      });
    }

    // Add predictions
    const nextVisit = new Date();
    nextVisit.setDate(nextVisit.getDate() + (profile.booking_lead_time_avg || 14));

    predictions.push({
      customer_id: customerId,
      prediction_type: 'next_visit_date',
      predicted_value: nextVisit.toISOString().split('T')[0],
      confidence_score: profile.profile_confidence / 100,
      prediction_date: new Date().toISOString().split('T')[0],
      predicted_for_date: nextVisit.toISOString().split('T')[0]
    });
  }

  // Insert DNA profiles
  const { error: profilesError } = await supabase
    .from('customer_behavioral_profiles')
    .upsert(profiles, { onConflict: 'customer_id' });

  if (profilesError) {
    console.error('❌ Error inserting DNA profiles:', profilesError);
  } else {
    console.log(`✅ Generated ${profiles.length} DNA behavioral profiles`);
    console.log(`   - Solo: ${profiles.filter(p => p.dining_style === 'solo').length}`);
    console.log(`   - Couple: ${profiles.filter(p => p.dining_style === 'couple').length}`);
    console.log(`   - Family: ${profiles.filter(p => p.dining_style === 'family').length}`);
    console.log(`   - Business: ${profiles.filter(p => p.dining_style === 'business').length}`);
    console.log(`   - Group: ${profiles.filter(p => p.dining_style === 'group').length}`);
  }

  // Insert occasions
  if (occasions.length > 0) {
    const { error: occasionsError } = await supabase
      .from('customer_occasions')
      .insert(occasions);

    if (occasionsError) {
      console.error('❌ Error inserting occasions:', occasionsError);
    } else {
      console.log(`✅ Generated ${occasions.length} special occasions`);
    }
  }

  // Insert predictions
  const { error: predictionsError } = await supabase
    .from('customer_predictions')
    .insert(predictions);

  if (predictionsError && predictionsError.code !== '23505') {
    console.error('❌ Error inserting predictions:', predictionsError);
  } else {
    console.log(`✅ Generated ${predictions.length} predictions`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🌱 Starting seed data generation...\n');
  console.log('=' .repeat(60));

  try {
    await generateMLData();
    await generateLTVData();
    await generatePricingRules();
    await generateDNAProfiles();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Seed data generation complete!');
    console.log('\n📊 Summary:');
    console.log('   - ML Interventions: 30 records');
    console.log('   - LTV Customer Data: 20 records across all tiers');
    console.log('   - Pricing Rules: 6 active rules');
    console.log('   - Pricing Events: 50 calculation records');
    console.log('   - DNA Profiles: 20 behavioral profiles');
    console.log('   - Special Occasions: ~6 detected');
    console.log('   - Predictions: 20 forecasts');
    console.log('\n🚀 All dashboards now have demo data!');

  } catch (error) {
    console.error('\n❌ Error generating seed data:', error);
    process.exit(1);
  }
}

// Run the script
main();
