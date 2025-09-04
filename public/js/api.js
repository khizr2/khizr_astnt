// API Configuration and Client
class APIClient {
    constructor() {
        // Environment-based configuration - fallback to current host if env not set
        this.baseURL = this.getAPIURL();
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    getAPIURL() {
        // Check for environment variable first, then fallback to current origin
        if (window.API_BASE_URL) {
            return window.API_BASE_URL;
        }

        // In development, use localhost
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000';
        }

        // In production, construct from current origin
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';

        return `${protocol}//${hostname}${port}`;
    }

    getAuthHeaders() {
        const token = localStorage.getItem('khizr_assistant_auth');
        if (!token) {
            throw new Error('No authentication token found');
        }
        return {
            ...this.defaultHeaders,
            'Authorization': `Bearer ${token}`
        };
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: this.getAuthHeaders(),
            ...options
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);

            // Handle specific error types
            if (error.message.includes('401')) {
                this.handleAuthError();
            } else if (error.message.includes('500')) {
                throw new Error('Server error. Please try again later.');
            } else if (!navigator.onLine) {
                throw new Error('Network connection lost. Please check your internet connection.');
            }

            throw error;
        }
    }

    handleAuthError() {
        // Clear invalid token and redirect to login
        localStorage.removeItem('khizr_assistant_auth');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }

    // Agent endpoints
    async getAgents() {
        return this.request('/api/agents');
    }

    async getAgentById(id) {
        return this.request(`/api/agents/${id}`);
    }

    async updateAgent(id, data) {
        return this.request(`/api/agents/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    // Task endpoints
    async getTasks(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/api/tasks?${queryString}` : '/api/tasks';
        return this.request(endpoint);
    }

    async createTask(taskData) {
        return this.request('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
    }

    async updateTaskStatus(taskId, status) {
        return this.request(`/api/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    }

    async deleteTask(taskId) {
        return this.request(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
    }

    // Project endpoints
    async getProjects(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/api/projects?${queryString}` : '/api/projects';
        return this.request(endpoint);
    }

    async getProjectById(id) {
        return this.request(`/api/projects/${id}`);
    }

    async createProject(projectData) {
        return this.request('/api/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
    }

    async updateProject(id, data) {
        return this.request(`/api/projects/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    async deleteProject(id) {
        return this.request(`/api/projects/${id}`, {
            method: 'DELETE'
        });
    }

    // Chat endpoints
    async getChatHistory() {
        return this.request('/api/chat/history');
    }

    async sendChatMessage(message, context = {}) {
        return this.request('/api/chat/process', {
            method: 'POST',
            body: JSON.stringify({ message, context })
        });
    }

    async submitChatFeedback(feedbackData) {
        return this.request('/api/chat/feedback', {
            method: 'POST',
            body: JSON.stringify(feedbackData)
        });
    }

    // Gmail endpoints
    async connectGmail() {
        return this.request('/api/gmail/connect');
    }

    async getGmailMessages(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/api/gmail/messages?${queryString}` : '/api/gmail/messages';
        return this.request(endpoint);
    }

    // Approval endpoints
    async getPendingApprovals() {
        return this.request('/api/agents/approvals/pending');
    }

    async approveAction(approvalId, approved = true) {
        return this.request(`/api/approvals/${approvalId}`, {
            method: 'POST',
            body: JSON.stringify({ approved })
        });
    }

    async testApprovalSystem() {
        return this.request('/api/agents/approvals/test', {
            method: 'POST'
        });
    }

    // Pattern and preference endpoints
    async getPatternAnalysis() {
        return this.request('/api/agents/patterns/analyze');
    }

    async submitPatternFeedback(patternType, feedback) {
        return this.request('/api/agents/patterns/feedback', {
            method: 'POST',
            body: JSON.stringify({ pattern_type: patternType, feedback })
        });
    }

    async getUserPreferences() {
        return this.request('/api/user/preferences');
    }

    async updateUserPreference(preferenceName, value) {
        return this.request(`/api/user/preferences/${preferenceName}`, {
            method: 'PUT',
            body: JSON.stringify({ value })
        });
    }

    async resetUserPreferences() {
        return this.request('/api/user/preferences/reset', {
            method: 'POST'
        });
    }

    // Daddy Agent endpoints
    async getDaddySuggestions() {
        return this.request('/api/agents/daddy/suggestions');
    }

    async getDaddyStatus() {
        return this.request('/api/agents/daddy/status');
    }

    async updateDaddyConfig(config) {
        return this.request('/api/agents/daddy/config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    async getDaddyAnalytics() {
        return this.request('/api/agents/daddy/analytics');
    }
}

// Create and export singleton instance
const apiClient = new APIClient();
window.API = apiClient; // Make available globally for backward compatibility
