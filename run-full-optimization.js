const { SystemEvaluator } = require('./evaluate-system');
const { AgentCollaborationOptimizer } = require('./agent-collaboration-optimizer');
const { RealTimeMetricsTracker } = require('./real-time-metrics');
const { PerformanceOptimizer } = require('./performance-optimizer');

async function runFullOptimization() {
    console.log('🚀 Starting Full Khizr Agentic System Optimization...\n');

    try {
        // 1. Evaluate current system
        console.log('📊 PHASE 1: System Evaluation');
        const evaluator = new SystemEvaluator();
        await evaluator.runFullEvaluation();

        // 2. Optimize collaboration
        console.log('🤝 PHASE 2: Agent Collaboration Optimization');
        const collaborationOptimizer = new AgentCollaborationOptimizer();
        await collaborationOptimizer.optimizeCollaboration();

        // 3. Start real-time metrics
        console.log('📈 PHASE 3: Real-time Metrics Setup');
        const metricsTracker = new RealTimeMetricsTracker();
        await metricsTracker.startTracking(60000); // 1 minute intervals

        // 4. Run performance optimization
        console.log('⚡ PHASE 4: Performance Optimization');
        const performanceOptimizer = new PerformanceOptimizer();
        await performanceOptimizer.runOptimizationCycle();

        console.log('🎉 Full optimization cycle completed successfully!');
        console.log('📄 Check the generated report files for detailed results.');
        console.log('📊 Files generated:');
        console.log('   - evaluation-results.json');
        console.log('   - collaboration-report.json');
        console.log('   - optimization-report.json');

    } catch (error) {
        console.error('❌ Full optimization failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run individual components if specified
async function runIndividualComponent(component) {
    try {
        switch (component) {
            case 'evaluate':
                const evaluator = new SystemEvaluator();
                await evaluator.runFullEvaluation();
                break;
            case 'collaborate':
                const collaborationOptimizer = new AgentCollaborationOptimizer();
                await collaborationOptimizer.optimizeCollaboration();
                break;
            case 'metrics':
                const metricsTracker = new RealTimeMetricsTracker();
                await metricsTracker.startTracking(30000);
                break;
            case 'optimize':
                const performanceOptimizer = new PerformanceOptimizer();
                await performanceOptimizer.runOptimizationCycle();
                break;
            default:
                console.log('Usage:');
                console.log('  node run-full-optimization.js              # Run all phases');
                console.log('  node run-full-optimization.js evaluate     # System evaluation only');
                console.log('  node run-full-optimization.js collaborate  # Collaboration optimization only');
                console.log('  node run-full-optimization.js metrics      # Real-time metrics only');
                console.log('  node run-full-optimization.js optimize     # Performance optimization only');
                process.exit(1);
        }
    } catch (error) {
        console.error(`❌ ${component} failed:`, error);
        process.exit(1);
    }
}

if (require.main === module) {
    const component = process.argv[2];

    if (component) {
        runIndividualComponent(component);
    } else {
        runFullOptimization();
    }
}

module.exports = { runFullOptimization, runIndividualComponent };
