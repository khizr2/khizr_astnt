// KHIZR FRONTEND CONTINUATION - Gmail and remaining functions

// Gmail functionality (simplified with error handling)
async function connectGmail() {
    const connectBtn = safeGetElement('gmailConnectBtn');
    const refreshBtn = safeGetElement('refreshEmailsBtn');
    const status = safeGetElement('emailStatus');

    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
    }
    
    if (status) {
        status.textContent = 'Authenticating with Gmail...';
    }

    try {
        const response = await fetch(`${API_URL}/gmail/connect`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            if (connectBtn) connectBtn.style.display = 'none';
            if (refreshBtn) refreshBtn.style.display = 'inline-block';
            if (status) status.textContent = 'Connected to Gmail ✓';
            await loadEmails();
        } else {
            throw new Error('Failed to connect');
        }
    } catch (error) {
        console.warn('Gmail connection failed:', error);
        if (status) status.textContent = 'Connection failed. Please try again.';
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect Gmail';
        }
    }
}

async function loadEmails() {
    const status = safeGetElement('emailStatus');
    if (status) status.textContent = 'Loading emails...';

    try {
        const response = await fetch(`${API_URL}/gmail/messages`, {
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const data = await response.json();
            displayEmails(data.messages || []);
            if (status) status.textContent = `Loaded ${data.messages?.length || 0} emails`;
        } else {
            throw new Error('Failed to load emails');
        }
    } catch (error) {
        console.warn('Email loading error:', error);
        if (status) status.textContent = 'Failed to load emails';
        displayEmails([]); // Show empty state
    }
}

async function refreshEmails() {
    await loadEmails();
}

function displayEmails(emails) {
    const emailsList = safeGetElement('emailsList');
    if (!emailsList) return;

    if (!emails || emails.length === 0) {
        emailsList.innerHTML = '<p>No emails found.</p>';
        return;
    }

    const emailsHTML = emails.map(email => `
        <div class="email-item ${email.unread ? 'unread' : ''}" onclick="openEmail('${email.id}')">
            <div class="email-header">
                <div class="email-from">${escapeHtml(email.from || 'Unknown Sender')}</div>
                <div class="email-date">${formatEmailDate(email.date)}</div>
            </div>
            <div class="email-subject">${escapeHtml(email.subject || 'No Subject')}</div>
            <div class="email-snippet">${escapeHtml(email.snippet || '')}</div>
        </div>
    `).join('');

    emailsList.innerHTML = emailsHTML;
}

function formatEmailDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    } catch (error) {
        return 'Unknown date';
    }
}

function openEmail(emailId) {
    console.log('Opening email:', emailId);
    // TODO: Implement email detail view
    showErrorMessage('Email detail view coming soon!');
}

// Authentication and session management
function logout() {
    localStorage.removeItem('khizr_assistant_gate');
    localStorage.removeItem('khizr_assistant_auth');
    localStorage.removeItem('khizr_processed_tasks');
    localStorage.removeItem('khizr_processed_projects');
    window.location.href = 'index.html';
}

function checkAppAuth() {
    const gateAuth = localStorage.getItem('khizr_assistant_gate');
    if (!gateAuth) {
        console.warn('No gate auth found, redirecting to login');
        window.location.href = 'index.html';
        return false;
    }

    try {
        const authData = JSON.parse(gateAuth);
        if (!authData.authenticated || Date.now() > authData.expires) {
            console.warn('Auth expired, redirecting to login');
            localStorage.removeItem('khizr_assistant_gate');
            window.location.href = 'index.html';
            return false;
        }
        return true;
    } catch (error) {
        console.error('Auth data corrupted:', error);
        localStorage.removeItem('khizr_assistant_gate');
        window.location.href = 'index.html';
        return false;
    }
}

// Event listeners and initialization
function setupEventListeners() {
    // Close modals on escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay');
            modals.forEach(modal => {
                if (modal.style.display === 'flex') {
                    modal.style.display = 'none';
                }
            });
        }
    });

    // Close modals on outside click
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.style.display = 'none';
        }
    });

    // Handle form submissions to prevent page reload
    const taskForm = document.querySelector('#addTaskModal form');
    const projectForm = document.querySelector('#addProjectModal form');
    
    if (taskForm) {
        taskForm.addEventListener('submit', submitTask);
    }
    
    if (projectForm) {
        projectForm.addEventListener('submit', submitProject);
    }

    // Add error boundary for unhandled errors
    window.addEventListener('error', function(event) {
        console.error('Unhandled error:', event.error);
        showErrorMessage('An unexpected error occurred. Please refresh the page.');
    });

    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection:', event.reason);
        showErrorMessage('A network error occurred. Please check your connection.');
    });
}

