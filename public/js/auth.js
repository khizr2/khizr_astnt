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
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            if (data.success && data.token) {
                this.setAuthToken(data.token);
                if (data.user) {
                    this.setUserData(data.user);
                }
                return { success: true, user: data.user };
            } else {
                throw new Error('Invalid login response');
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async register(userData) {
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            if (data.success && data.token) {
                this.setAuthToken(data.token);
                if (data.user) {
                    this.setUserData(data.user);
                }
                return { success: true, user: data.user };
            } else {
                throw new Error('Invalid registration response');
            }
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    async logout() {
        try {
            // Call logout endpoint if available
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: this.getAuthHeaders()
            }).catch(() => {
                // Ignore logout endpoint errors
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            window.location.href = '/login.html';
        }
    }

    async refreshToken() {
        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();

            if (data.success && data.token) {
                this.setAuthToken(data.token);
                return { success: true };
            } else {
                throw new Error('Token refresh failed');
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearAuth();
            throw error;
        }
    }

    async validateToken() {
        try {
            const response = await fetch('/api/auth/validate', {
                headers: this.getAuthHeaders()
            });

            const data = await response.json();
            return data.success === true;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
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
        if (!this.isLoggedIn()) {
            window.location.href = '/login.html';
            return false;
        }

        // Validate token with server
        const isValid = await this.validateToken();
        if (!isValid) {
            this.clearAuth();
            window.location.href = '/login.html';
            return false;
        }

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
