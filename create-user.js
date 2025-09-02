const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:10000';
const NEW_EMAIL = 'test@khizr.com';
const NEW_PASSWORD = 'testpassword123';
const NEW_NAME = 'Test User';

async function createUser() {
    try {
        console.log('🔄 Creating new test user...');

        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: NEW_EMAIL,
                password: NEW_PASSWORD,
                name: NEW_NAME
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ User created successfully!');
            console.log('📧 Email:', NEW_EMAIL);
            console.log('🔑 Password:', NEW_PASSWORD);
            console.log('🎫 JWT Token:', data.token);

            console.log('\n📝 Update your .env file:');
            console.log(`USER_EMAIL=${NEW_EMAIL}`);
            console.log(`USER_PASSWORD=${NEW_PASSWORD}`);
            console.log(`JWT_TOKEN=${data.token}`);

            return data.token;
        } else {
            const error = await response.json();
            console.log('❌ Error creating user:', error.error);
        }

    } catch (error) {
        console.error('❌ Network error:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    createUser();
}

module.exports = { createUser };
