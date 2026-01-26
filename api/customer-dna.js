/**
 * Customer DNA Profiling API
 *
 * Provides endpoints for deep behavioral analysis and profiling
 * Goes beyond LTV to understand WHO customers are and WHAT they prefer
 */

const { analyzeCustomerDNA, analyzeAllCustomersDNA, getCustomerDNAProfile } = require('./services/customerDNA');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-customer-email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access Customer DNA'
    });
  }
  req.user = authResult.user;

  // Check subscription status
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return; // Response already sent by middleware

  // Check feature access - advanced_analytics required for Customer DNA
  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return; // Response already sent by middleware

  const { action, customer_id } = req.query;

  try {
    switch (action) {
      case 'analyze': {
        // Analyze DNA for a specific customer
        if (!customer_id) {
          return res.status(400).json({
            success: false,
            error: 'customer_id is required'
          });
        }

        const result = await analyzeCustomerDNA(customer_id);

        return res.status(200).json({
          success: true,
          data: result,
          message: `DNA profile analyzed for customer ${customer_id}`
        });
      }

      case 'analyze-all': {
        // Batch analyze DNA for all customers
        const results = await analyzeAllCustomersDNA();

        return res.status(200).json({
          success: true,
          data: {
            total_analyzed: results.length,
            results: results
          },
          message: `Analyzed DNA for ${results.length} customers`
        });
      }

      case 'get': {
        // Get complete DNA profile for a customer
        if (!customer_id) {
          return res.status(400).json({
            success: false,
            error: 'customer_id is required'
          });
        }

        const profile = await getCustomerDNAProfile(customer_id);

        return res.status(200).json({
          success: true,
          data: profile,
          message: profile.profile
            ? `Retrieved DNA profile for customer ${customer_id}`
            : `No DNA profile found for customer ${customer_id}. Run analysis first.`
        });
      }

      case 'stats': {
        // Get DNA profiling statistics across all customers
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );

        // Get profile statistics
        const { data: profiles, error: profilesError } = await supabase
          .from('customer_behavioral_profiles')
          .select('*');

        if (profilesError) throw profilesError;

        // Calculate statistics
        const totalProfiles = profiles.length;
        const avgConfidence = profiles.reduce((sum, p) => sum + (p.profile_confidence || 0), 0) / totalProfiles || 0;

        // Dining style breakdown
        const diningStyles = profiles.reduce((acc, p) => {
          const style = p.dining_style || 'unknown';
          acc[style] = (acc[style] || 0) + 1;
          return acc;
        }, {});

        // Day type preferences
        const dayTypePreferences = profiles.reduce((acc, p) => {
          const dayType = p.preferred_day_type || 'unknown';
          acc[dayType] = (acc[dayType] || 0) + 1;
          return acc;
        }, {});

        // Time slot preferences
        const timeSlotPreferences = profiles.reduce((acc, p) => {
          const timeSlot = p.preferred_time_slot || 'unknown';
          acc[timeSlot] = (acc[timeSlot] || 0) + 1;
          return acc;
        }, {});

        // Spontaneity distribution
        const spontaneityRanges = {
          very_spontaneous: 0,    // 80-100
          spontaneous: 0,         // 60-79
          moderate: 0,            // 40-59
          planner: 0,             // 20-39
          advance_planner: 0      // 0-19
        };

        profiles.forEach(p => {
          const score = p.spontaneity_score || 0;
          if (score >= 80) spontaneityRanges.very_spontaneous++;
          else if (score >= 60) spontaneityRanges.spontaneous++;
          else if (score >= 40) spontaneityRanges.moderate++;
          else if (score >= 20) spontaneityRanges.planner++;
          else spontaneityRanges.advance_planner++;
        });

        // Get occasions count
        const { count: occasionsCount } = await supabase
          .from('customer_occasions')
          .select('*', { count: 'exact', head: true });

        // Get predictions count
        const { count: predictionsCount } = await supabase
          .from('customer_predictions')
          .select('*', { count: 'exact', head: true });

        return res.status(200).json({
          success: true,
          data: {
            total_profiles: totalProfiles,
            avg_confidence: Math.round(avgConfidence),
            dining_styles: diningStyles,
            day_type_preferences: dayTypePreferences,
            time_slot_preferences: timeSlotPreferences,
            spontaneity_distribution: spontaneityRanges,
            total_occasions_detected: occasionsCount || 0,
            total_predictions_made: predictionsCount || 0
          }
        });
      }

      case 'occasions': {
        // Get all detected occasions across customers
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );

        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const { data: occasions, error } = await supabase
          .from('customer_occasions')
          .select('*')
          .order('next_predicted_date', { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          data: {
            occasions: occasions || [],
            count: occasions?.length || 0
          }
        });
      }

      case 'predictions': {
        // Get predictions for a specific customer
        if (!customer_id) {
          return res.status(400).json({
            success: false,
            error: 'customer_id is required'
          });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );

        const { data: predictions, error } = await supabase
          .from('customer_predictions')
          .select('*')
          .eq('customer_id', customer_id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          data: {
            customer_id,
            predictions: predictions || []
          }
        });
      }

      case 'companions': {
        // Get companion network for a customer
        if (!customer_id) {
          return res.status(400).json({
            success: false,
            error: 'customer_id is required'
          });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );

        const { data: companions, error } = await supabase
          .from('customer_companions')
          .select('*')
          .eq('customer_id', customer_id)
          .order('times_dined_together', { ascending: false });

        if (error) throw error;

        return res.status(200).json({
          success: true,
          data: {
            customer_id,
            companions: companions || [],
            total_companions: companions?.length || 0
          }
        });
      }

      case 'search': {
        // Search customers by behavioral attributes
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );

        const {
          dining_style,
          preferred_day_type,
          min_confidence,
          brings_children
        } = req.query;

        let query = supabase
          .from('customer_behavioral_profiles')
          .select('*');

        // Apply filters
        if (dining_style) {
          query = query.eq('dining_style', dining_style);
        }

        if (preferred_day_type) {
          query = query.eq('preferred_day_type', preferred_day_type);
        }

        if (min_confidence) {
          query = query.gte('profile_confidence', parseInt(min_confidence));
        }

        if (brings_children !== undefined) {
          query = query.eq('brings_children', brings_children === 'true');
        }

        const { data: profiles, error } = await query.limit(100);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          data: {
            profiles: profiles || [],
            count: profiles?.length || 0,
            filters_applied: {
              dining_style,
              preferred_day_type,
              min_confidence,
              brings_children
            }
          }
        });
      }

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Available actions: analyze, analyze-all, get, stats, occasions, predictions, companions, search'
        });
    }

  } catch (error) {
    console.error('Customer DNA API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
