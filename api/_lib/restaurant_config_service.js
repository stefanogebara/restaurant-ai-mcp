/**
 * Restaurant Configuration Service
 *
 * Service layer for interacting with restaurant_config table
 * Optimized for AI phone agent runtime queries
 */

import { createClient } from '@supabase/supabase-js';

class RestaurantConfigService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // Service role for backend
    );
  }

  /**
   * PRIMARY METHOD: Get complete AI agent context
   * Use this for call handling - returns everything in one query
   */
  async getAIAgentContext(userId) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) throw new Error(`Failed to fetch config: ${error.message}`);

    // Enrich with computed values
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const todayHours = data.business_hours[today];

    return {
      ...data,
      today: {
        day: today,
        is_open: todayHours.is_open,
        open_time: todayHours.open_time,
        close_time: todayHours.close_time,
        is_currently_open: this.isCurrentlyOpen(todayHours)
      },
      total_tables: this.getTotalTableCount(data.table_configuration),
      total_capacity: this.getTotalCapacity(data.table_configuration)
    };
  }

  /**
   * Get config by phone number (for incoming calls)
   */
  async getConfigByPhone(phoneNumber) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('*')
      .eq('phone', phoneNumber)
      .eq('is_active', true)
      .single();

    if (error) throw new Error(`No restaurant found for phone: ${phoneNumber}`);
    return data;
  }

  /**
   * Check if restaurant is open RIGHT NOW
   */
  async isOpenNow(userId) {
    const config = await this.getAIAgentContext(userId);
    return config.today.is_currently_open;
  }

  /**
   * Get business hours for specific day
   */
  async getHoursForDay(userId, dayName) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('business_hours')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data.business_hours[dayName.toLowerCase()];
  }

  /**
   * Get full week schedule (formatted for AI response)
   */
  async getWeekSchedule(userId) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('business_hours')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return days.map(day => ({
      day: day.charAt(0).toUpperCase() + day.slice(1),
      ...data.business_hours[day]
    }));
  }

  /**
   * Find available tables for party size
   */
  async getTablesForPartySize(userId, partySize) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('table_configuration')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const availableTables = [];
    data.table_configuration.forEach(area => {
      area.tables.forEach(table => {
        if (table.capacity >= partySize) {
          availableTables.push({
            area: area.area_name,
            table_number: table.table_number,
            capacity: table.capacity
          });
        }
      });
    });

    // Sort by capacity (smallest suitable table first)
    return availableTables.sort((a, b) => a.capacity - b.capacity);
  }

  /**
   * Get table layout summary
   */
  async getTableSummary(userId) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('table_configuration')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return data.table_configuration.map(area => ({
      area: area.area_name,
      table_count: area.tables.length,
      total_capacity: area.tables.reduce((sum, t) => sum + t.capacity, 0),
      tables: area.tables
    }));
  }

  /**
   * Get reservation policies
   */
  async getReservationPolicies(userId) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('reservation_settings, average_dining_duration_minutes')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return {
      ...data.reservation_settings,
      average_dining_duration: data.average_dining_duration_minutes,
      total_slot_duration:
        data.average_dining_duration_minutes +
        (data.reservation_settings.buffer_time_minutes || 0)
    };
  }

  /**
   * Validate party size
   */
  async isPartySizeAllowed(userId, partySize) {
    const policies = await this.getReservationPolicies(userId);
    return partySize >= policies.min_party_size && partySize <= policies.max_party_size;
  }

  /**
   * Get AI voice configuration
   */
  async getVoiceConfig(userId) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('voice_id, ai_config')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return {
      voice_id: data.voice_id,
      greeting: data.ai_config.greeting_message,
      farewell: data.ai_config.farewell_message,
      language: data.ai_config.language,
      max_duration: data.ai_config.max_call_duration_minutes,
      transfer_phone: data.ai_config.transfer_phone
    };
  }

  /**
   * Get active team members
   */
  async getTeamMembers(userId) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('team_members')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return data.team_members.filter(member => member.status === 'active');
  }

  /**
   * Check if email is authorized
   */
  async isAuthorizedEmail(userId, email) {
    const members = await this.getTeamMembers(userId);
    return members.some(member => member.email === email);
  }

  // ========================================
  // UPDATE METHODS
  // ========================================

  /**
   * Update business hours for specific day
   */
  async updateDayHours(userId, day, hours) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('business_hours')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const updated = {
      ...data.business_hours,
      [day.toLowerCase()]: hours
    };

    const { error: updateError } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .update({ business_hours: updated })
      .eq('user_id', userId);

    if (updateError) throw updateError;
    return updated;
  }

  /**
   * Update reservation settings
   */
  async updateReservationSettings(userId, settings) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('reservation_settings')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const updated = {
      ...data.reservation_settings,
      ...settings
    };

    const { error: updateError } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .update({ reservation_settings: updated })
      .eq('user_id', userId);

    if (updateError) throw updateError;
    return updated;
  }

  /**
   * Add team member
   */
  async addTeamMember(userId, member) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('team_members')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const updated = [...data.team_members, member];

    const { error: updateError } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .update({ team_members: updated })
      .eq('user_id', userId);

    if (updateError) throw updateError;
    return updated;
  }

  /**
   * Update AI configuration
   */
  async updateAIConfig(userId, aiSettings) {
    const { data, error } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('ai_config')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const updated = {
      ...data.ai_config,
      ...aiSettings
    };

    const { error: updateError } = await this.supabase
      .schema('restaurant')
      .from('restaurant_config')
      .update({ ai_config: updated })
      .eq('user_id', userId);

    if (updateError) throw updateError;
    return updated;
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Check if currently within operating hours
   */
  isCurrentlyOpen(todayHours) {
    if (!todayHours.is_open) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    const [openHour, openMin] = todayHours.open_time.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close_time.split(':').map(Number);

    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    return currentTime >= openTime && currentTime <= closeTime;
  }

  /**
   * Get total table count across all areas
   */
  getTotalTableCount(tableConfig) {
    return tableConfig.reduce((total, area) => total + area.tables.length, 0);
  }

  /**
   * Get total seating capacity
   */
  getTotalCapacity(tableConfig) {
    return tableConfig.reduce((total, area) => {
      return total + area.tables.reduce((sum, table) => sum + table.capacity, 0);
    }, 0);
  }
}

// ========================================
// USAGE EXAMPLES
// ========================================

/*
// Initialize service
const configService = new RestaurantConfigService();

// AI agent gets full context for call
const context = await configService.getAIAgentContext(userId);
console.log(`Welcome to ${context.restaurant_name}!`);
console.log(`We are ${context.today.is_currently_open ? 'open' : 'closed'} today.`);

// Check if open now
const isOpen = await configService.isOpenNow(userId);

// Find tables for party of 4
const tables = await configService.getTablesForPartySize(userId, 4);
console.log(`Available tables for 4:`, tables);

// Get week schedule
const schedule = await configService.getWeekSchedule(userId);
console.log('Our hours:', schedule);

// Get voice config for AI
const voice = await configService.getVoiceConfig(userId);
console.log('AI greeting:', voice.greeting);

// Update business hours
await configService.updateDayHours(userId, 'monday', {
  is_open: false,
  open_time: null,
  close_time: null
});
*/

export default RestaurantConfigService;
