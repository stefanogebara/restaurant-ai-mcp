-- ML Training Data Table
-- Stores reservation features and outcomes for model retraining

CREATE TABLE IF NOT EXISTS ml_training_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reservation Reference
  reservation_id TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  outcome_timestamp TIMESTAMPTZ,
  seated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Customer Information
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,

  -- Reservation Features
  party_size INTEGER NOT NULL,
  special_requests TEXT,
  booking_lead_time_hours DECIMAL(10,2),

  -- Customer History Features
  is_repeat_customer BOOLEAN DEFAULT FALSE,
  customer_visit_count INTEGER DEFAULT 0,
  customer_no_show_rate DECIMAL(5,4) DEFAULT 0.15,
  days_since_last_visit INTEGER,

  -- Segovia-Specific Features (NEW!)
  customer_type TEXT, -- 'Tourist' or 'Local'
  language_preference TEXT, -- 'Spanish', 'English', 'Chinese', 'French'
  seating_preference TEXT, -- 'Terrace', 'Window', 'Indoor', 'Bar'
  special_occasion TEXT, -- 'Birthday', 'Anniversary', 'Business', 'Tourism'
  dietary_restrictions TEXT[], -- Array of restrictions
  first_time_visitor BOOLEAN DEFAULT FALSE,

  -- Time-based Features
  day_of_week INTEGER, -- 0=Sunday, 6=Saturday
  hour_of_day INTEGER,
  is_weekend BOOLEAN,
  is_prime_time BOOLEAN, -- 7-9 PM Friday/Saturday

  -- ML Prediction
  ml_predicted_risk_score DECIMAL(5,2),
  ml_predicted_risk_level TEXT, -- 'low', 'medium', 'high', 'very-high'
  ml_model_version TEXT,

  -- Actual Outcome (Ground Truth)
  actual_outcome TEXT, -- 'showed_up', 'no_show', 'cancelled', 'pending'

  -- Indexes for querying
  created_at_idx TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_ml_training_reservation ON ml_training_data(reservation_id);
CREATE INDEX idx_ml_training_outcome ON ml_training_data(actual_outcome);
CREATE INDEX idx_ml_training_date ON ml_training_data(reservation_date);
CREATE INDEX idx_ml_training_created ON ml_training_data(created_at);
CREATE INDEX idx_ml_training_customer_type ON ml_training_data(customer_type);

-- Enable Row Level Security
ALTER TABLE ml_training_data ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users"
  ON ml_training_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE ml_training_data IS 'Training data for ML model retraining - collects reservation features and actual outcomes';
