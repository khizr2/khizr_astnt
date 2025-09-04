// Supabase Authentication and Integration
// Note: Supabase client is now initialized in app.html to avoid module issues
// This file contains helper functions for Supabase operations

// Helper function to get the current Supabase client
function getSupabaseClient() {
  if (!window.supabase) {
    throw new Error('Supabase client not initialized. Please check app initialization.');
  }
  return window.supabase;
}

async function saveTokenFromSession() {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    localStorage.setItem("khizr_assistant_auth", JSON.stringify({ token: session.access_token }));
    console.log("🔑 access_token saved");
  }
}

async function initSupabaseAuth() {
  const supabase = getSupabaseClient();
  // run once on load + keep in sync on changes
  await saveTokenFromSession();
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) {
      localStorage.setItem("khizr_assistant_auth", JSON.stringify({ token: session.access_token }));
      console.log("🔑 access_token updated");
    } else {
      localStorage.removeItem("khizr_assistant_auth");
      console.log("🚪 logged out");
    }
  });
}

// Quick helpers you can call from console or buttons
window.supabaseSignIn = async (email, password) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  else await saveTokenFromSession();
};

window.supabaseSignOut = async () => {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
};

// Initialize Supabase auth on page load
document.addEventListener('DOMContentLoaded', initSupabaseAuth);

// Export for use in other modules (no ES6 export)
window.Supabase = { getSupabaseClient, initSupabaseAuth, saveTokenFromSession };
