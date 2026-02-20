/**
 * Service Record Database Operations
 *
 * All service record CRUD functions for active dining sessions.
 * Multi-tenant: every query is scoped by restaurant_id.
 */

const { supabase, handleSupabaseResponse, logger } = require('./db-clients');

// ============ SERVICE RECORDS ============

const getServiceRecords = async (restaurantId, filter = {}) => {
  let query = supabase.from('service_records').select('*')
    .eq('restaurant_id', restaurantId);

  if (filter.status) {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query.order('seated_at', { ascending: false });

  if (error) return handleSupabaseResponse(null, error, 'GET service records');

  return {
    success: true,
    data: {
      records: data.map(s => ({
        id: s.id,
        fields: {
          'Service ID': s.service_id,
          'Reservation ID': s.reservation_id,
          'Customer Name': s.customer_name,
          'Customer Phone': s.customer_phone,
          'Party Size': s.party_size,
          'Table IDs': s.table_ids,
          'Seated At': s.seated_at,
          'Estimated Departure': s.estimated_departure,
          'Actual Departure': s.actual_departure,
          'Special Requests': s.special_requests,
          'Status': s.status
        }
      }))
    }
  };
};

const getActiveServiceRecords = async (restaurantId) => {
  const { data, error } = await supabase
    .from('service_records')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active');

  if (error) return handleSupabaseResponse(null, error, 'GET active service records');

  const service_records = data.map(r => ({
    service_id: r.service_id,
    reservation_id: r.reservation_id || '',
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    party_size: r.party_size,
    table_ids: r.table_ids || [],
    seated_at: r.seated_at,
    estimated_departure: r.estimated_departure,
    special_requests: r.special_requests || '',
    status: r.status,
    record_id: r.id
  }));

  return {
    success: true,
    service_records
  };
};

const createServiceRecord = async (restaurantId, fields) => {
  const { data, error } = await supabase
    .from('service_records')
    .insert({
      restaurant_id: restaurantId,
      service_id: fields['Service ID'],
      reservation_id: fields['Reservation ID'] || null,
      customer_name: fields['Customer Name'],
      customer_phone: fields['Customer Phone'],
      party_size: fields['Party Size'],
      table_ids: fields['Table IDs'],
      seated_at: fields['Seated At'] || new Date().toISOString(),
      estimated_departure: fields['Estimated Departure'],
      special_requests: fields['Special Requests'],
      status: 'active'
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE service record');

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Service ID': data.service_id,
        'Customer Name': data.customer_name,
        'Status': data.status
      }
    }
  };
};

const updateServiceRecord = async (restaurantId, serviceId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Actual Departure']) updates.actual_departure = fields['Actual Departure'];

  logger.info(`[updateServiceRecord] Updating service ${serviceId} with:`, updates);

  const { data, error } = await supabase
    .from('service_records')
    .update(updates)
    .eq('restaurant_id', restaurantId)
    .eq('service_id', serviceId)
    .select()
    .single();

  if (error) {
    logger.error(`[updateServiceRecord] Error updating service ${serviceId}:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE service record');
  }

  logger.info(`[updateServiceRecord] Success for ${serviceId}:`, data);

  return {
    success: true,
    service_record: {
      service_id: data.service_id,
      table_ids: data.table_ids || [],
      status: data.status
    }
  };
};

const completeServiceRecord = async (restaurantId, serviceId) => {
  return updateServiceRecord(restaurantId, serviceId, {
    'Status': 'completed',
    'Actual Departure': new Date().toISOString()
  });
};

const deleteServiceRecord = async (restaurantId, serviceId) => {
  const { data, error } = await supabase
    .from('service_records')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('service_id', serviceId)
    .select();

  if (error) return handleSupabaseResponse(null, error, 'DELETE service record');

  return {
    success: true,
    message: `Service record ${serviceId} deleted`,
    deleted_count: data ? data.length : 0
  };
};

module.exports = {
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,
  deleteServiceRecord,
};
