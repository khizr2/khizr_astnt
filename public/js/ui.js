// UI Management and User Feedback
class UIManager {
    constructor() {
        this.modals = new Map();
        this.notifications = [];
        this.loadingStates = new Map();
        this.init();
    }

    init() {
        this.setupGlobalErrorHandling();
        this.setupKeyboardShortcuts();
        this.setupResponsiveFeatures();
    }

    // Toast Notifications
    showToast(message, type = 'info', duration = 4000) {
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            warning: '#F59E0B',
            info: '#3B82F6',
            smart: '#8B5CF6'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
            max-width: 400px;
            word-wrap: break-word;
        `;

        toast.innerHTML = message;
        document.body.appendChild(toast);

        // Auto-remove after duration
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, duration);

        // Store for potential manual removal
        this.notifications.push(toast);
        return toast;
    }

    showSuccess(message, duration = 4000) {
        return this.showToast(message, 'success', duration);
    }

    showError(message, duration = 6000) {
        return this.showToast(message, 'error', duration);
    }

    showWarning(message, duration = 5000) {
        return this.showToast(message, 'warning', duration);
    }

    showInfo(message, duration = 4000) {
        return this.showToast(message, 'info', duration);
    }

    // Modal Management
    showModal(title, content, options = {}) {
        const modalId = `modal-${Date.now()}`;

        const modalHTML = `
            <div id="${modalId}" class="modal-overlay" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
                backdrop-filter: blur(5px);
                animation: fadeIn 0.3s ease;
            ">
                <div class="modal-content" style="
                    background: var(--bg-card);
                    border-radius: 16px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: var(--shadow-glass);
                    border: 1px solid var(--border-glass);
                    position: relative;
                ">
                    <div class="modal-header" style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 16px;
                        border-bottom: 1px solid var(--border);
                    ">
                        <h3 style="margin: 0; color: var(--text-primary);">${title}</h3>
                        <button class="modal-close" style="
                            background: none;
                            border: none;
                            color: var(--text-secondary);
                            font-size: 24px;
                            cursor: pointer;
                            padding: 4px;
                            border-radius: 4px;
                            transition: all 0.2s ease;
                        ">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById(modalId);
        const closeBtn = modal.querySelector('.modal-close');

        const closeModal = () => {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
            this.modals.delete(modalId);
        };

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        this.modals.set(modalId, { modal, closeModal });
        return modalId;
    }

    closeModal(modalId) {
        const modalData = this.modals.get(modalId);
        if (modalData) {
            modalData.closeModal();
        }
    }

    closeAllModals() {
        this.modals.forEach(modalData => modalData.closeModal());
    }

    // Loading States
    showLoading(elementId, message = 'Loading...') {
        const element = document.getElementById(elementId);
        if (!element) return;

        const loadingId = `loading-${elementId}`;

        // Remove existing loading state
        this.hideLoading(elementId);

        const loadingHTML = `
            <div id="${loadingId}" class="loading-overlay" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(15, 15, 35, 0.8);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                border-radius: 8px;
                backdrop-filter: blur(5px);
            ">
                <div class="loading-spinner" style="
                    width: 40px;
                    height: 40px;
                    border: 3px solid var(--border);
                    border-top: 3px solid var(--primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 12px;
                "></div>
                <div style="color: var(--text-secondary); font-size: 14px;">${message}</div>
            </div>
        `;

        element.style.position = 'relative';
        element.insertAdjacentHTML('beforeend', loadingHTML);
        this.loadingStates.set(elementId, loadingId);
    }

    hideLoading(elementId) {
        const loadingId = this.loadingStates.get(elementId);
        if (loadingId) {
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) {
                loadingElement.parentNode.removeChild(loadingElement);
            }
            this.loadingStates.delete(elementId);
        }
    }

    // Error Handling
    async handleError(error, context = '') {
        console.error(`Error${context ? ` in ${context}` : ''}:`, error);

        let userMessage = 'An unexpected error occurred. Please try again.';
        let type = 'error';

        if (error.message) {
            if (error.message.includes('Network')) {
                userMessage = 'Network connection error. Please check your internet connection.';
            } else if (error.message.includes('401') || error.message.includes('403')) {
                userMessage = 'Authentication error. Please log in again.';
                type = 'warning';
                // Redirect to login after a delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            } else if (error.message.includes('404')) {
                userMessage = 'The requested resource was not found.';
            } else if (error.message.includes('500')) {
                userMessage = 'Server error. Please try again later.';
            } else if (error.message.includes('timeout')) {
                userMessage = 'Request timed out. Please try again.';
            } else {
                userMessage = error.message;
            }
        }

        this.showToast(userMessage, type);

        // Log error for monitoring
        this.logError(error, context);
    }

    logError(error, context) {
        // In production, this would send to error monitoring service
        const errorData = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // Store in localStorage for debugging (in production, send to server)
        const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
        errors.push(errorData);
        localStorage.setItem('app_errors', JSON.stringify(errors.slice(-10))); // Keep last 10 errors
    }

    // Confirmation Dialogs
    async confirm(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            const content = `
                <div style="text-align: center;">
                    <p style="margin-bottom: 20px; color: var(--text-primary);">${message}</p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button id="confirm-yes" class="add-btn" style="padding: 8px 16px; font-size: 14px;">Yes</button>
                        <button id="confirm-no" class="btn-secondary" style="padding: 8px 16px; font-size: 14px;">No</button>
                    </div>
                </div>
            `;

            const modalId = this.showModal(title, content);

            document.getElementById('confirm-yes').addEventListener('click', () => {
                this.closeModal(modalId);
                resolve(true);
            });

            document.getElementById('confirm-no').addEventListener('click', () => {
                this.closeModal(modalId);
                resolve(false);
            });
        });
    }

    // Theme Management
    setTheme(theme) {
        document.documentElement.className = `theme-${theme}`;
        localStorage.setItem('theme', theme);
    }

    getTheme() {
        return localStorage.getItem('theme') || 'purple';
    }

    toggleTheme() {
        const currentTheme = this.getTheme();
        const newTheme = currentTheme === 'purple' ? 'red' : 'purple';
        this.setTheme(newTheme);
        this.showInfo(`Switched to ${newTheme} theme`);
    }

    // Responsive Features
    setupResponsiveFeatures() {
        // Handle mobile menu
        const handleResize = () => {
            const isMobile = window.innerWidth < 768;
            document.body.classList.toggle('mobile', isMobile);
        };

        window.addEventListener('resize', handleResize);
        handleResize();
    }

    // Keyboard Shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K: Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]');
                if (searchInput) {
                    searchInput.focus();
                }
            }

            // Escape: Close modals
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // Global Error Handling
    setupGlobalErrorHandling() {
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, 'Unhandled Promise Rejection');
            event.preventDefault();
        });

        window.addEventListener('error', (event) => {
            this.handleError(event.error, 'JavaScript Error');
        });

        // Handle offline/online status
        window.addEventListener('online', () => {
            this.showSuccess('Connection restored');
        });

        window.addEventListener('offline', () => {
            this.showWarning('You are currently offline');
        });
    }

    // Utility Methods
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// Create and export singleton instance
const uiManager = new UIManager();
window.UI = uiManager; // Make available globally for backward compatibility

// Legacy functions for backward compatibility
function showToast(message, type = 'info') {
    return uiManager.showToast(message, type);
}

function showModal(title, content) {
    return uiManager.showModal(title, content);
}
