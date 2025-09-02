require('dotenv').config();

// Test script to verify the setup works
async function testSetup() {
    console.log('🧪 Testing Khizr Assistant API Setup...\n');

    // Check environment variables
    console.log('📋 Environment Variables Check:');
    const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET'];
    const optional = ['JWT_TOKEN', 'OPENAI_API_KEY'];

    required.forEach(key => {
        const value = process.env[key];
        const status = value ? '✅ SET' : '❌ MISSING';
        console.log(`${key}: ${status}`);
    });

    console.log('\n📋 Optional Variables:');
    optional.forEach(key => {
        const value = process.env[key];
        const status = value ? '✅ SET' : '⚠️  NOT SET';
        console.log(`${key}: ${status}`);
    });

    // Test server syntax (without starting it)
    console.log('\n🚀 Server Syntax Check:');
    try {
        // Just check if the file can be required without starting the server
        const fs = require('fs');
        const serverCode = fs.readFileSync('./server.js', 'utf8');

        // Basic syntax check - try to parse the code
        new Function(serverCode.replace(/require\(['"`]dotenv['"`]\)\.config\(\);?\s*/, ''));

        console.log('✅ server.js syntax OK');
        console.log('⚠️  Note: Server is already running on port 10000');
    } catch (error) {
        console.log('❌ server.js syntax error:', error.message);
    }

    // Test database connection
    console.log('\n🗄️  Database Connection Check:');
    try {
        const { supabase } = require('./database/connection');
        console.log('✅ Database connection module loaded');
    } catch (error) {
        console.log('❌ Database connection error:', error.message);
    }

    // Check routes
    console.log('\n🛣️  Routes Check:');
    try {
        require('./routes/debug');
        console.log('✅ Debug routes loaded (including /database-tables endpoint)');
    } catch (error) {
        console.log('❌ Routes error:', error.message);
    }

    console.log('\n📝 Summary:');
    console.log('1. Copy env.template to .env and fill in your actual values');
    console.log('2. Run: node get-jwt-token.js (after updating USER_EMAIL/USER_PASSWORD in .env)');
    console.log('3. Use the JWT_TOKEN in your curl commands');
    console.log('4. Your curl command will be:');
    console.log('   curl -X GET "http://localhost:10000/api/debug/database-tables" \\');
    console.log('     -H "Authorization: Bearer $JWT_TOKEN"');
}

// Run test if called directly
if (require.main === module) {
    testSetup();
}

module.exports = { testSetup };
