-- ===========================================
-- MIGRATION: Increase Title Field VARCHAR Limits
-- ===========================================
-- This migration increases VARCHAR limits for title fields
-- from 255 to 1000 characters to prevent overflow errors
-- Safe to run multiple times due to ALTER TABLE IF EXISTS
-- ===========================================

-- Update projects table title field
ALTER TABLE projects
ALTER COLUMN title TYPE VARCHAR(1000);

-- Update tasks table title field
ALTER TABLE tasks
ALTER COLUMN title TYPE VARCHAR(1000);

-- Update goals table title field
ALTER TABLE goals
ALTER COLUMN title TYPE VARCHAR(1000);

-- Update notifications table title field
ALTER TABLE notifications
ALTER COLUMN title TYPE VARCHAR(1000);

-- Update agent_tasks table title field
ALTER TABLE agent_tasks
ALTER COLUMN title TYPE VARCHAR(1000);

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================
-- All title fields now support up to 1000 characters
-- This prevents VARCHAR(255) overflow errors when creating
-- tasks from long AI chat messages
