/**
 * Restaurant Settings API
 * Handles restaurant-specific settings including language preferences
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ALLOWED_LANGUAGES = ['en', 'es', 'pt', 'fr', 'it'];

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { method } = req;
    const restaurantId = req.headers['x-restaurant-id'] || req.query.restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID is required',
      });
    }

    if (method === 'GET') {
      // Get restaurant settings
      const { data: restaurant, error } = await supabase
        .from('restaurant_info')
        .select('language, restaurant_name, city, country')
        .eq('id', restaurantId)
        .single();

      if (error) {
        console.error('Error fetching restaurant settings:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch restaurant settings',
        });
      }

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Restaurant not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          language: restaurant.language || 'en',
          restaurant_name: restaurant.restaurant_name,
          city: restaurant.city,
          country: restaurant.country,
        },
      });
    }

    if (method === 'PUT') {
      // Update restaurant settings
      const { language, ...otherSettings } = req.body;

      // Validate language if provided
      if (language && !ALLOWED_LANGUAGES.includes(language)) {
        return res.status(400).json({
          success: false,
          error: `Invalid language. Allowed values: ${ALLOWED_LANGUAGES.join(', ')}`,
        });
      }

      const updates = {};
      if (language) updates.language = language;
      Object.assign(updates, otherSettings);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No updates provided',
        });
      }

      const { data, error } = await supabase
        .from('restaurant_info')
        .update(updates)
        .eq('id', restaurantId)
        .select('language, restaurant_name')
        .single();

      if (error) {
        console.error('Error updating restaurant settings:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to update restaurant settings',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          language: data.language,
          restaurant_name: data.restaurant_name,
        },
      });
    }

    // Method not allowed
    return res.status(405).json({
      success: false,
      error: `Method ${method} not allowed`,
    });
  } catch (error) {
    console.error('Restaurant settings API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}
