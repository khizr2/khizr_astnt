// Authentication and User Management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        this.checkAuthStatus();
        this.setupAuthListeners();
    }

    checkAuthStatus() {
        const token = localStorage.getItem('khizr_assistant_auth');
        const userData = localStorage.getItem('user_data');

        if (token && userData) {
            try {
                this.currentUser = JSON.parse(userData);
                this.isAuthenticated = true;
            } catch (error) {
                console.error('Invalid user data in localStorage:', error);
                this.clearAuth();
            }
        } else {
            this.isAuthenticated = false;
            this.currentUser = null;
        }
    }

    setupAuthListeners() {
        // Listen for authentication events
        window.addEventListener('storage', (e) => {
            if (e.key === 'khizr_assistant_auth' || e.key === 'user_data') {
                this.checkAuthStatus();
            }
        });
    }

    async login(credentials) {
        try {
            // Use Supabase authentication directly (no API calls needed)
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email: credentials.email,
                password: credentials.password
            });

            if (error) {
                throw new Error(error.message);
            }

            if (data.session && data.user) {
                // Store authentication data
                const authData = {
                    token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    user: data.user
                };

                this.setAuthToken(authData.token);
                this.setUserData(data.user);

                console.log('Login successful via Supabase');
                return { success: true, user: data.user };
            } else {
                throw new Error('Login failed - no session created');
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async register(userData) {
        try {
            // Use Supabase authentication directly (no API calls needed)
            const { data, error } = await window.supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        name: userData.name || userData.username,
                        phone: userData.phone
                    }
                }
            });

            if (error) {
                throw new Error(error.message);
            }

            if (data.session && data.user) {
                // User is immediately signed in
                const authData = {
                    token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    user: data.user
                };

                this.setAuthToken(authData.token);
                this.setUserData(data.user);

                console.log('Registration successful via Supabase');
                return { success: true, user: data.user };
            } else if (data.user && !data.session) {
                // Email confirmation required
                console.log('Registration initiated - email confirmation required');
                return {
                    success: true,
                    requiresConfirmation: true,
                    user: data.user,
                    message: 'Please check your email to confirm your account'
                };
            } else {
                throw new Error('Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    async logout() {
        try {
            // Use Supabase logout directly
            const { error } = await window.supabase.auth.signOut();

            if (error) {
                console.warn('Supabase logout warning:', error.message);
            } else {
                console.log('Logged out successfully');
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            window.location.href = '/index.html';
        }
    }

    async refreshToken() {
        try {
            // Supabase handles token refresh automatically
            // Just check if we have a valid session
            const { data: { session }, error } = await window.supabase.auth.getSession();

            if (error) {
                throw new Error('Session check failed: ' + error.message);
            }

            if (session && session.access_token) {
                this.setAuthToken(session.access_token);
                if (session.user) {
                    this.setUserData(session.user);
                }
                console.log('Token refreshed successfully');
                return { success: true };
            } else {
                throw new Error('No valid session found');
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearAuth();
            throw error;
        }
    }

    async validateToken() {
        try {
            // Check if Supabase client is available
            if (!window.supabase) {
                console.warn('Supabase client not available, falling back to basic token check');
                // Fallback: just check if we have a token in localStorage
                const token = localStorage.getItem('khizr_assistant_auth');
                return !!token;
            }

            // Use Supabase to validate the current session
            const { data: { session }, error } = await window.supabase.auth.getSession();

            if (error) {
                console.error('Session validation error:', error.message);
                return false;
            }

            const isValid = session && session.access_token && !this.isTokenExpired(session);
            console.log('Token validation result:', isValid);
            return isValid;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    isTokenExpired(session) {
        if (!session || !session.expires_at) {
            return true;
        }

        // Check if token expires within next 5 minutes
        const expiresAt = new Date(session.expires_at * 1000);
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

        return expiresAt <= fiveMinutesFromNow;
    }

    setAuthToken(token) {
        localStorage.setItem('khizr_assistant_auth', token);
        this.isAuthenticated = true;
    }

    setUserData(user) {
        this.currentUser = user;
        localStorage.setItem('user_data', JSON.stringify(user));
    }

    getAuthToken() {
        return localStorage.getItem('khizr_assistant_auth');
    }

    getUserData() {
        return this.currentUser;
    }

    getAuthHeaders() {
        const token = this.getAuthToken();
        if (!token) {
            throw new Error('No authentication token available');
        }
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    clearAuth() {
        localStorage.removeItem('khizr_assistant_auth');
        localStorage.removeItem('user_data');
        this.currentUser = null;
        this.isAuthenticated = false;
    }

    isLoggedIn() {
        return this.isAuthenticated && !!this.getAuthToken();
    }

    getUserId() {
        return this.currentUser?.id || null;
    }

    getUsername() {
        return this.currentUser?.username || null;
    }

    getUserEmail() {
        return this.currentUser?.email || null;
    }

    hasRole(role) {
        return this.currentUser?.roles?.includes(role) || false;
    }

    hasPermission(permission) {
        return this.currentUser?.permissions?.includes(permission) || false;
    }

    // Auto-refresh token before expiration
    startTokenRefreshTimer() {
        // Refresh token 5 minutes before expiration
        const refreshInterval = 55 * 60 * 1000; // 55 minutes
        setInterval(async () => {
            if (this.isLoggedIn()) {
                try {
                    await this.refreshToken();
                } catch (error) {
                    console.warn('Failed to refresh token:', error);
                }
            }
        }, refreshInterval);
    }

    // Check authentication on app initialization
    async checkAppAuth() {
        console.log('Checking app authentication...');

        if (!this.isLoggedIn()) {
            console.log('Not logged in, redirecting to login');
            window.location.href = '/';
            return false;
        }

        // Validate token with server
        const isValid = await this.validateToken();
        if (!isValid) {
            console.log('Token validation failed, clearing auth and redirecting');
            this.clearAuth();
            window.location.href = '/';
            return false;
        }

        console.log('Authentication check passed');
        return true;
    }
}

// Create and export singleton instance
const authManager = new AuthManager();
window.Auth = authManager; // Make available globally for backward compatibility

// Legacy function for backward compatibility
function getAuthHeaders() {
    return authManager.getAuthHeaders();
}

function checkAppAuth() {
    return authManager.checkAppAuth();
}
