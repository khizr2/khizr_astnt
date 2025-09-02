require('dotenv').config();
const { query } = require('./database/connection');

async function testConnection() {
    try {
        const result = await query('SELECT NOW()');
        console.log('✅ Database connected successfully!');
        console.log('Current time:', result.rows[0].now);
        process.exit(0);
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

testConnection();
