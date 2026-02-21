/**
 * Mints a test JWT for the stress test suite.
 * Usage: node stress-test/mint-jwt.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  // Find the Boteco do Samba test restaurant
  const { data, error } = await supabase
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, email')
    .ilike('restaurant_name', '%Boteco%')
    .limit(1)
    .single();

  if (error || !data) {
    console.log('Boteco not found, listing available restaurants...');
    const { data: all } = await supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name')
      .limit(5);
    console.log(JSON.stringify(all, null, 2));
    console.error('Set STRESS_RESTAURANT_ID manually and rerun.');
    process.exit(1);
  }

  console.log(`Using restaurant: ${data.restaurant_name} (${data.id})`);

  // Strip trailing \n from JWT_SECRET if present
  const secret = process.env.JWT_SECRET.replace(/\\n$/, '').trim();

  const token = jwt.sign(
    {
      sub: 'stress-test-user',
      email: data.email || 'stress@test.com',
      restaurant_id: data.id,
    },
    secret,
    { expiresIn: '2h' }
  );

  console.log('\nRun the stress test with:');
  console.log(`export PREVIEW_URL="https://restaurant-ai-r97el2glu-stefanogebaras-projects.vercel.app"`);
  console.log(`export TEST_JWT="${token}"`);
  console.log(`npm run test:stress`);
})();
