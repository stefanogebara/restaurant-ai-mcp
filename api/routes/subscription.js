/**
 * Subscription API Routes
 * Handles fetching user subscription information for plan-based access control
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * GET /api/subscription
 * Get the current user's subscription information
 */
router.get('/', async (req, res) => {
  try {
    // For now, we'll use the customer_email from auth or req.user
    // In a real app, you'd get this from the authenticated user session
    const customerEmail = req.user?.email || req.query.email;

    if (!customerEmail) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Customer email is required'
      });
    }

    // Fetch the subscription from Supabase
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('customer_email', customerEmail)
      .eq('status', 'active')
      .or('status.eq.trialing')
      .single();

    if (error) {
      // No subscription found - return basic plan
      if (error.code === 'PGRST116') {
        return res.json({
          plan_name: 'basic',
          status: 'active',
          message: 'No subscription found - using basic plan'
        });
      }

      throw error;
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription',
      details: error.message
    });
  }
});

/**
 * POST /api/subscription/test
 * Create a test subscription (for development/testing only)
 */
router.post('/test', async (req, res) => {
  try {
    const { email, plan_name } = req.body;

    if (!email || !plan_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'email and plan_name are required'
      });
    }

    // Check if subscription already exists
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('customer_email', email)
      .single();

    if (existing) {
      // Update existing subscription
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          plan_name,
          status: 'active',
          current_period_start: new Date().toISOString().split('T')[0],
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        })
        .eq('customer_email', email)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        message: 'Test subscription updated',
        subscription: data
      });
    }

    // Create new test subscription
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        subscription_id: `test_sub_${Date.now()}`,
        customer_id: `test_cus_${Date.now()}`,
        customer_email: email,
        plan_name,
        status: 'active',
        current_period_start: new Date().toISOString().split('T')[0],
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Test subscription created',
      subscription: data
    });
  } catch (error) {
    console.error('Error creating test subscription:', error);
    res.status(500).json({
      error: 'Failed to create test subscription',
      details: error.message
    });
  }
});

export default router;
