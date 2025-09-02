CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'active',
    deadline DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending',
    estimated_duration INTEGER,
    deadline TIMESTAMP,
    completed_at TIMESTAMP,
    ai_generated BOOLEAN DEFAULT FALSE,
    source VARCHAR(100) DEFAULT 'manual',
    source_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Goals table
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    target_date DATE,
    status VARCHAR(50) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_goals_user_id ON goals(user_id);

-- Emails table
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_id VARCHAR(255) UNIQUE,
    sender VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    subject TEXT,
    content TEXT,
    content_snippet TEXT,
    priority INTEGER DEFAULT 3,
    is_automated BOOLEAN DEFAULT FALSE,
    is_important BOOLEAN DEFAULT FALSE,
    summary TEXT,
    suggested_response TEXT,
    status VARCHAR(50) DEFAULT 'unread',
    labels JSONB,
    thread_id VARCHAR(255),
    received_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    priority INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending',
    action_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gmail tokens table
CREATE TABLE gmail_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for emails and notifications
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_priority ON emails(priority);
CREATE INDEX idx_emails_received_at ON emails(received_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_priority ON notifications(priority);
CREATE INDEX idx_gmail_tokens_user_id ON gmail_tokens(user_id);

-- ===========================================
-- AGENT SYSTEM TABLES
-- ===========================================

-- Agents table - Core agent entities
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

-- Agent profiles table - Extended profile information
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

-- Agent tasks table - Tasks assigned to agents
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

-- Agent status table - Real-time status tracking
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

-- Agent conversations table - Chat and interaction history
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

-- Agent tools table - Available tools and capabilities
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

-- Agent permissions table - Permission management
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

-- Agent logs table - Activity and audit logging
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

-- Agent analytics table - Performance and usage analytics
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

-- Approvals queue table - Pending approvals for agent actions
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

-- Approval history table - Historical record of approvals
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

-- Agent metrics table - Detailed performance metrics
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

-- ===========================================
-- AGENT SYSTEM INDEXES
-- ===========================================

-- Agent indexes
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_is_active ON agents(is_active);

-- Agent profiles indexes
CREATE INDEX idx_agent_profiles_agent_id ON agent_profiles(agent_id);

-- Agent tasks indexes
CREATE INDEX idx_agent_tasks_agent_id ON agent_tasks(agent_id);
CREATE INDEX idx_agent_tasks_task_id ON agent_tasks(task_id);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_type ON agent_tasks(type);
CREATE INDEX idx_agent_tasks_priority ON agent_tasks(priority);
CREATE INDEX idx_agent_tasks_created_at ON agent_tasks(created_at);

-- Agent status indexes
CREATE INDEX idx_agent_status_agent_id ON agent_status(agent_id);
CREATE INDEX idx_agent_status_status ON agent_status(status);
CREATE INDEX idx_agent_status_last_activity ON agent_status(last_activity);

-- Agent conversations indexes
CREATE INDEX idx_agent_conversations_agent_id ON agent_conversations(agent_id);
CREATE INDEX idx_agent_conversations_user_id ON agent_conversations(user_id);
CREATE INDEX idx_agent_conversations_session_id ON agent_conversations(session_id);
CREATE INDEX idx_agent_conversations_message_type ON agent_conversations(message_type);
CREATE INDEX idx_agent_conversations_created_at ON agent_conversations(created_at);

-- Agent tools indexes
CREATE INDEX idx_agent_tools_category ON agent_tools(category);
CREATE INDEX idx_agent_tools_is_active ON agent_tools(is_active);
CREATE INDEX idx_agent_tools_usage_count ON agent_tools(usage_count);

-- Agent permissions indexes
CREATE INDEX idx_agent_permissions_agent_id ON agent_permissions(agent_id);
CREATE INDEX idx_agent_permissions_tool_id ON agent_permissions(tool_id);
CREATE INDEX idx_agent_permissions_resource_type ON agent_permissions(resource_type);
CREATE INDEX idx_agent_permissions_is_active ON agent_permissions(is_active);
CREATE INDEX idx_agent_permissions_expires_at ON agent_permissions(expires_at);

-- Agent logs indexes
CREATE INDEX idx_agent_logs_agent_id ON agent_logs(agent_id);
CREATE INDEX idx_agent_logs_user_id ON agent_logs(user_id);
CREATE INDEX idx_agent_logs_action ON agent_logs(action);
CREATE INDEX idx_agent_logs_severity ON agent_logs(severity);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at);

-- Agent analytics indexes
CREATE INDEX idx_agent_analytics_agent_id ON agent_analytics(agent_id);
CREATE INDEX idx_agent_analytics_date ON agent_analytics(date);
CREATE INDEX idx_agent_analytics_metric_type ON agent_analytics(metric_type);

-- Approvals queue indexes
CREATE INDEX idx_approvals_queue_agent_id ON approvals_queue(agent_id);
CREATE INDEX idx_approvals_queue_user_id ON approvals_queue(user_id);
CREATE INDEX idx_approvals_queue_status ON approvals_queue(status);
CREATE INDEX idx_approvals_queue_priority ON approvals_queue(priority);
CREATE INDEX idx_approvals_queue_expires_at ON approvals_queue(expires_at);
CREATE INDEX idx_approvals_queue_created_at ON approvals_queue(created_at);

-- Approval history indexes
CREATE INDEX idx_approval_history_approval_id ON approval_history(approval_id);
CREATE INDEX idx_approval_history_agent_id ON approval_history(agent_id);
CREATE INDEX idx_approval_history_user_id ON approval_history(user_id);
CREATE INDEX idx_approval_history_action_taken ON approval_history(action_taken);
CREATE INDEX idx_approval_history_created_at ON approval_history(created_at);

-- Agent metrics indexes
CREATE INDEX idx_agent_metrics_agent_id ON agent_metrics(agent_id);
CREATE INDEX idx_agent_metrics_task_id ON agent_metrics(task_id);
CREATE INDEX idx_agent_metrics_metric_type ON agent_metrics(metric_type);
CREATE INDEX idx_agent_metrics_timestamp ON agent_metrics(timestamp);

-- ===========================================
-- USER PREFERENCE LEARNING TABLES
-- ===========================================

-- User Preferences Table
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
-- USER PREFERENCE INDEXES
-- ===========================================

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_type_key ON user_preferences(user_id, preference_type, preference_key);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_type ON user_preferences(preference_type);
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_updated ON user_preferences(last_updated);

-- User learning patterns indexes
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user_type ON user_learning_patterns(user_id, pattern_type);
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user_id ON user_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_type ON user_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_created_at ON user_learning_patterns(created_at);
