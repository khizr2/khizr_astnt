// Environment Variable Loader - Secure client-side environment management
class EnvironmentLoader {
    constructor() {
        this.env = {};
        this.loaded = false;
    }

    async loadEnvironment() {
        if (this.loaded) return this.env;

        try {
            // Try to load from server-set global variable first (most secure)
            if (window.SERVER_ENV) {
                this.env = { ...window.SERVER_ENV };
                console.log('✅ Environment loaded from server configuration');
            } else {
                // Fallback: try to load from public env file (less secure but functional)
                await this.loadFromPublicFile();
            }

            // Validate required environment variables
            this.validateRequiredVars();

            this.loaded = true;
            console.log('🔧 Environment configuration loaded successfully');

        } catch (error) {
            console.error('❌ Failed to load environment configuration:', error);
            // Use development defaults as last resort
            this.setDevelopmentDefaults();
        }

        return this.env;
    }

    async loadFromPublicFile() {
        try {
            // Try to fetch environment configuration from server endpoint
            const response = await fetch('/api/config/env', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const envData = await response.json();
                this.env = { ...envData };
                console.log('✅ Environment loaded from API endpoint');
                return;
            }
        } catch (error) {
            console.warn('⚠️ Could not load from API endpoint, trying fallback method');
        }

        // Fallback: Use hardcoded defaults for development
        this.setDevelopmentDefaults();
    }

    setDevelopmentDefaults() {
        // Only use development defaults - never include production secrets
        this.env = {
            SUPABASE_URL: 'https://tugoaqoadsqbvgckkoqf.supabase.co',
            API_BASE_URL: window.location.hostname === 'localhost' ?
                'http://localhost:10000' :
                'https://khizr-assistant-api.onrender.com',
            NODE_ENV: 'development',
            ENABLE_ANALYTICS: false,
            ENABLE_ERROR_REPORTING: false,
            DEFAULT_THEME: 'purple',
            ANIMATIONS_ENABLED: true
        };
        console.log('⚠️ Using development defaults - configure proper environment variables for production');
    }

    validateRequiredVars() {
        const required = ['SUPABASE_URL'];

        for (const key of required) {
            if (!this.env[key]) {
                throw new Error(`Required environment variable missing: ${key}`);
            }
        }

        // Warn about missing optional but recommended variables
        const recommended = ['SUPABASE_ANON_KEY', 'API_BASE_URL'];
        for (const key of recommended) {
            if (!this.env[key]) {
                console.warn(`⚠️ Recommended environment variable missing: ${key}`);
            }
        }
    }

    get(key, defaultValue = null) {
        return this.env[key] || defaultValue;
    }

    set(key, value) {
        this.env[key] = value;
    }

    isProduction() {
        return this.env.NODE_ENV === 'production';
    }

    isDevelopment() {
        return this.env.NODE_ENV === 'development' || !this.env.NODE_ENV;
    }
}

// Create global instance
const envLoader = new EnvironmentLoader();

// Make available globally
window.ENV = envLoader.env;
window.EnvironmentLoader = envLoader;

// Auto-load environment on script load
envLoader.loadEnvironment().then(() => {
    // Make env available globally after loading
    window.ENV = envLoader.env;
}).catch(error => {
    console.error('Failed to initialize environment:', error);
});

export default envLoader;
