-- ===========================================
-- MIGRATION: Add User Preference Learning Tables
-- ===========================================
-- This migration adds user_preferences and user_learning_patterns tables
-- Safe to run multiple times due to IF NOT EXISTS clauses
-- Created: $(date)
-- ===========================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- USER PREFERENCE LEARNING TABLES
-- ===========================================

-- User Preferences Table
-- Stores user preferences for AI interactions and system behavior
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_type VARCHAR(100) NOT NULL, -- 'format', 'style', 'priority'
    preference_key VARCHAR(255) NOT NULL, -- 'word_tree', 'brief_responses', 'completion_focus'
    preference_value JSONB NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    usage_count INTEGER DEFAULT 1,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, preference_type, preference_key)
);

-- Learning Patterns Table
-- Stores learned patterns from user interactions for AI adaptation
CREATE TABLE IF NOT EXISTS user_learning_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_type VARCHAR(100) NOT NULL,
    pattern_data JSONB NOT NULL,
    trigger_keywords TEXT[],
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    successful_applications INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- PERFORMANCE INDEXES
-- ===========================================

-- User preferences indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_type_key ON user_preferences(user_id, preference_type, preference_key);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_type ON user_preferences(preference_type);
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_updated ON user_preferences(last_updated);

-- User learning patterns indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user_type ON user_learning_patterns(user_id, pattern_type);
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user_id ON user_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_type ON user_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_created_at ON user_learning_patterns(created_at);

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================
-- Tables created successfully:
-- ✓ user_preferences
-- ✓ user_learning_patterns
--
-- Indexes created successfully:
-- ✓ idx_user_preferences_user_type_key
-- ✓ idx_user_preferences_user_id
-- ✓ idx_user_preferences_type
-- ✓ idx_user_preferences_last_updated
-- ✓ idx_user_learning_patterns_user_type
-- ✓ idx_user_learning_patterns_user_id
-- ✓ idx_user_learning_patterns_type
-- ✓ idx_user_learning_patterns_created_at
