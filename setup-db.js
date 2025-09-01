const { query } = require('./database/connection');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
    try {
        console.log('Setting up database...');
        
        // Read the schema file
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = schema.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                console.log('Executing:', statement.substring(0, 50) + '...');
                await query(statement);
            }
        }
        
        console.log('Database setup completed successfully!');
        
        // Test the connection
        const result = await query('SELECT NOW() as current_time');
        console.log('Database connection test:', result.rows[0]);
        
    } catch (error) {
        console.error('Database setup error:', error);
        process.exit(1);
    }
}

setupDatabase();
