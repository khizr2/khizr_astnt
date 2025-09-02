-- ===========================================
-- AGENTS TABLE MIGRATION - Drop and Recreate
-- ===========================================

-- IMPORTANT: This will DELETE ALL existing agent data!
-- Backup any important agent data before running this script.

-- Drop existing agents table if it exists (to fix schema mismatch)
DROP TABLE IF EXISTS agents CASCADE;

-- Create the agents table with correct schema
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'task_manager', 'email_assistant', 'project_coordinator', etc.
    model VARCHAR(100) DEFAULT 'gpt-4', -- AI model being used
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    capabilities JSONB DEFAULT '{}', -- JSON array of agent capabilities
    configuration JSONB DEFAULT '{}', -- Agent-specific configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- AGENT PROFILES AND OTHER TABLES
-- ===========================================

-- Drop related tables if they exist (due to CASCADE from agents drop)
DROP TABLE IF EXISTS agent_profiles CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agent_status CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tools CASCADE;
DROP TABLE IF EXISTS agent_permissions CASCADE;
DROP TABLE IF EXISTS agent_logs CASCADE;
DROP TABLE IF EXISTS agent_analytics CASCADE;
DROP TABLE IF EXISTS approvals_queue CASCADE;
DROP TABLE IF EXISTS approval_history CASCADE;
DROP TABLE IF EXISTS agent_metrics CASCADE;
CREATE TABLE agent_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    avatar_url VARCHAR(500),
    personality VARCHAR(100) DEFAULT 'professional', -- 'professional', 'casual', 'formal', etc.
    expertise_areas TEXT[], -- Array of expertise areas
    language_skills JSONB DEFAULT '{}', -- Language proficiency levels
    timezone VARCHAR(50) DEFAULT 'UTC',
    working_hours JSONB DEFAULT '{"start": "09:00", "end": "17:00"}', -- Working hours configuration
    preferences JSONB DEFAULT '{}', -- User preference settings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL, -- Link to existing tasks table
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL, -- 'email_processing', 'task_creation', 'project_management', etc.
    priority INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
    parameters JSONB DEFAULT '{}', -- Task-specific parameters
    result JSONB DEFAULT '{}', -- Task execution results
    estimated_duration INTEGER, -- Estimated duration in minutes
    actual_duration INTEGER, -- Actual duration in minutes
    deadline TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- 'idle', 'busy', 'offline', 'error', 'maintenance'
    status_message TEXT,
    current_task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    health_score DECIMAL(3,2) DEFAULT 1.0, -- Health score between 0.0 and 1.0
    cpu_usage DECIMAL(5,2), -- CPU usage percentage
    memory_usage DECIMAL(5,2), -- Memory usage percentage
    uptime_seconds BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id) -- Only one status record per agent
);

CREATE TABLE agent_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255), -- Group related messages
    message_type VARCHAR(50) NOT NULL, -- 'user_message', 'agent_response', 'system_message', 'error'
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Additional message metadata
    tokens_used INTEGER, -- AI tokens consumed for this message
    response_time_ms INTEGER, -- Response time in milliseconds
    sentiment VARCHAR(50), -- 'positive', 'negative', 'neutral'
    confidence_score DECIMAL(3,2), -- AI confidence score
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'communication', 'task_management', 'data_processing', etc.
    endpoint VARCHAR(500), -- API endpoint or function reference
    parameters_schema JSONB DEFAULT '{}', -- JSON schema for tool parameters
    required_permissions TEXT[], -- Array of required permissions
    is_active BOOLEAN DEFAULT TRUE,
    usage_count BIGINT DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 1.0,
    average_response_time INTEGER, -- Average response time in milliseconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_id UUID REFERENCES agent_tools(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) NOT NULL, -- 'read', 'write', 'execute', 'admin'
    resource_type VARCHAR(100) NOT NULL, -- 'emails', 'tasks', 'projects', 'users', etc.
    resource_id UUID, -- Specific resource ID if applicable
    conditions JSONB DEFAULT '{}', -- Additional permission conditions
    granted_by UUID NOT NULL REFERENCES users(id), -- User who granted permission
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(50) DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'critical'
    duration_ms INTEGER,
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- 'tasks_completed', 'response_time', 'user_satisfaction', etc.
    metric_value DECIMAL(10,2),
    metric_unit VARCHAR(50), -- 'count', 'milliseconds', 'percentage', etc.
    time_range VARCHAR(50) DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'monthly'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, date, metric_type, time_range)
);

CREATE TABLE approvals_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL, -- 'task_creation', 'email_send', 'project_modification', etc.
    action_data JSONB NOT NULL, -- Complete action payload
    reason TEXT, -- Why approval is needed
    risk_level VARCHAR(50) DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    priority INTEGER DEFAULT 3, -- 1 = highest, 5 = lowest
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    approval_id UUID NOT NULL REFERENCES approvals_queue(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_taken VARCHAR(50) NOT NULL, -- 'approved', 'rejected', 'expired', 'auto_approved'
    action_data JSONB NOT NULL, -- Action data at time of approval
    decision_reason TEXT,
    processing_time_ms INTEGER,
    risk_assessment JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    metric_type VARCHAR(100) NOT NULL, -- 'cpu_usage', 'memory_usage', 'response_time', 'accuracy', etc.
    metric_value DECIMAL(10,2) NOT NULL,
    metric_unit VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    context JSONB DEFAULT '{}', -- Additional context for the metric
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);