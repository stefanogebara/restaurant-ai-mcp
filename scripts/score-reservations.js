/**
 * Score All Reservations Script
 *
 * Calculates ML risk scores for all existing reservations
 * and updates the database with predictions.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processReservation } = require('../api/services/mlRiskScoring');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function scoreAllReservations() {
  console.log('\n🤖 Starting ML Risk Scoring for All Reservations\n');
  console.log('=' .repeat(60));

  try {
    // Fetch all reservations that don't have ML scores yet
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .is('ml_risk_score', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching reservations:', error);
      return;
    }

    if (!reservations || reservations.length === 0) {
      console.log('✅ All reservations already have ML scores!');
      return;
    }

    console.log(`\n📊 Found ${reservations.length} reservations to score\n`);

    let scored = 0;
    let highRisk = 0;
    let veryHighRisk = 0;
    let errors = 0;

    for (const reservation of reservations) {
      try {
        const result = await processReservation(reservation);
        scored++;

        if (result.riskLevel === 'high') highRisk++;
        if (result.riskLevel === 'very-high') veryHighRisk++;  // Fixed: Use hyphen to match enum

        if (result.needsIntervention) {
          console.log(`\n⚠️  INTERVENTION NEEDED for ${reservation.reservation_id}`);
          console.log(`   Recommendation: ${result.recommendedIntervention.description}`);
          console.log(`   Est. Cost: €${result.recommendedIntervention.estimatedCost}`);
          console.log(`   Est. Value Saved: €${result.recommendedIntervention.estimatedValue}`);
        }

        console.log('=' .repeat(60));

      } catch (error) {
        console.error(`\n❌ Error scoring ${reservation.reservation_id}:`, error.message);
        errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SCORING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Reservations Scored: ${scored}`);
    console.log(`High Risk: ${highRisk}`);
    console.log(`Very High Risk: ${veryHighRisk}`);
    console.log(`Needs Intervention: ${highRisk + veryHighRisk}`);
    console.log(`Errors: ${errors}`);

    if (highRisk + veryHighRisk > 0) {
      const interventionRate = ((highRisk + veryHighRisk) / scored * 100).toFixed(1);
      console.log(`\n📊 Intervention Rate: ${interventionRate}%`);
      console.log(`💰 Potential Value at Risk: €${(highRisk + veryHighRisk) * 50}`);
      console.log(`💵 Estimated Intervention Cost: €${(highRisk + veryHighRisk) * 2.5}`);

      const potentialValue = (highRisk + veryHighRisk) * 50;
      const interventionCost = (highRisk + veryHighRisk) * 2.5;
      const roi = ((potentialValue - interventionCost) / interventionCost * 100).toFixed(0);
      console.log(`\n🎯 POTENTIAL ROI: ${roi}%`);
    }

    console.log('\n✅ Scoring complete!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  }
}

// Run the script
scoreAllReservations();