// Data sync utilities
function syncLocalData() {
    // This function would sync local data with the server when connection is restored
    // For now, we'll just log that sync is needed
    const hasLocalTasks = localStorage.getItem('khizr_processed_tasks');
    const hasLocalProjects = localStorage.getItem('khizr_processed_projects');
    
    if (hasLocalTasks || hasLocalProjects) {
        console.log('Local data detected - sync needed when server is available');
        // TODO: Implement actual sync logic
    }
}

// Performance monitoring
function trackPerformance() {
    if (window.performance && window.performance.mark) {
        window.performance.mark('khizr-app-loaded');
        
        // Log initialization time
        setTimeout(() => {
            try {
                const loadTime = performance.now();
                console.log(`Khizr Assistant loaded in ${Math.round(loadTime)}ms`);
            } catch (error) {
                // Silently fail if performance API not available
            }
        }, 100);
    }
}

// Main initialization function
function initializeKhizrApp() {
    console.log('🚀 Starting Khizr Assistant initialization...');
    
    try {
        // Check authentication first
        if (!checkAppAuth()) {
            return; // Will redirect to login
        }
        
        // Set up error handling and event listeners
        setupEventListeners();
        
        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'purple';
        setTheme(savedTheme);
        
        // Initialize the main app
        initializeApp();
        
        // Sync any local data
        syncLocalData();
        
        // Track performance
        trackPerformance();
        
        console.log('✅ Khizr Assistant initialization complete');
        
    } catch (error) {
        console.error('❌ Failed to initialize Khizr Assistant:', error);
        showErrorMessage('Failed to initialize the application. Please refresh the page.');
    }
}

// Service worker registration for offline support (if needed)
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

// Health check function
async function healthCheck() {
    try {
        const response = await fetch(`${API_URL}/health`, {
            headers: getAuthHeaders(),
            timeout: 5000
        });
        
        if (response.ok) {
            console.log('✅ API health check passed');
            return true;
        } else {
            console.warn('⚠️ API health check failed');
            return false;
        }
    } catch (error) {
        console.warn('⚠️ API not reachable:', error.message);
        return false;
    }
}

// Periodic health checks
function startHealthChecks() {
    // Check API health every 5 minutes
    setInterval(async () => {
        const isHealthy = await healthCheck();
        if (!isHealthy && isInitialized) {
            console.warn('API appears to be down, switching to offline mode');
            // Could show an offline indicator here
        }
    }, 300000); // 5 minutes
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM loaded, initializing Khizr Assistant...');
    
    // Add a small delay to ensure all resources are loaded
    setTimeout(() => {
        initializeKhizrApp();
        startHealthChecks();
        // registerServiceWorker(); // Uncomment if you want offline support
    }, 100);
});

// Export functions for global access (if needed)
window.KhizrAssistant = {
    showView,
    setTheme,
    showAddTaskModal,
    showAddProjectModal,
    closeModal,
    processAINote,
    sendChatMessage,
    connectGmail,
    refreshEmails,
    logout
};

// Debug helpers (only in development)
if (window.location.hostname === 'localhost' || window.location.hostname.includes('netlify')) {
    window.KhizrDebug = {
        loadTasks,
        loadProjects,
        loadAgents: loadAgentStatus,
        loadApprovals,
        agents,
        isInitialized,
        healthCheck,
        showErrorMessage
    };
    
    console.log('🔧 Debug helpers available at window.KhizrDebug');
}

// Console welcome message
console.log(`
🤖 Khizr Assistant v1.0
━━━━━━━━━━━━━━━━━━━━━━━
✨ Intelligent agent system loaded
🔧 Debug mode: ${window.location.hostname === 'localhost' ? 'ON' : 'OFF'}
📡 API endpoint: ${API_URL}
━━━━━━━━━━━━━━━━━━━━━━━
`);
