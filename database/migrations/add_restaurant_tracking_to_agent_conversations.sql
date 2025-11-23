-- Migration: Add restaurant tracking to agent_conversations table
-- Purpose: Link conversations to specific restaurants and agents
-- Created: 2025-11-23
-- Related: MVP_PLAN_SIMPLIFICATION.md Phase 3

-- Add restaurant and agent tracking columns
ALTER TABLE agent_conversations
ADD COLUMN IF NOT EXISTS restaurant_id TEXT REFERENCES restaurant_info(restaurant_id),
ADD COLUMN IF NOT EXISTS agent_id TEXT;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_agent_conversations_restaurant
ON agent_conversations(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent
ON agent_conversations(agent_id);

-- Add comments for documentation
COMMENT ON COLUMN agent_conversations.restaurant_id IS 'References the restaurant this conversation belongs to';
COMMENT ON COLUMN agent_conversations.agent_id IS 'ElevenLabs agent ID that handled this conversation';
