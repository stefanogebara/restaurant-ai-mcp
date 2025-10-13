/**
 * Seed Sample Data via Deployed API
 *
 * Uses the live Vercel deployment to add sample data
 */

const axios = require('axios');

const API_BASE = 'https://restaurant-ai-mcp.vercel.app/api';

async function addTable(tableNumber, capacity, location) {
  try {
    // We'll need to add a create-table endpoint, or use Airtable API directly
    console.log(`✅ Table ${tableNumber} (${capacity} seats, ${location})`);
    return { tableNumber, capacity, location };
  } catch (error) {
    console.error(`❌ Failed to add table ${tableNumber}:`, error.message);
  }
}

async function addReservation(data) {
  try {
    const response = await axios.get(`${API_BASE}/reservations`, {
      params: {
        action: 'create',
        ...data
      }
    });

    if (response.data.success) {
      console.log(`✅ Reservation for ${data.customer_name} - ${response.data.reservation_id}`);
      return response.data;
    } else {
      console.error(`❌ Failed: ${response.data.message}`);
    }
  } catch (error) {
    console.error(`❌ Failed to add reservation for ${data.customer_name}:`, error.response?.data?.message || error.message);
  }
}

async function main() {
  console.log('🌱 Seeding data via API...\n');
  console.log('📊 Note: Tables must be added directly in Airtable (no create endpoint yet)');
  console.log('📍 Please add these tables manually:\n');

  const tables = [
    { number: '1', capacity: 2, location: 'Indoor' },
    { number: '2', capacity: 2, location: 'Indoor' },
    { number: '3', capacity: 4, location: 'Indoor' },
    { number: '4', capacity: 4, location: 'Indoor' },
    { number: '5', capacity: 6, location: 'Indoor' },
    { number: '6', capacity: 8, location: 'Indoor' },
    { number: '7', capacity: 2, location: 'Patio' },
    { number: '8', capacity: 2, location: 'Patio' },
    { number: '9', capacity: 4, location: 'Patio' },
    { number: '10', capacity: 4, location: 'Patio' },
    { number: '11', capacity: 2, location: 'Bar' },
    { number: '12', capacity: 2, location: 'Bar' },
  ];

  console.log('Copy/paste this into Airtable:');
  console.log('Table Number | Capacity | Location | Status    | Is Active');
  console.log('-------------|----------|----------|-----------|----------');
  tables.forEach(t => {
    console.log(`${t.number.padEnd(12)} | ${t.capacity.toString().padEnd(8)} | ${t.location.padEnd(8)} | Available | ☑`);
  });

  console.log('\n📅 Creating reservations via API...\n');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const futureTime = new Date(today.getTime() + 30 * 60000);
  const futureHour = futureTime.getHours().toString().padStart(2, '0');
  const futureMinute = futureTime.getMinutes().toString().padStart(2, '0');

  const reservations = [
    {
      date: todayStr,
      time: `${futureHour}:${futureMinute}`,
      party_size: 4,
      customer_name: 'John Smith',
      customer_phone: '+1234567890',
      customer_email: 'john@example.com',
      special_requests: 'Window seat please'
    },
    {
      date: todayStr,
      time: `${(parseInt(futureHour) + 1).toString().padStart(2, '0')}:00`,
      party_size: 2,
      customer_name: 'Maria Garcia',
      customer_phone: '+1234567891',
      customer_email: 'maria@example.com',
      special_requests: 'Birthday celebration - dessert surprise'
    },
    {
      date: todayStr,
      time: `${(parseInt(futureHour) + 1).toString().padStart(2, '0')}:30`,
      party_size: 6,
      customer_name: 'David Chen',
      customer_phone: '+1234567892',
      customer_email: 'david@example.com',
      special_requests: 'Vegetarian options needed'
    }
  ];

  for (const res of reservations) {
    await addReservation(res);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between requests
  }

  console.log('\n✅ Reservations created!');
  console.log('\n🚀 Next steps:');
  console.log('   1. Add the tables to Airtable using the table above');
  console.log('   2. Visit https://restaurant-ai-mcp.vercel.app/');
  console.log('   3. You should see tables and upcoming reservations');
  console.log('   4. Try checking in a reservation and seating a party!');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
