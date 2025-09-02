// Test script to verify project creation functionality
const { supabase } = require('./database/connection');

async function testProjectCreation() {
    console.log('Testing project creation functionality...');

    try {
        // First, let's get a user ID for testing
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id')
            .limit(1);

        if (userError || !users || users.length === 0) {
            console.error('No users found in database. Please create a user first.');
            return;
        }

        const userId = users[0].id;
        console.log('Using user ID:', userId);

        // Test direct project creation
        console.log('Testing direct project creation...');
        const { data: project, error: createError } = await supabase
            .from('projects')
            .insert({
                user_id: userId,
                title: 'Viztron',
                description: 'Test project created by AI assistant',
                priority: 3,
                category: 'personal',
                project_type: 'project',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (createError) {
            console.error('Error creating project:', createError);
            return;
        }

        console.log('✅ Project created successfully:', project);

        // Test project retrieval
        console.log('Testing project retrieval...');
        const { data: retrievedProject, error: retrieveError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', project.id)
            .eq('user_id', userId)
            .single();

        if (retrieveError) {
            console.error('Error retrieving project:', retrieveError);
            return;
        }

        console.log('✅ Project retrieved successfully:', retrievedProject);

        // Test project listing
        console.log('Testing project listing...');
        const { data: projects, error: listError } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (listError) {
            console.error('Error listing projects:', listError);
            return;
        }

        console.log('✅ Projects listed successfully:', projects.length, 'projects found');

        console.log('🎉 All project creation tests passed!');
        console.log('Project "Viztron" created with ID:', project.id);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Test the project creation from chat function
async function testChatProjectCreation() {
    console.log('\nTesting chat-based project creation...');

    try {
        // First, get a user ID
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id')
            .limit(1);

        if (userError || !users || users.length === 0) {
            console.error('No users found for testing');
            return;
        }

        const userId = users[0].id;

        // Import the function (this would normally be done in the routes file)
        const { createProjectFromChat } = require('./routes/chat');

        // Test different project creation messages
        const testMessages = [
            'pp Viztron - A visualization project',
            'Create project called Viztron',
            'pp Viztron',
            'pp Learning Project: Advanced Data Visualization'
        ];

        for (const message of testMessages) {
            console.log(`\nTesting message: "${message}"`);
            const result = await createProjectFromChat(message, userId);
            console.log('Result:', result);
        }

        console.log('\n✅ Chat project creation tests completed!');

    } catch (error) {
        console.error('Chat project creation test failed:', error);
    }
}

// Run the tests
async function runAllTests() {
    console.log('🧪 Running Viztron Project Creation Tests\n');

    await testProjectCreation();
    await testChatProjectCreation();

    console.log('\n🏁 All tests completed!');
}

if (require.main === module) {
    runAllTests();
}

module.exports = {
    testProjectCreation,
    testChatProjectCreation,
    runAllTests
};
