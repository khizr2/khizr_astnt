# Agent Schema Migration - Task 1

## Overview
This migration extends the Khizr Assistant database schema with 11 missing agent-related tables to support the full agent system functionality.

## Current Status
- ✅ **agents** table - EXISTS
- ❌ **agent_profiles** - MISSING (needs creation)
- ❌ **agent_tasks** - MISSING (needs creation)
- ❌ **agent_status** - MISSING (needs creation)
- ❌ **agent_conversations** - MISSING (needs creation)
- ❌ **agent_tools** - MISSING (needs creation)
- ❌ **agent_permissions** - MISSING (needs creation)
- ❌ **agent_logs** - MISSING (needs creation)
- ❌ **agent_analytics** - MISSING (needs creation)
- ❌ **approvals_queue** - MISSING (needs creation)
- ❌ **approval_history** - MISSING (needs creation)
- ❌ **agent_metrics** - MISSING (needs creation)

## Migration Files Created
1. `missing-agent-tables.sql` - Contains all CREATE TABLE statements
2. `check-schema.js` - Script to verify current database state
3. Supabase Edge Function for migration guidance

## How to Apply the Migration

### Option 1: Manual Application (Recommended for Safety)
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project
3. Go to **SQL Editor** in the left sidebar
4. Copy the entire contents of `missing-agent-tables.sql`
5. Paste it into the SQL Editor
6. Click **Run** to execute the migration

### Option 2: Using the Migration Script
```bash
cd /Users/khizrkazmi/khizr_astnt
node check-schema.js
```

## Tables Being Created

### Core Agent Tables
- **agent_profiles** - Extended agent profile information
- **agent_tasks** - Tasks assigned to agents
- **agent_status** - Real-time agent status tracking
- **agent_conversations** - Chat and interaction history

### Tool and Permission Management
- **agent_tools** - Available tools and capabilities
- **agent_permissions** - Permission management system

### Analytics and Monitoring
- **agent_logs** - Activity and audit logging
- **agent_analytics** - Performance and usage analytics
- **agent_metrics** - Detailed performance metrics

### Approval System
- **approvals_queue** - Pending approvals for agent actions
- **approval_history** - Historical record of approvals

## Verification Steps

After applying the migration:

1. Run the check script again:
   ```bash
   node check-schema.js
   ```

2. In Supabase Dashboard:
   - Go to **Table Editor**
   - Verify all 12 agent tables are present
   - Check that foreign key relationships are established

3. Test basic operations:
   - Try inserting a record into `agent_profiles`
   - Verify referential integrity works

## Important Notes

- All tables use `IF NOT EXISTS` to prevent conflicts
- Foreign key constraints are properly established
- Indexes are created for optimal performance
- The migration is designed to be non-destructive
- No existing data will be modified

## Next Steps (Future Tasks)

After completing this migration, you can proceed with:

2. **Create dedicated agent routes** (`/api/agents`, `/api/agents/:id/status`, `/api/agents/:id/tasks`, `/api/approvals`)
3. **Implement approval system** for agent actions (pending approvals, approval workflow, approval history)
4. **Add real-time agent status updates** using WebSocket or polling mechanism
5. **Enhance agent task assignment** and management system
6. **Add agent conversation history** and context management
7. **Integrate AI services** for agent decision making and responses

## Rollback Plan

If you need to rollback:

1. In Supabase SQL Editor, run:
   ```sql
   DROP TABLE IF EXISTS agent_metrics;
   DROP TABLE IF EXISTS approval_history;
   DROP TABLE IF EXISTS approvals_queue;
   DROP TABLE IF EXISTS agent_analytics;
   DROP TABLE IF EXISTS agent_logs;
   DROP TABLE IF EXISTS agent_permissions;
   DROP TABLE IF EXISTS agent_tools;
   DROP TABLE IF EXISTS agent_conversations;
   DROP TABLE IF EXISTS agent_status;
   DROP TABLE IF EXISTS agent_tasks;
   DROP TABLE IF EXISTS agent_profiles;
   ```

2. The `agents` table will remain untouched as it already existed.

## Support

If you encounter any issues:
1. Check the Supabase logs in the dashboard
2. Verify your user has sufficient permissions
3. Ensure the `agents` table exists and has the correct structure
4. Check that the `uuid-ossp` extension is enabled

## Migration Completed ✅

Once you've successfully applied this migration, all 11 missing agent tables will be created with proper relationships, indexes, and constraints.
