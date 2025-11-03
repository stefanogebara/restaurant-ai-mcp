/**
 * ML Outcomes API
 *
 * Records actual reservation outcomes and calculates ROI for ML interventions.
 * Links predictions to real-world results for continuous model improvement.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'record-outcome':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use POST' });
        }
        return await handleRecordOutcome(req, res);

      case 'roi-summary':
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed. Use GET' });
        }
        return await handleROISummary(req, res);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          available_actions: {
            'record-outcome': 'POST /api/ml-outcomes?action=record-outcome',
            'roi-summary': 'GET /api/ml-outcomes?action=roi-summary'
          }
        });
    }
  } catch (error) {
    console.error('ML Outcomes API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Record reservation outcome
 * POST /api/ml-outcomes?action=record-outcome
 *
 * Body:
 * {
 *   reservation_id: "RES-20251101-1234",
 *   actual_outcome: "showed_up" | "no_show" | "cancelled",
 *   intervention_taken: true/false,
 *   intervention_type: "deposit" | "call" | "premium" | "none",
 *   intervention_cost: 2.50,
 *   notes: "Customer called to confirm"
 * }
 */
async function handleRecordOutcome(req, res) {
  try {
    const {
      reservation_id,
      actual_outcome,
      intervention_taken = false,
      intervention_type = 'none',
      intervention_cost = 0,
      notes = ''
    } = req.body;

    // Validate required fields
    if (!reservation_id || !actual_outcome) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: reservation_id and actual_outcome'
      });
    }

    // Validate outcome enum
    const validOutcomes = ['showed_up', 'no_show', 'cancelled'];
    if (!validOutcomes.includes(actual_outcome)) {
      return res.status(400).json({
        success: false,
        error: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}`
      });
    }

    console.log(`\n📊 Recording outcome for ${reservation_id}: ${actual_outcome}`);

    // 1. Fetch reservation with ML prediction
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('reservation_id', reservation_id)
      .single();

    if (fetchError) {
      console.error('Error fetching reservation:', fetchError);
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }

    // Check if reservation has ML risk score
    if (!reservation.ml_risk_score) {
      return res.status(400).json({
        success: false,
        error: 'Reservation does not have ML risk score. Run scoring first.'
      });
    }

    // 2. Calculate value saved based on outcome
    let value_saved = 0;
    const avg_revenue_per_party = 50; // €50 average revenue

    if (actual_outcome === 'showed_up' && intervention_taken) {
      // Intervention helped prevent no-show (we assume)
      value_saved = avg_revenue_per_party;
    } else if (actual_outcome === 'no_show' && intervention_taken) {
      // Intervention failed to prevent no-show
      value_saved = 0;
    } else if (actual_outcome === 'no_show' && !intervention_taken) {
      // Missed opportunity: didn't intervene and they no-showed
      // Track as 0 saved (lost revenue, not "saved" value)
      value_saved = 0;
    } else if (actual_outcome === 'showed_up' && !intervention_taken) {
      // Low risk customer showed up, no intervention needed
      value_saved = 0;
    }

    const roi_multiplier = intervention_cost > 0
      ? ((value_saved - intervention_cost) / intervention_cost) * 100
      : 0;

    console.log(`💰 Value Saved: €${value_saved}`);
    console.log(`💵 Intervention Cost: €${intervention_cost}`);
    console.log(`📈 ROI: ${roi_multiplier.toFixed(0)}%`);

    // 3. Create ml_interventions record
    const interventionRecord = {
      reservation_id,
      ml_risk_score: reservation.ml_risk_score,
      ml_risk_level: reservation.ml_risk_level,
      intervention_type,
      action_taken: intervention_taken,
      action_timestamp: intervention_taken ? new Date().toISOString() : null,
      actual_outcome,
      outcome_timestamp: new Date().toISOString(),
      cost_of_intervention: intervention_cost,
      value_saved,
      notes
    };

    const { data: interventionData, error: interventionError } = await supabase
      .from('ml_interventions')
      .insert(interventionRecord)
      .select()
      .single();

    if (interventionError) {
      console.error('Error creating intervention record:', interventionError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create intervention record',
        details: interventionError.message
      });
    }

    console.log(`✅ Created intervention record: ${interventionData.intervention_id}`);

    // 4. Update customer_history
    await updateCustomerHistory(
      reservation.customer_phone,
      actual_outcome,
      reservation.party_size
    );

    // 5. Return success response
    return res.json({
      success: true,
      data: {
        intervention_id: interventionData.intervention_id,
        reservation_id,
        actual_outcome,
        value_saved,
        intervention_cost,
        roi_multiplier: `${roi_multiplier.toFixed(0)}%`,
        ml_risk_score: reservation.ml_risk_score,
        ml_risk_level: reservation.ml_risk_level
      },
      message: `Outcome recorded successfully. ROI: ${roi_multiplier.toFixed(0)}%`
    });

  } catch (error) {
    console.error('Error recording outcome:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Get ROI summary across all interventions
 * GET /api/ml-outcomes?action=roi-summary
 */
async function handleROISummary(req, res) {
  try {
    // Fetch all intervention records
    const { data: interventions, error } = await supabase
      .from('ml_interventions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Calculate aggregate metrics
    const totalInterventions = interventions.length;
    const totalCost = interventions.reduce((sum, i) => sum + (i.cost_of_intervention || 0), 0);
    const totalValue = interventions.reduce((sum, i) => sum + (i.value_saved || 0), 0);
    const totalROI = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    // Group by outcome
    const byOutcome = {
      showed_up: interventions.filter(i => i.actual_outcome === 'showed_up').length,
      no_show: interventions.filter(i => i.actual_outcome === 'no_show').length,
      cancelled: interventions.filter(i => i.actual_outcome === 'cancelled').length
    };

    // Group by risk level
    const byRiskLevel = {
      'very-high': interventions.filter(i => i.ml_risk_level === 'very-high').length,
      'high': interventions.filter(i => i.ml_risk_level === 'high').length,
      'medium': interventions.filter(i => i.ml_risk_level === 'medium').length,
      'low': interventions.filter(i => i.ml_risk_level === 'low').length
    };

    // Calculate intervention effectiveness
    const interventionsWithAction = interventions.filter(i => i.action_taken);
    const successfulInterventions = interventionsWithAction.filter(
      i => i.actual_outcome === 'showed_up'
    ).length;
    const interventionSuccessRate = interventionsWithAction.length > 0
      ? (successfulInterventions / interventionsWithAction.length) * 100
      : 0;

    return res.json({
      success: true,
      data: {
        summary: {
          total_interventions: totalInterventions,
          total_cost: totalCost.toFixed(2),
          total_value_saved: totalValue.toFixed(2),
          total_roi: `${totalROI.toFixed(0)}%`,
          target_roi: '300-500%',
          meets_target: totalROI >= 300
        },
        outcomes: byOutcome,
        risk_levels: byRiskLevel,
        intervention_effectiveness: {
          interventions_with_action: interventionsWithAction.length,
          successful_interventions: successfulInterventions,
          success_rate: `${interventionSuccessRate.toFixed(1)}%`
        },
        recent_interventions: interventions.slice(0, 10).map(i => {
          const roi = i.cost_of_intervention > 0
            ? ((i.value_saved - i.cost_of_intervention) / i.cost_of_intervention * 100).toFixed(0)
            : '0';
          return {
            intervention_id: i.intervention_id,
            reservation_id: i.reservation_id,
            outcome: i.actual_outcome,
            risk_level: i.ml_risk_level,
            value_saved: i.value_saved,
            roi: `${roi}%`,
            created_at: i.created_at
          };
        })
      }
    });

  } catch (error) {
    console.error('Error fetching ROI summary:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch ROI summary',
      details: error.message
    });
  }
}

/**
 * Update customer history with outcome
 * @param {string} customerPhone
 * @param {string} outcome
 * @param {number} partySize
 */
async function updateCustomerHistory(customerPhone, outcome, partySize) {
  try {
    // Check if customer exists
    const { data: existing, error: fetchError } = await supabase
      .from('customer_history')
      .select('*')
      .eq('customer_phone', customerPhone)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching customer history:', fetchError);
      return;
    }

    if (!existing) {
      // Create new customer history
      const { error: insertError } = await supabase
        .from('customer_history')
        .insert({
          customer_phone: customerPhone,
          total_visits: outcome === 'showed_up' ? 1 : 0,
          total_no_shows: outcome === 'no_show' ? 1 : 0,
          total_cancellations: outcome === 'cancelled' ? 1 : 0,
          average_party_size: partySize,
          last_visit_date: outcome === 'showed_up' ? new Date().toISOString() : null
        });

      if (insertError) {
        console.error('Error creating customer history:', insertError);
      } else {
        console.log(`✅ Created customer history for ${customerPhone}`);
      }
    } else {
      // Update existing customer history
      const updates = {
        total_visits: existing.total_visits + (outcome === 'showed_up' ? 1 : 0),
        total_no_shows: existing.total_no_shows + (outcome === 'no_show' ? 1 : 0),
        total_cancellations: existing.total_cancellations + (outcome === 'cancelled' ? 1 : 0),
        average_party_size: Math.round(
          (existing.average_party_size * existing.total_visits + partySize) /
          (existing.total_visits + 1)
        )
      };

      if (outcome === 'showed_up') {
        updates.last_visit_date = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('customer_history')
        .update(updates)
        .eq('customer_phone', customerPhone);

      if (updateError) {
        console.error('Error updating customer history:', updateError);
      } else {
        console.log(`✅ Updated customer history for ${customerPhone}`);
      }
    }
  } catch (error) {
    console.error('Exception in updateCustomerHistory:', error);
  }
}
