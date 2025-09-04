// Supabase Authentication and Integration
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://tugoaqoadsqbvgckkoqf.supabase.co";
// SECURITY NOTICE: This file contains hardcoded credentials and should not be used in production
// Use environment variables instead for security
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "REPLACE_WITH_YOUR_ACTUAL_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function saveTokenFromSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    localStorage.setItem("khizr_assistant_auth", JSON.stringify({ token: session.access_token }));
    console.log("🔑 access_token saved");
  }
}

async function initSupabaseAuth() {
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  else await saveTokenFromSession();
};

window.supabaseSignOut = async () => {
  await supabase.auth.signOut();
};

// Initialize Supabase auth on page load
document.addEventListener('DOMContentLoaded', initSupabaseAuth);

// Export for use in other modules
window.Supabase = { supabase, initSupabaseAuth, saveTokenFromSession };
