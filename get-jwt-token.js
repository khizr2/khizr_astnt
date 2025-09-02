require('dotenv').config();

// Configuration - Your working admin credentials
const USER_EMAIL = process.env.USER_EMAIL || 'admin@khizr.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'admin123';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:10000';

async function getToken() {
    try {
        console.log('🔄 Attempting to login and get JWT token...');
        console.log(`📧 Email: ${USER_EMAIL}`);
        console.log(`🌐 API URL: ${API_BASE_URL}`);

        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: USER_EMAIL,
                password: USER_PASSWORD
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const token = data.token;

        console.log('\n✅ SUCCESS! Your JWT Token:');
        console.log('=' .repeat(50));
        console.log(token);
        console.log('=' .repeat(50));

        console.log('\n📋 Copy this token to your .env file:');
        console.log(`JWT_TOKEN=${token}`);

        console.log('\n🚀 You can now use this token in your curl commands:');
        console.log(`curl -X GET "${API_BASE_URL}/api/debug/database-tables" \\`);
        console.log(`  -H "Authorization: Bearer ${token}"`);

        // Also save to a temporary file for easy copying
        const fs = require('fs');
        fs.writeFileSync('.jwt_token_temp', token);
        console.log('\n💾 Token also saved to .jwt_token_temp file for easy copying');

        return token;

    } catch (error) {
        console.error('\n❌ ERROR getting token:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Response:', error.response.data);
        } else {
            console.error('Network error:', error.message);
        }

        console.log('\n🔧 Troubleshooting:');
        console.log('1. Make sure your server is running: npm start');
        console.log('2. Check your credentials in this file');
        console.log('3. Verify your .env file has correct SUPABASE_URL and JWT_SECRET');
        console.log('4. Make sure the user exists in your database');

        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    getToken();
}

module.exports = { getToken };
