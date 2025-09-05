require('dotenv').config();
const { supabase } = require('./database/connection');

const ADMIN_EMAIL = 'admin@khizr.com';
const NEW_PASSWORD = 'admin123';

async function resetAdminPassword() {
    try {
        console.log('🔄 Resetting admin password using Supabase auth...');

        console.log('📧 Admin email:', ADMIN_EMAIL);
        console.log('🔑 New password:', NEW_PASSWORD);

        // Use Supabase auth to update password
        const { data, error } = await supabase.auth.updateUser({
            email: ADMIN_EMAIL,
            password: NEW_PASSWORD
        });

        if (error) {
            console.error('❌ Error updating password:', error);
            return;
        }

        console.log('✅ Password reset successful!');
        console.log('👤 User updated in Supabase auth');

        console.log('\n🚀 You can now login with:');
        console.log('📧 Email:', ADMIN_EMAIL);
        console.log('🔑 Password:', NEW_PASSWORD);
        console.log('\n⚠️  Note: Password is now managed by Supabase auth, not stored in our database');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    resetAdminPassword();
}

module.exports = { resetAdminPassword };
