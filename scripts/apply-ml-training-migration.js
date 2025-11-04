/**
 * Apply ML Training Data Table Migration
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('🔧 Applying ML Training Data migration...\n');

  const migration = `
    -- ML Training Data Table
    CREATE TABLE IF NOT EXISTS ml_training_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reservation_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reservation_date DATE NOT NULL,
      reservation_time TIME NOT NULL,
      outcome_timestamp TIMESTAMPTZ,
      seated_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      customer_email TEXT,
      customer_phone TEXT,
      customer_name TEXT,
      party_size INTEGER NOT NULL,
      special_requests TEXT,
      booking_lead_time_hours DECIMAL(10,2),
      is_repeat_customer BOOLEAN DEFAULT FALSE,
      customer_visit_count INTEGER DEFAULT 0,
      customer_no_show_rate DECIMAL(5,4) DEFAULT 0.15,
      days_since_last_visit INTEGER,
      customer_type TEXT,
      language_preference TEXT,
      seating_preference TEXT,
      special_occasion TEXT,
      dietary_restrictions TEXT[],
      first_time_visitor BOOLEAN DEFAULT FALSE,
      day_of_week INTEGER,
      hour_of_day INTEGER,
      is_weekend BOOLEAN,
      is_prime_time BOOLEAN,
      ml_predicted_risk_score DECIMAL(5,2),
      ml_predicted_risk_level TEXT,
      ml_model_version TEXT,
      actual_outcome TEXT
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_ml_training_reservation ON ml_training_data(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_ml_training_outcome ON ml_training_data(actual_outcome);
    CREATE INDEX IF NOT EXISTS idx_ml_training_date ON ml_training_data(reservation_date);
    CREATE INDEX IF NOT EXISTS idx_ml_training_created ON ml_training_data(created_at);
    CREATE INDEX IF NOT EXISTS idx_ml_training_customer_type ON ml_training_data(customer_type);

    -- Enable RLS
    ALTER TABLE ml_training_data ENABLE ROW LEVEL SECURITY;

    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON ml_training_data;

    -- Create policy
    CREATE POLICY "Allow all operations for authenticated users"
      ON ml_training_data
      FOR ALL
      USING (true)
      WITH CHECK (true);
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: migration });

    if (error) {
      console.error('❌ Migration failed:', error);

      // If exec_sql doesn't exist, we need to create the table manually via dashboard
      console.log('\n⚠️  exec_sql RPC not available.');
      console.log('Please run this SQL manually in Supabase SQL Editor:');
      console.log('\n' + migration);
      process.exit(1);
    }

    console.log('✅ Migration applied successfully!');
    console.log('✅ ml_training_data table created');
    console.log('✅ Indexes created');
    console.log('✅ RLS policies configured');

  } catch (error) {
    console.error('❌ Exception:', error.message);
    console.log('\n📝 To apply manually, run this SQL in Supabase dashboard:');
    console.log('\n' + migration);
  }
}

applyMigration();
