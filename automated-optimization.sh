#!/bin/bash

# Khizr Agentic System - Automated Optimization Script
# This script can be called by cron jobs for regular optimization

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/logs/optimization-$(date +%Y%m%d).log"

# Ensure we're in the right directory
cd "$SCRIPT_DIR"

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "$LOG_FILE"
}

# Function to check if script is already running
is_running() {
    local script_name="$1"
    if pgrep -f "$script_name" > /dev/null; then
        return 0  # True - script is running
    else
        return 1  # False - script is not running
    fi
}

# Function to run optimization with timeout and error handling
run_optimization() {
    local script="$1"
    local timeout="${2:-1800}"  # Default 30 minutes timeout

    if is_running "$script"; then
        log "⚠️  $script is already running, skipping..."
        return 0
    fi

    log "🚀 Starting $script..."

    # Run with timeout and capture output
    if timeout "$timeout" node "$script" >> "$LOG_FILE" 2>&1; then
        log "✅ $script completed successfully"
        return 0
    else
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            log "❌ $script timed out after ${timeout}s"
        else
            log "❌ $script failed with exit code $exit_code"
        fi
        return $exit_code
    fi
}

# Main execution
log "🤖 Starting Automated Khizr Optimization Cycle"
log "📍 Working directory: $SCRIPT_DIR"
log "📝 Log file: $LOG_FILE"

# Daily system evaluation
log ""
log "📊 PHASE 1: Daily System Evaluation"
if run_optimization "evaluate-system.js" 900; then
    # Check if evaluation results exist and log summary
    EVAL_FILE=$(find . -name "evaluation-results-*.json" -newer "$LOG_FILE" 2>/dev/null | head -1)
    if [ -n "$EVAL_FILE" ]; then
        HEALTH_SCORE=$(jq -r '.metrics.systemHealth.score // "N/A"' "$EVAL_FILE" 2>/dev/null || echo "N/A")
        log "📈 System Health Score: $HEALTH_SCORE"

        if (( $(echo "$HEALTH_SCORE < 70" | bc -l 2>/dev/null || echo 1) )); then
            log "🚨 ALERT: System health score is low! Manual review recommended."
        fi
    fi
fi

# Weekly collaboration optimization (only run on Sundays)
if [ "$(date +%u)" = "7" ]; then
    log ""
    log "🤝 PHASE 2: Weekly Collaboration Optimization"
    run_optimization "agent-collaboration-optimizer.js" 1200
fi

# Monthly performance optimization (only run on 1st of month)
if [ "$(date +%d)" = "01" ]; then
    log ""
    log "⚡ PHASE 3: Monthly Performance Optimization"
    run_optimization "performance-optimizer.js" 1800
fi

# Check for critical alerts in logs
log ""
log "🔍 Checking for critical alerts..."
CRITICAL_ALERTS=$(grep -c "severity.*critical\|CRITICAL" logs/*.log 2>/dev/null || echo "0")
if [ "$CRITICAL_ALERTS" -gt 0 ]; then
    log "🚨 ALERT: $CRITICAL_ALERTS critical alerts found in logs!"
    log "   Check logs for details and take appropriate action."
fi

# Cleanup old log files (keep last 30 days)
log ""
log "🧹 Cleaning up old log files..."
find logs/ -name "optimization-*.log" -mtime +30 -delete 2>/dev/null || true
find . -name "evaluation-results-*.json" -mtime +30 -delete 2>/dev/null || true
find . -name "optimization-report.json" -mtime +30 -delete 2>/dev/null || true
find . -name "collaboration-report.json" -mtime +30 -delete 2>/dev/null || true

log ""
log "✅ Automated optimization cycle completed"
log "📊 Summary:"
log "   - System evaluation: ✅ Completed"
log "   - Collaboration optimization: $([ "$(date +%u)" = "7" ] && echo "✅ Completed" || echo "⏭️  Skipped (not Sunday)")"
log "   - Performance optimization: $([ "$(date +%d)" = "01" ] && echo "✅ Completed" || echo "⏭️  Skipped (not 1st of month)")"
log "   - Critical alerts: $CRITICAL_ALERTS found"
log ""
log "📝 Full logs available at: $LOG_FILE"

exit 0
