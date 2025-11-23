-- Migration: Add ElevenLabs agent columns to restaurant_info table
-- Purpose: Support per-restaurant agent creation instead of shared global agent
-- Created: 2025-11-23
-- Related: MVP_PLAN_SIMPLIFICATION.md Phase 2

-- Add agent-related columns to restaurant_info
ALTER TABLE restaurant_info
ADD COLUMN IF NOT EXISTS elevenlabs_agent_id TEXT,
ADD COLUMN IF NOT EXISTS elevenlabs_phone_number TEXT,
ADD COLUMN IF NOT EXISTS agent_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS agent_voice_id TEXT,
ADD COLUMN IF NOT EXISTS agent_language TEXT DEFAULT 'en';

-- Add index for faster agent lookups
CREATE INDEX IF NOT EXISTS idx_restaurant_info_agent_id
ON restaurant_info(elevenlabs_agent_id);

-- Add comment for documentation
COMMENT ON COLUMN restaurant_info.elevenlabs_agent_id IS 'Unique ElevenLabs conversational agent ID for this restaurant';
COMMENT ON COLUMN restaurant_info.elevenlabs_phone_number IS 'Phone number provisioned for this restaurant agent (optional)';
COMMENT ON COLUMN restaurant_info.agent_created_at IS 'Timestamp when the agent was created';
COMMENT ON COLUMN restaurant_info.agent_voice_id IS 'ElevenLabs voice ID selected during onboarding';
COMMENT ON COLUMN restaurant_info.agent_language IS 'Primary language for agent (en, es, fr, it, pt)';
