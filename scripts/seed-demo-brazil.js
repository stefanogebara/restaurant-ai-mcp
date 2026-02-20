/**
 * Seed Brazilian Demo Restaurant - "Boteco do Samba"
 *
 * Creates a demo restaurant in São Paulo with PT-BR config and sample data.
 * Uses supabaseAdmin (service role) to bypass RLS.
 *
 * Usage:
 *   node scripts/seed-demo-brazil.js
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RESTAURANT_NAME = 'Boteco do Samba';
const SLUG = 'boteco-do-samba';
const CITY = 'São Paulo';
const COUNTRY = 'Brazil';

async function seed() {
  console.log(`Seeding demo restaurant: ${RESTAURANT_NAME}`);

  // 1. Create restaurant_info
  const { data: infoData, error: infoError } = await supabase
    .schema('restaurant')
    .from('restaurant_info')
    .upsert({
      restaurant_name: RESTAURANT_NAME,
      phone: '+55 11 99999-0001',
      email: 'demo-br@seatable.io',
      address: `${CITY}, ${COUNTRY}`,
      timezone: 'America/Sao_Paulo',
      language: 'pt-BR',
      business_hours: [
        { day: 'Monday', is_open: false, open_time: '', close_time: '' },
        { day: 'Tuesday', is_open: true, open_time: '11:30', close_time: '23:00' },
        { day: 'Wednesday', is_open: true, open_time: '11:30', close_time: '23:00' },
        { day: 'Thursday', is_open: true, open_time: '11:30', close_time: '23:30' },
        { day: 'Friday', is_open: true, open_time: '11:30', close_time: '00:30' },
        { day: 'Saturday', is_open: true, open_time: '11:30', close_time: '00:30' },
        { day: 'Sunday', is_open: true, open_time: '12:00', close_time: '22:00' },
      ],
      avg_dining_duration_minutes: 90,
      metric_profile: {
        customer_email: 'demo-br@seatable.io',
        restaurant_type: 'traditional',
        city: CITY,
        country: COUNTRY,
        plan: 'Free',
        template: 'simple',
        website: '',
        cancellation_policy: 'Cancelamento gratuito até 2 horas antes da reserva',
        onboarding_completed_at: new Date().toISOString(),
      },
    }, { onConflict: 'restaurant_name' })
    .select()
    .single();

  if (infoError) {
    console.error('Error creating restaurant_info:', infoError);
    // Try insert instead of upsert
    const { data: insertData, error: insertError } = await supabase
      .schema('restaurant')
      .from('restaurant_info')
      .insert({
        restaurant_name: RESTAURANT_NAME,
        phone: '+55 11 99999-0001',
        email: 'demo-br@seatable.io',
        address: `${CITY}, ${COUNTRY}`,
        timezone: 'America/Sao_Paulo',
        language: 'pt-BR',
        business_hours: [
          { day: 'Monday', is_open: false, open_time: '', close_time: '' },
          { day: 'Tuesday', is_open: true, open_time: '11:30', close_time: '23:00' },
          { day: 'Wednesday', is_open: true, open_time: '11:30', close_time: '23:00' },
          { day: 'Thursday', is_open: true, open_time: '11:30', close_time: '23:30' },
          { day: 'Friday', is_open: true, open_time: '11:30', close_time: '00:30' },
          { day: 'Saturday', is_open: true, open_time: '11:30', close_time: '00:30' },
          { day: 'Sunday', is_open: true, open_time: '12:00', close_time: '22:00' },
        ],
        avg_dining_duration_minutes: 90,
        metric_profile: {
          customer_email: 'demo-br@seatable.io',
          restaurant_type: 'traditional',
          city: CITY,
          country: COUNTRY,
          plan: 'Free',
          template: 'simple',
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting restaurant_info:', insertError);
      process.exit(1);
    }
    console.log('Restaurant info created (insert):', insertData.id);
    return seedWithId(insertData.id);
  }

  console.log('Restaurant info created:', infoData.id);
  await seedWithId(infoData.id);
}

async function seedWithId(restaurantId) {
  // 2. Create tables
  const tables = [
    // Indoor (Salão)
    { restaurant_id: restaurantId, table_number: 1, capacity: 2, location: 'Salão', status: 'available', is_active: true, shape: 'round' },
    { restaurant_id: restaurantId, table_number: 2, capacity: 2, location: 'Salão', status: 'available', is_active: true, shape: 'round' },
    { restaurant_id: restaurantId, table_number: 3, capacity: 4, location: 'Salão', status: 'available', is_active: true, shape: 'square' },
    { restaurant_id: restaurantId, table_number: 4, capacity: 4, location: 'Salão', status: 'available', is_active: true, shape: 'square' },
    { restaurant_id: restaurantId, table_number: 5, capacity: 6, location: 'Salão', status: 'available', is_active: true, shape: 'square' },
    { restaurant_id: restaurantId, table_number: 6, capacity: 8, location: 'Salão', status: 'available', is_active: true, shape: 'square' },
    // Patio (Varanda)
    { restaurant_id: restaurantId, table_number: 7, capacity: 2, location: 'Varanda', status: 'available', is_active: true, shape: 'round' },
    { restaurant_id: restaurantId, table_number: 8, capacity: 4, location: 'Varanda', status: 'available', is_active: true, shape: 'round' },
    { restaurant_id: restaurantId, table_number: 9, capacity: 4, location: 'Varanda', status: 'available', is_active: true, shape: 'square' },
    { restaurant_id: restaurantId, table_number: 10, capacity: 6, location: 'Varanda', status: 'available', is_active: true, shape: 'square' },
  ];

  const { error: tablesError } = await supabase
    .from('tables')
    .insert(tables);

  if (tablesError) {
    console.error('Error creating tables:', tablesError);
  } else {
    console.log(`Created ${tables.length} tables`);
  }

  // 3. Create sample reservations
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const formatDate = (d) => d.toISOString().split('T')[0];

  const reservations = [
    {
      restaurant_id: restaurantId,
      customer_name: 'João Silva',
      customer_phone: '+55 11 98765-4321',
      customer_email: 'joao.silva@email.com',
      party_size: 4,
      reservation_date: formatDate(tomorrow),
      reservation_time: '19:30',
      reservation_datetime: `${formatDate(tomorrow)}T19:30:00-03:00`,
      status: 'confirmed',
      special_requests: 'Mesa perto da janela, por favor',
      source: 'whatsapp',
    },
    {
      restaurant_id: restaurantId,
      customer_name: 'Maria Santos',
      customer_phone: '+55 11 91234-5678',
      customer_email: 'maria.santos@email.com',
      party_size: 2,
      reservation_date: formatDate(tomorrow),
      reservation_time: '20:00',
      reservation_datetime: `${formatDate(tomorrow)}T20:00:00-03:00`,
      status: 'confirmed',
      source: 'whatsapp',
    },
    {
      restaurant_id: restaurantId,
      customer_name: 'Carlos Oliveira',
      customer_phone: '+55 11 99876-5432',
      customer_email: 'carlos.oliveira@email.com',
      party_size: 6,
      reservation_date: formatDate(dayAfter),
      reservation_time: '12:30',
      reservation_datetime: `${formatDate(dayAfter)}T12:30:00-03:00`,
      status: 'confirmed',
      special_requests: 'Aniversário - bolo surpresa',
      source: 'portal',
    },
    {
      restaurant_id: restaurantId,
      customer_name: 'Ana Costa',
      customer_phone: '+55 21 98765-1234',
      customer_email: 'ana.costa@email.com',
      party_size: 3,
      reservation_date: formatDate(dayAfter),
      reservation_time: '19:00',
      reservation_datetime: `${formatDate(dayAfter)}T19:00:00-03:00`,
      status: 'pending',
      source: 'whatsapp',
    },
  ];

  const { error: resError } = await supabase
    .from('reservations')
    .insert(reservations);

  if (resError) {
    console.error('Error creating reservations:', resError);
  } else {
    console.log(`Created ${reservations.length} sample reservations`);
  }

  // 4. Create free subscription
  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      restaurant_id: restaurantId,
      subscription_id: `free_${restaurantId}`,
      customer_id: `demo_br_${Date.now()}`,
      customer_email: 'demo-br@seatable.io',
      plan_name: 'Free',
      price_id: 'free',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date('2099-12-31').toISOString(),
    });

  if (subError) {
    console.error('Error creating subscription:', subError);
  } else {
    console.log('Free subscription created');
  }

  console.log(`\nDemo restaurant "${RESTAURANT_NAME}" seeded successfully!`);
  console.log(`Slug: ${SLUG}`);
  console.log(`Booking URL: /book/${SLUG}`);
}

seed().catch(console.error);
