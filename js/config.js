// Configuration Management for Different Environments
class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
        this.init();
    }

    init() {
        // Set up environment detection
        this.detectEnvironment();

        // Override with server-provided config if available
        this.loadServerConfig();

        // Apply configuration
        this.applyConfig();
    }

    loadConfig() {
        return {
            // Default configuration
            api: {
                baseURL: this.getDefaultBaseURL(),
                timeout: 30000,
                retries: 3,
                retryDelay: 1000
            },
            features: {
                analytics: true,
                errorReporting: true,
                patternLearning: true,
                daddyAgent: true,
                gmailIntegration: true
            },
            ui: {
                theme: 'purple',
                animations: true,
                notifications: true,
                soundEffects: false
            },
            performance: {
                lazyLoadImages: true,
                debounceDelay: 300,
                throttleDelay: 100
            },
            security: {
                tokenRefreshThreshold: 300000, // 5 minutes
                maxLoginAttempts: 5,
                sessionTimeout: 3600000 // 1 hour
            }
        };
    }

    getDefaultBaseURL() {
        // Environment-based URL detection
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:10000';
        }

        // Production domains
        if (hostname.includes('khizr-assistant-api.onrender.com')) {
            return 'https://khizr-assistant-api.onrender.com';
        }

        // Staging domains
        if (hostname.includes('staging') || hostname.includes('dev')) {
            return `${protocol}//${hostname}`;
        }

        // Default to same origin
        return `${protocol}//${hostname}`;
    }

    detectEnvironment() {
        const hostname = window.location.hostname;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            this.environment = 'development';
        } else if (hostname.includes('staging') || hostname.includes('dev')) {
            this.environment = 'staging';
        } else {
            this.environment = 'production';
        }

        console.log(`Environment detected: ${this.environment}`);
    }

    loadServerConfig() {
        // Check for server-provided configuration
        if (window.SERVER_CONFIG) {
            this.mergeConfig(window.SERVER_CONFIG);
        }

        // Check for configuration in meta tags
        const configMeta = document.querySelector('meta[name="app-config"]');
        if (configMeta && configMeta.content) {
            try {
                const serverConfig = JSON.parse(configMeta.content);
                this.mergeConfig(serverConfig);
            } catch (error) {
                console.warn('Invalid server configuration in meta tag:', error);
            }
        }
    }

    mergeConfig(newConfig) {
        // Deep merge configuration objects
        this.config = this.deepMerge(this.config, newConfig);
    }

    deepMerge(target, source) {
        const output = { ...target };

        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }

        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    applyConfig() {
        // Set global API base URL
        if (this.config.api.baseURL) {
            window.API_BASE_URL = this.config.api.baseURL;
        }

        // Apply UI configuration
        if (this.config.ui.theme) {
            document.documentElement.className = `theme-${this.config.ui.theme}`;
            localStorage.setItem('theme', this.config.ui.theme);
        }

        // Disable animations if configured
        if (!this.config.ui.animations) {
            document.documentElement.classList.add('no-animations');
        }

        // Apply feature flags
        this.applyFeatureFlags();

        console.log('Configuration applied:', this.config);
    }

    applyFeatureFlags() {
        // Hide disabled features
        if (!this.config.features.analytics) {
            // Disable analytics tracking
            window.disableAnalytics = true;
        }

        if (!this.config.features.patternLearning) {
            // Hide pattern-related UI elements
            const patternElements = document.querySelectorAll('[data-feature="pattern-learning"]');
            patternElements.forEach(el => el.style.display = 'none');
        }

        if (!this.config.features.daddyAgent) {
            // Hide daddy agent features
            const daddyElements = document.querySelectorAll('[data-feature="daddy-agent"]');
            daddyElements.forEach(el => el.style.display = 'none');
        }

        if (!this.config.features.gmailIntegration) {
            // Hide Gmail integration features
            const gmailElements = document.querySelectorAll('[data-feature="gmail"]');
            gmailElements.forEach(el => el.style.display = 'none');
        }
    }

    // Configuration getters
    get(key) {
        return key.split('.').reduce((obj, prop) => obj && obj[prop], this.config);
    }

    set(key, value) {
        const keys = key.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, prop) => {
            if (!obj[prop]) obj[prop] = {};
            return obj[prop];
        }, this.config);

        target[lastKey] = value;

        // Save to localStorage for persistence
        localStorage.setItem('app_config', JSON.stringify(this.config));

        // Re-apply configuration
        this.applyConfig();
    }

    // Environment-specific configurations
    isDevelopment() {
        return this.environment === 'development';
    }

    isStaging() {
        return this.environment === 'staging';
    }

    isProduction() {
        return this.environment === 'production';
    }

    // Debug configuration in development
    debug() {
        if (this.isDevelopment()) {
            console.log('Current Configuration:', this.config);
            console.log('Environment:', this.environment);
            console.log('API Base URL:', this.config.api.baseURL);
        }
    }

    // Reset to defaults
    reset() {
        localStorage.removeItem('app_config');
        this.config = this.loadConfig();
        this.applyConfig();
    }

    // Export configuration for debugging
    export() {
        return JSON.stringify(this.config, null, 2);
    }

    // Load saved configuration
    loadSavedConfig() {
        const saved = localStorage.getItem('app_config');
        if (saved) {
            try {
                const savedConfig = JSON.parse(saved);
                this.mergeConfig(savedConfig);
            } catch (error) {
                console.warn('Invalid saved configuration:', error);
                localStorage.removeItem('app_config');
            }
        }
    }
}

// Create and export singleton instance
const configManager = new ConfigManager();
window.Config = configManager; // Make available globally for backward compatibility

// Legacy support
window.getConfig = (key) => configManager.get(key);
window.setConfig = (key, value) => configManager.set(key, value);
