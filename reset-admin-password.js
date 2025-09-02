require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabase } = require('./database/connection');

const ADMIN_EMAIL = 'admin@khizr.com';
const NEW_PASSWORD = 'admin123';

async function resetAdminPassword() {
    try {
        console.log('🔄 Resetting admin password...');

        // Generate new password hash
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(NEW_PASSWORD, saltRounds);

        console.log('📧 Admin email:', ADMIN_EMAIL);
        console.log('🔑 New password:', NEW_PASSWORD);

        // Update the user's password hash in the database
        const { data, error } = await supabase
            .from('users')
            .update({ password_hash: newPasswordHash })
            .eq('email', ADMIN_EMAIL)
            .select('id, email, name')
            .single();

        if (error) {
            console.error('❌ Error updating password:', error);
            return;
        }

        if (!data) {
            console.error('❌ Admin user not found');
            return;
        }

        console.log('✅ Password reset successful!');
        console.log('👤 User:', data);

        // Test the login
        console.log('\n🧪 Testing login...');
        const isValid = await bcrypt.compare(NEW_PASSWORD, newPasswordHash);
        console.log('🔐 Password verification test:', isValid ? '✅ PASSED' : '❌ FAILED');

        console.log('\n🚀 You can now login with:');
        console.log('📧 Email:', ADMIN_EMAIL);
        console.log('🔑 Password:', NEW_PASSWORD);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    resetAdminPassword();
}

module.exports = { resetAdminPassword };
