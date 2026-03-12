/**
 * ML Outcomes API
 *
 * Records actual reservation outcomes and calculates ROI for ML interventions.
 * Links predictions to real-world results for continuous model improvement.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('MLOutcomes');

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  req.user = auth.user;

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

      case 'mark-action-taken':
        if (req.method !== 'PATCH' && req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use PATCH or POST' });
        }
        return await handleMarkActionTaken(req, res);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          available_actions: {
            'record-outcome': 'POST /api/ml-outcomes?action=record-outcome',
            'roi-summary': 'GET /api/ml-outcomes?action=roi-summary',
            'mark-action-taken': 'PATCH /api/ml-outcomes?action=mark-action-taken'
          }
        });
    }
  } catch (error) {
    logger.error('ML Outcomes API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
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

    logger.info(`\n📊 Recording outcome for ${reservation_id}: ${actual_outcome}`);

    // 1. Fetch reservation with ML prediction
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('reservation_id', reservation_id)
      .single();

    if (fetchError) {
      logger.error('Error fetching reservation:', fetchError);
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
    // Use actual average cover from service_records; fall back to €50 if no data yet
    let avg_revenue_per_party = 50;
    const restaurantId = reservation.restaurant_id || req.user?.restaurant_id;
    if (restaurantId) {
      const { data: revenueData } = await supabaseAdmin
        .from('service_records')
        .select('total_bill')
        .eq('restaurant_id', restaurantId)
        .not('total_bill', 'is', null)
        .gt('total_bill', 0)
        .limit(200);
      if (revenueData && revenueData.length > 0) {
        const totalBill = revenueData.reduce((sum, r) => sum + (r.total_bill || 0), 0);
        avg_revenue_per_party = Math.round(totalBill / revenueData.length);
        logger.info(`📊 Using actual avg cover €${avg_revenue_per_party} (from ${revenueData.length} service records)`);
      } else {
        logger.info('📊 No service_records data yet, using fallback €50 avg cover');
      }
    }
    let value_saved = 0;

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

    logger.info(`💰 Value Saved: €${value_saved}`);
    logger.info(`💵 Intervention Cost: €${intervention_cost}`);
    logger.info(`📈 ROI: ${roi_multiplier.toFixed(0)}%`);

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

    const { data: interventionData, error: interventionError } = await supabaseAdmin
      .from('ml_interventions')
      .insert(interventionRecord)
      .select()
      .single();

    if (interventionError) {
      logger.error('Error creating intervention record:', interventionError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create intervention record',
        details: 'Database operation failed'
      });
    }

    logger.info(`✅ Created intervention record: ${interventionData.intervention_id}`);

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
    logger.error('Error recording outcome:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
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
    const { data: interventions, error } = await supabaseAdmin
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
    logger.error('Error fetching ROI summary:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch ROI summary'
    });
  }
}

/**
 * Mark that an action was taken (e.g., confirmation call made)
 * PATCH /api/ml-outcomes?action=mark-action-taken
 *
 * Body:
 * {
 *   reservation_id: "RES-20251101-1234",
 *   intervention_type: "phone_call" | "sms_reminder" | "email_reminder" | "whatsapp_reminder" | "deposit_required",
 *   staff_name: "Carlos" (optional),
 *   notes: "Called customer to confirm reservation, will arrive 10 min late"
 * }
 */
async function handleMarkActionTaken(req, res) {
  try {
    const {
      reservation_id,
      intervention_type = 'phone_call',
      staff_name = '',
      notes = ''
    } = req.body;

    // Validate required fields
    if (!reservation_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: reservation_id'
      });
    }

    // Validate intervention_type
    const validTypes = [
      'phone_call',
      'sms_reminder',
      'email_reminder',
      'whatsapp_reminder',
      'deposit_required',
      'confirmation_call', // Legacy support
      'automatic_reminder',
      'other'
    ];

    // Map legacy types
    let normalizedType = intervention_type;
    if (intervention_type === 'confirmation_call') {
      normalizedType = 'phone_call';
    }

    if (!validTypes.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid intervention_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    logger.info(`\n📞 Marking action taken for ${reservation_id}: ${normalizedType}`);
    if (staff_name) {
      logger.info(`   Staff: ${staff_name}`);
    }

    // Fetch reservation to verify it exists and get ML data
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('reservation_id', reservation_id)
      .single();

    if (fetchError) {
      logger.error('Error fetching reservation:', fetchError);
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }

    const timestamp = new Date().toISOString();

    // Update reservation to mark that intervention was taken
    const { error: updateError } = await supabaseAdmin
      .from('reservations')
      .update({
        intervention_taken: true,
        intervention_type: normalizedType,
        intervention_notes: notes,
        intervention_timestamp: timestamp,
        intervention_by: staff_name || null
      })
      .eq('reservation_id', reservation_id);

    if (updateError) {
      logger.error('Error updating reservation:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update reservation',
        details: 'Database operation failed'
      });
    }

    // Also update ml_interventions table if there's a matching record
    const { data: existingIntervention } = await supabaseAdmin
      .from('ml_interventions')
      .select('intervention_id')
      .eq('reservation_id', reservation_id)
      .eq('action_taken', false)
      .single();

    if (existingIntervention) {
      await supabaseAdmin
        .from('ml_interventions')
        .update({
          action_taken: true,
          action_timestamp: timestamp,
          intervention_type: normalizedType,
          notes: notes
        })
        .eq('intervention_id', existingIntervention.intervention_id);

      logger.info(`✅ Updated ml_intervention ${existingIntervention.intervention_id}`);
    }

    logger.info(`✅ Marked action taken for ${reservation_id}`);

    return res.json({
      success: true,
      data: {
        reservation_id,
        intervention_type: normalizedType,
        staff_name: staff_name || null,
        notes,
        timestamp,
        ml_risk_level: reservation.ml_risk_level,
        ml_risk_score: reservation.ml_risk_score
      },
      message: `Action "${normalizedType}" marked for reservation ${reservation_id}`
    });

  } catch (error) {
    logger.error('Error marking action taken:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
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
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('customer_history')
      .select('*')
      .eq('customer_phone', customerPhone)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      logger.error('Error fetching customer history:', fetchError);
      return;
    }

    if (!existing) {
      // Create new customer history
      const { error: insertError } = await supabaseAdmin
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
        logger.error('Error creating customer history:', insertError);
      } else {
        logger.info(`✅ Created customer history for ${customerPhone}`);
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

      const { error: updateError } = await supabaseAdmin
        .from('customer_history')
        .update(updates)
        .eq('customer_phone', customerPhone);

      if (updateError) {
        logger.error('Error updating customer history:', updateError);
      } else {
        logger.info(`✅ Updated customer history for ${customerPhone}`);
      }
    }
  } catch (error) {
    logger.error('Exception in updateCustomerHistory:', error);
  }
}
