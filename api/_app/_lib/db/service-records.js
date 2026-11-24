/**
 * Service record (active party) operations
 * Extracted from supabase.js
 */

const { supabase, handleSupabaseResponse, logger } = require('./clients');
const { generateSecureServiceId } = require('../secure-id');

// ============ SERVICE RECORDS ============

const getServiceRecords = async (restaurantId, filter = {}) => {
  let query = supabase.from('service_records').select('id, service_id, reservation_id, customer_name, customer_phone, party_size, table_ids, seated_at, estimated_departure, actual_departure, special_requests, status')
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
        service_id: s.service_id,
        reservation_id: s.reservation_id,
        customer_name: s.customer_name,
        customer_phone: s.customer_phone,
        party_size: s.party_size,
        table_ids: s.table_ids,
        seated_at: s.seated_at,
        estimated_departure: s.estimated_departure,
        actual_departure: s.actual_departure,
        special_requests: s.special_requests,
        status: s.status
      }))
    }
  };
};

const getActiveServiceRecords = async (restaurantId) => {
  const { data, error } = await supabase
    .from('service_records')
    .select('id, service_id, reservation_id, customer_name, customer_phone, party_size, table_ids, seated_at, estimated_departure, special_requests, status')
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
      service_id: fields.service_id,
      reservation_id: fields.reservation_id || null,
      customer_name: fields.customer_name,
      customer_phone: fields.customer_phone,
      party_size: fields.party_size,
      table_ids: fields.table_ids,
      seated_at: fields.seated_at || new Date().toISOString(),
      estimated_departure: fields.estimated_departure,
      special_requests: fields.special_requests,
      status: 'active'
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE service record');

  return {
    success: true,
    data: {
      id: data.id,
      service_id: data.service_id,
      customer_name: data.customer_name,
      status: data.status
    }
  };
};

const updateServiceRecord = async (restaurantId, serviceId, fields) => {
  const updates = {};

  if (fields.status) updates.status = fields.status;
  if (fields.actual_departure) updates.actual_departure = fields.actual_departure;
  if (fields.total_bill !== undefined) updates.total_bill = fields.total_bill;

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
    status: 'completed',
    actual_departure: new Date().toISOString()
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

// Use cryptographically secure ID generators from secure-id.js
const generateServiceId = generateSecureServiceId;

module.exports = {
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,
  deleteServiceRecord,
  generateServiceId,
};
