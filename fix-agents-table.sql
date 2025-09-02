-- ===========================================
-- AGENTS TABLE FIX - Add Missing Columns
-- ===========================================
-- This script fixes the agents table by adding missing columns
-- Note: Run this in Supabase SQL Editor, not via psql

-- Add user_id column if it doesn't exist
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add type column if it doesn't exist
ALTER TABLE agents ADD COLUMN IF NOT EXISTS type VARCHAR(100) NOT NULL DEFAULT 'task_manager';

-- Add other potentially missing columns
ALTER TABLE agents ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT 'gpt-4';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS configuration JSONB DEFAULT '{}';

-- Create indexes for the new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_is_active ON agents(is_active);

-- Verify the table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agents'
ORDER BY ordinal_position;
