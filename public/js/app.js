// Main Application Logic
class KhizrAssistant {
    constructor() {
        this.agents = [];
        this.currentUser = null;
        this.notifications = 0;
        this.pendingApprovals = [];
        this.currentView = 'today';
        this.chatTabs = new Map();

        this.init();
    }

    async init() {
        try {
            console.log('Initializing Khizr Assistant app...');

            // Check authentication first
            const isAuthenticated = await window.Auth.checkAppAuth();
            if (!isAuthenticated) {
                console.log('Authentication failed, stopping initialization');
                return;
            }

            console.log('Authentication passed, continuing with app setup...');

            // Initialize UI
            this.setupEventListeners();
            this.loadSavedTheme();

            // Initialize app data
            await this.initializeApp();

            // Setup periodic updates
            this.setupPeriodicUpdates();

            // Setup navigation
            this.setupNavigation();

            console.log('App initialization completed successfully');
            window.UI.showSuccess('Welcome to Khizr Assistant!');
        } catch (error) {
            console.error('App initialization error:', error);
            window.UI.handleError(error, 'App Initialization');
        }
    }

    async initializeApp() {
        try {
            await Promise.all([
                this.loadAgentStatus(),
                this.loadTasks(),
                this.loadProjects(),
                this.loadApprovals(),
                this.loadChatHistory(),
                this.loadUserPreferences(),
                this.loadPatternData()
            ]);

            this.updateDateDisplay();
            this.initializeChatTabs();
        } catch (error) {
            window.UI.handleError(error, 'Data Loading');
        }
    }

    setupEventListeners() {
        // Theme toggle
        const themeBtns = document.querySelectorAll('.theme-btn');
        themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.classList.contains('purple') ? 'purple' : 'red';
                window.UI.setTheme(theme);
            });
        });

        // Logout
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Search functionality
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(this.handleSearch.bind(this), 300));
        }
    }

    loadSavedTheme() {
        const savedTheme = window.UI.getTheme();
        window.UI.setTheme(savedTheme);
    }

    setupPeriodicUpdates() {
        // Update agent status every 30 seconds
        setInterval(() => this.loadAgentStatus(), 30000);

        // Check for approvals every minute
        setInterval(() => this.loadApprovals(), 60000);

        // Update pattern data every 5 minutes
        setInterval(() => {
            this.loadPatternData();
        }, 300000);
    }

    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.dataset.view || e.target.textContent.toLowerCase().replace(' ', '');
                this.switchView(view);
            });
        });
    }

    switchView(view) {
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const buttons = document.querySelectorAll('.nav-btn');
        const activeBtn = Array.from(buttons).find(btn => {
            const dataView = btn.dataset.view || btn.textContent.trim().toLowerCase().replace(/\s+/g, '');
            return dataView === view;
        });
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Hide all views
        document.querySelectorAll('.view').forEach(viewEl => {
            viewEl.style.display = 'none';
        });

        // Show selected view
        const targetView = document.getElementById(`${view}View`) ||
                          document.querySelector(`[data-view="${view}"]`);
        if (targetView) {
            targetView.style.display = 'block';
        }

        this.currentView = view;

        // Load view-specific data
        this.loadViewData(view);
    }

    async loadViewData(view) {
        try {
            switch (view) {
                case 'today':
                    await this.loadTasks();
                    break;
                case 'projects':
                    await this.loadProjectsPage();
                    break;
                case 'agents':
                    await this.loadAgentsPage();
                    break;
                case 'chat':
                    await this.loadChatHistory();
                    break;
                case 'email':
                    await this.loadEmailPage();
                    break;
                case 'goals':
                    await this.loadGoalsPage();
                    break;
                case 'insights':
                    await this.loadInsightsPage();
                    break;
                case 'mind':
                    // Mind page functionality
                    break;
                case 'bigpage':
                    // Big page functionality
                    break;
            }
        } catch (error) {
            window.UI.handleError(error, `Loading ${view} data`);
        }
    }

    // Agent Management
    async loadAgentStatus() {
        try {
            window.UI.showLoading('agentCards', 'Loading agents...');
            const response = await window.API.getAgents();

            if (response.success) {
                this.agents = response.agents;
                this.updateAgentIndicators();
                this.updateAgentCards();
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Agent Status');
        } finally {
            window.UI.hideLoading('agentCards');
        }
    }

    updateAgentIndicators() {
        this.agents.forEach(agent => {
            const indicator = document.getElementById(`${agent.name}Agent`);
            if (indicator) {
                indicator.className = `agent-indicator ${agent.status}`;
            }
        });
    }

    updateAgentCards() {
        const agentCards = document.getElementById('agentCards');
        if (!agentCards) return;

        const cardsHTML = this.agents.map(agent => `
            <div class="agent-card ${agent.status}" data-agent-id="${agent.id}">
                <div class="agent-name">${agent.display_name}</div>
                <div class="agent-task">${agent.status === 'busy' ? 'Working on task...' : agent.status}</div>
                <div class="agent-actions">
                    <button class="btn-secondary" onclick="app.showAgentDetails('${agent.id}')">Details</button>
                </div>
            </div>
        `).join('');

        agentCards.innerHTML = cardsHTML;
    }

    showAgentDetails(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;

        const content = `
            <div class="agent-details">
                <div class="agent-status-large">
                    <div class="agent-indicator ${agent.status}"></div>
                    <span>${agent.status.toUpperCase()}</span>
                </div>
                <div class="agent-info">
                    <p><strong>Name:</strong> ${agent.display_name}</p>
                    <p><strong>Type:</strong> ${agent.type}</p>
                    <p><strong>Last Active:</strong> ${new Date(agent.last_active).toLocaleString()}</p>
                    <p><strong>Tasks Completed:</strong> ${agent.tasks_completed || 0}</p>
                </div>
                <div class="agent-capabilities">
                    <h4>Capabilities:</h4>
                    <ul>
                        ${agent.capabilities?.map(cap => `<li>${cap}</li>`).join('') || '<li>No capabilities listed</li>'}
                    </ul>
                </div>
            </div>
        `;

        window.UI.showModal(`${agent.display_name} Details`, content);
    }

    // Task Management
    async loadTasks() {
        try {
            window.UI.showLoading('tasksList', 'Loading tasks...');
            const response = await window.API.getTasks({ limit: 10 });

            if (response.success) {
                this.displayTasks(response.tasks);
                this.displayRunningTasks(response.tasks);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Tasks');
        } finally {
            window.UI.hideLoading('tasksList');
        }
    }

    displayTasks(tasks) {
        const tasksList = document.getElementById('tasksList');
        if (!tasksList) return;

        if (tasks.length === 0) {
            tasksList.innerHTML = '<li style="color: var(--text-secondary); font-style: italic;">No tasks yet. Create one above!</li>';
            return;
        }

        const tasksHTML = tasks.map(task => `
            <li class="task-item ${task.priority === 'urgent' ? 'urgent' : ''}" data-task-id="${task.id}">
                <span class="task-title">${this.escapeHtml(task.title)}</span>
                ${task.priority === 'urgent' ? '<span class="task-priority urgent">URGENT</span>' : ''}
                ${task.task_type === 'agent' ? '<span class="task-priority research">AGENT</span>' : ''}
                <div class="task-actions">
                    <button class="task-action-btn" onclick="app.completeTask('${task.id}')" title="Complete">✓</button>
                    <button class="task-action-btn" onclick="app.editTask('${task.id}')" title="Edit">✏️</button>
                    <button class="task-action-btn" onclick="app.deleteTask('${task.id}')" title="Delete">🗑️</button>
                </div>
            </li>
        `).join('');

        tasksList.innerHTML = tasksHTML;
    }

    displayRunningTasks(tasks) {
        const runningTasksContainer = document.getElementById('runningTasks');
        if (!runningTasksContainer) return;

        const runningTasks = tasks.filter(task =>
            task.status === 'pending' &&
            (task.task_type === 'agent' || task.created_at)
        ).slice(0, 3);

        if (runningTasks.length === 0) {
            runningTasksContainer.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; font-size: 12px;">No tasks running</div>';
            return;
        }

        const runningHTML = runningTasks.map(task => `
            <div class="running-task-item">
                <div class="running-task-indicator">🔄</div>
                <div class="running-task-info">
                    <div class="running-task-title">${this.escapeHtml(task.title)}</div>
                    <div class="running-task-status">${task.task_type === 'agent' ? 'Agent Processing' : 'Pending'}</div>
                </div>
            </div>
        `).join('');

        runningTasksContainer.innerHTML = runningHTML;
    }

    async createTask() {
        const taskInput = document.getElementById('taskInput');
        const prioritySelect = document.getElementById('taskPriority');

        if (!taskInput || !taskInput.value.trim()) {
            window.UI.showWarning('Please enter a task description');
            return;
        }

        try {
            window.UI.showLoading('taskInput', 'Creating task...');

            const taskData = {
                title: taskInput.value.trim(),
                priority: prioritySelect?.value || 'normal',
                task_type: 'manual'
            };

            const response = await window.API.createTask(taskData);

            if (response.success) {
                taskInput.value = '';
                await this.loadTasks();
                window.UI.showSuccess('Task created successfully!');
            }
        } catch (error) {
            window.UI.handleError(error, 'Creating Task');
        } finally {
            window.UI.hideLoading('taskInput');
        }
    }

    async completeTask(taskId) {
        try {
            const response = await window.API.updateTaskStatus(taskId, 'completed');

            if (response.success) {
                await this.loadTasks();
                window.UI.showSuccess('Task completed!');
            }
        } catch (error) {
            window.UI.handleError(error, 'Completing Task');
        }
    }

    async deleteTask(taskId) {
        const confirmed = await window.UI.confirm('Are you sure you want to delete this task?');
        if (!confirmed) return;

        try {
            const response = await window.API.deleteTask(taskId);

            if (response.success) {
                await this.loadTasks();
                window.UI.showSuccess('Task deleted successfully!');
            }
        } catch (error) {
            window.UI.handleError(error, 'Deleting Task');
        }
    }

    // Project Management
    async loadProjects() {
        try {
            window.UI.showLoading('projectsList', 'Loading projects...');
            const response = await window.API.getProjects({ limit: 5 });

            if (response.success) {
                this.displayProjects(response);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Projects');
        } finally {
            window.UI.hideLoading('projectsList');
        }
    }

    showAddProjectModal() {
        const modal = document.getElementById('addProjectModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    async submitProject(event) {
        event.preventDefault();

        const titleInput = document.getElementById('projectName');
        const descriptionInput = document.getElementById('projectDescription');
        const dueDateInput = document.getElementById('projectDueDate');

        if (!titleInput || !titleInput.value.trim()) {
            window.UI.showWarning('Please enter a project name');
            return;
        }

        try {
            window.UI.showLoading('addProjectModal', 'Creating project...');

            const projectData = {
                title: titleInput.value.trim(),
                description: descriptionInput?.value?.trim() || null,
                deadline: dueDateInput?.value || null,
                priority: 3,
                category: 'personal',
                project_type: 'project'
            };

            const response = await window.API.createProject(projectData);

            if (response.success) {
                // Clear form
                titleInput.value = '';
                if (descriptionInput) descriptionInput.value = '';
                if (dueDateInput) dueDateInput.value = '';

                // Close modal
                this.closeModal('addProjectModal');

                // Reload projects
                await this.loadProjects();

                window.UI.showSuccess('Project created successfully!');
            }
        } catch (error) {
            window.UI.handleError(error, 'Creating Project');
        } finally {
            window.UI.hideLoading('addProjectModal');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async viewProject(projectId) {
        try {
            const response = await window.API.getProjectById(projectId);

            if (response.success) {
                const project = response;
                let content = `
                    <div class="project-details">
                        <h3>${this.escapeHtml(project.title)}</h3>
                        ${project.description ? `<p><strong>Description:</strong> ${this.escapeHtml(project.description)}</p>` : ''}
                        <p><strong>Priority:</strong> ${project.priority || 'Normal'}</p>
                        <p><strong>Category:</strong> ${project.category || 'Personal'}</p>
                        <p><strong>Status:</strong> ${project.status || 'Active'}</p>
                        ${project.deadline ? `<p><strong>Due Date:</strong> ${new Date(project.deadline).toLocaleDateString()}</p>` : ''}
                        <p><strong>Created:</strong> ${new Date(project.created_at).toLocaleDateString()}</p>
                        <p><strong>Tasks:</strong> ${project.tasks?.length || 0}</p>
                    </div>
                `;

                window.UI.showModal(`Project: ${project.title}`, content);
            }
        } catch (error) {
            window.UI.handleError(error, 'Viewing Project');
        }
    }

    async editProject(projectId) {
        try {
            const response = await window.API.getProjectById(projectId);

            if (response.success) {
                const project = response;

                const content = `
                    <form onsubmit="app.updateProject(event, '${projectId}')">
                        <div class="form-group">
                            <label class="form-label">Project Name</label>
                            <input type="text" class="form-input" id="editProjectName" value="${this.escapeHtml(project.title)}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Description</label>
                            <textarea class="form-textarea" id="editProjectDescription">${this.escapeHtml(project.description || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Priority</label>
                            <select class="form-input" id="editProjectPriority">
                                <option value="1" ${project.priority === 1 ? 'selected' : ''}>High</option>
                                <option value="2" ${project.priority === 2 ? 'selected' : ''}>Medium-High</option>
                                <option value="3" ${project.priority === 3 ? 'selected' : ''}>Normal</option>
                                <option value="4" ${project.priority === 4 ? 'selected' : ''}>Low</option>
                                <option value="5" ${project.priority === 5 ? 'selected' : ''}>Very Low</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Due Date</label>
                            <input type="date" class="form-input" id="editProjectDueDate" value="${project.deadline ? project.deadline.split('T')[0] : ''}">
                        </div>
                        <div class="form-buttons">
                            <button type="button" class="btn-secondary" onclick="app.closeModal('editProjectModal')">Cancel</button>
                            <button type="submit" class="btn-primary">Update Project</button>
                        </div>
                    </form>
                `;

                window.UI.showModal(`Edit Project: ${project.title}`, content);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Project for Edit');
        }
    }

    async updateProject(event, projectId) {
        event.preventDefault();

        const nameInput = document.getElementById('editProjectName');
        const descriptionInput = document.getElementById('editProjectDescription');
        const priorityInput = document.getElementById('editProjectPriority');
        const dueDateInput = document.getElementById('editProjectDueDate');

        try {
            const updateData = {
                name: nameInput?.value?.trim(),
                description: descriptionInput?.value?.trim(),
                priority: priorityInput?.value ? parseInt(priorityInput.value) : undefined,
                deadline: dueDateInput?.value || undefined
            };

            const response = await window.API.updateProject(projectId, updateData);

            if (response.success) {
                this.closeModal('editProjectModal');
                await this.loadProjects();
                window.UI.showSuccess('Project updated successfully!');
            }
        } catch (error) {
            window.UI.handleError(error, 'Updating Project');
        }
    }

    // Project sorting functions
    sortProjects(criteria) {
        const projectsList = document.getElementById('projectsList');
        if (!projectsList) return;

        const projectItems = Array.from(projectsList.querySelectorAll('.project-item'));

        projectItems.sort((a, b) => {
            const aId = a.dataset.projectId;
            const bId = b.dataset.projectId;

            switch (criteria) {
                case 'name':
                    const aTitle = a.querySelector('.project-title')?.textContent || '';
                    const bTitle = b.querySelector('.project-title')?.textContent || '';
                    return aTitle.localeCompare(bTitle);

                case 'date':
                    // For now, sort by data attribute or just return as-is
                    // You could store creation dates in data attributes
                    return 0;

                case 'priority':
                    const aPriority = parseInt(a.querySelector('.project-priority')?.textContent) || 3;
                    const bPriority = parseInt(b.querySelector('.project-priority')?.textContent) || 3;
                    return aPriority - bPriority;

                default:
                    return 0;
            }
        });

        // Re-append sorted items
        projectItems.forEach(item => projectsList.appendChild(item));

        // Update sort button active states
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.getElementById(`sort${criteria.charAt(0).toUpperCase() + criteria.slice(1)}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    displayProjects(data) {
        const projectsList = document.getElementById('projectsList');
        if (!projectsList) return;

        const projects = data.projects || data;

        if (projects.length === 0) {
            projectsList.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No projects yet. Create one!</div>';
            return;
        }

        const projectsHTML = projects.map(project => `
            <div class="project-item" data-project-id="${project.id}">
                <div class="project-header">
                    <span class="project-title">${this.escapeHtml(project.title)}</span>
                    <span class="project-priority priority-${project.priority || 'normal'}">${(project.priority || 'normal').toUpperCase()}</span>
                </div>
                <div class="project-meta">
                    <span>${project.task_count || 0} tasks</span>
                    <span>${project.completed_tasks || 0} completed</span>
                    ${project.deadline ? `<span>Due: ${new Date(project.deadline).toLocaleDateString()}</span>` : ''}
                </div>
                <div class="project-actions">
                    <button class="btn-secondary" onclick="app.viewProject('${project.id}')">View</button>
                    <button class="btn-secondary" onclick="app.editProject('${project.id}')">Edit</button>
                </div>
            </div>
        `).join('');

        projectsList.innerHTML = projectsHTML;
    }

    // Chat Management
    async loadChatHistory() {
        try {
            const response = await window.API.getChatHistory();

            if (response.success) {
                this.displayChatHistory(response.messages);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Chat History');
        }
    }

    displayChatHistory(messages) {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;

        const messagesHTML = messages.map(message => `
            <div class="chat-message ${message.sender === 'user' ? 'user' : 'assistant'}">
                <div class="message-content">${this.escapeHtml(message.content)}</div>
                <div class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');

        chatContainer.innerHTML = messagesHTML;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput || !messageInput.value.trim()) {
            window.UI.showWarning('Please enter a message');
            return;
        }

        const message = messageInput.value.trim();
        messageInput.value = '';

        try {
            // Add user message to UI immediately
            this.addMessageToChat(message, 'user');

            // Show typing indicator
            this.showTypingIndicator();

            const response = await window.API.sendChatMessage(message);

            // Hide typing indicator
            this.hideTypingIndicator();

            if (response.success) {
                this.addMessageToChat(response.message, 'assistant');

                // Handle project creation from chat
                if (response.project_created) {
                    window.UI.showSuccess(response.project_message || 'Project created successfully!');
                    // Reload projects list if we're on projects view
                    if (this.currentView === 'projects') {
                        setTimeout(() => this.loadProjects(), 1000);
                    }
                }

                // Handle task creation from chat
                if (response.task_created) {
                    window.UI.showSuccess(response.task_message || 'Task created successfully!');
                    // Reload tasks if we're on today view
                    if (this.currentView === 'today') {
                        setTimeout(() => this.loadTasks(), 1000);
                    }
                }
            }
        } catch (error) {
            this.hideTypingIndicator();
            window.UI.handleError(error, 'Sending Message');
        }
    }

    addMessageToChat(content, sender) {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;

        const messageHTML = `
            <div class="chat-message ${sender}">
                <div class="message-content">${this.escapeHtml(content)}</div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        chatContainer.insertAdjacentHTML('beforeend', messageHTML);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    showTypingIndicator() {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;

        const indicatorHTML = `
            <div class="chat-message assistant typing">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;

        chatContainer.insertAdjacentHTML('beforeend', indicatorHTML);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const typingIndicator = document.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.parentElement.remove();
        }
    }

    // Approval Management
    async loadApprovals() {
        try {
            const response = await window.API.getPendingApprovals();

            if (response.success) {
                this.pendingApprovals = response.approvals;
                this.updateApprovalsBadge();
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Approvals');
        }
    }

    updateApprovalsBadge() {
        const badge = document.querySelector('.approvals-btn');
        if (badge) {
            badge.setAttribute('data-count', this.pendingApprovals.length);
        }
    }

    // User Preferences
    async loadUserPreferences() {
        try {
            const response = await window.API.getUserPreferences();

            if (response.success) {
                this.applyUserPreferences(response.preferences);
            }
        } catch (error) {
            // Preferences are optional, don't show error
            console.log('Could not load user preferences:', error);
        }
    }

    applyUserPreferences(preferences) {
        if (preferences.theme) {
            window.UI.setTheme(preferences.theme);
        }

        // Display current preferences in word tree format
        this.displayCurrentPreferences(preferences);
    }

    displayCurrentPreferences(preferences) {
        const container = document.getElementById('currentPreferences');
        if (!container) return;

        if (!preferences || Object.keys(preferences).length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px;">No preferences set yet. They will be learned from your interactions.</p>';
            return;
        }

        let html = '';
        for (const [category, categoryPrefs] of Object.entries(preferences)) {
            html += `<div class="preference-category">
                <h5 style="color: var(--accent-primary); margin-bottom: 8px; font-size: 12px;">${category.toUpperCase()}</h5>`;

            for (const [key, prefData] of Object.entries(categoryPrefs)) {
                const value = typeof prefData === 'object' ? prefData.value : prefData;
                const confidence = typeof prefData === 'object' ? prefData.confidence : null;

                html += `<div class="preference-item" style="margin-bottom: 6px; font-size: 11px;">
                    <span style="color: var(--text-primary); font-weight: 500;">${key.replace(/_/g, ' ')}:</span>
                    <span style="color: var(--text-accent); margin-left: 8px;">${value}</span>`;

                if (confidence) {
                    const confidencePercent = Math.round(confidence * 100);
                    html += `<span style="color: var(--text-secondary); margin-left: 8px; font-size: 10px;">(${confidencePercent}% confident)</span>`;
                }

                html += '</div>';
            }
            html += '</div>';
        }

        container.innerHTML = html;
    }

    // Preference Management Functions
    async resetPreferences() {
        try {
            const response = await window.API.resetUserPreferences();
            if (response.success) {
                window.UI.showNotification('Preferences reset successfully', 'success');
                await this.loadUserPreferences(); // Reload preferences
            } else {
                window.UI.showNotification('Failed to reset preferences', 'error');
            }
        } catch (error) {
            console.error('Error resetting preferences:', error);
            window.UI.showNotification('Error resetting preferences', 'error');
        }
    }

    async updatePreferences() {
        try {
            // Get current preferences
            const response = await window.API.getUserPreferences();
            if (response.success) {
                // For now, just refresh the display
                this.applyUserPreferences(response.preferences);
                window.UI.showNotification('Preferences updated', 'success');
            }
        } catch (error) {
            console.error('Error updating preferences:', error);
            window.UI.showNotification('Error updating preferences', 'error');
        }
    }

    // AI Note Processing
    async processAINote() {
        try {
            const noteInput = document.getElementById('mindNoteInput');
            if (!noteInput || !noteInput.value.trim()) {
                window.UI.showWarning('Please enter a note');
                return;
            }

            const note = noteInput.value.trim();
            const response = await window.API.processAINote(note);

            if (response.success) {
                noteInput.value = '';
                window.UI.showSuccess('Note processed successfully!');
                // Optionally reload mind data if available
                if (this.currentView === 'mind') {
                    setTimeout(() => this.loadMindData && this.loadMindData(), 1000);
                }
            }
        } catch (error) {
            window.UI.handleError(error, 'Processing AI Note');
        }
    }

    // Pattern Intelligence
    async loadPatternData() {
        try {
            const response = await window.API.getPatternAnalysis();

            if (response.success) {
                this.updatePatternIndicators(response.patterns);
                this.loadSmartSuggestions();
            }
        } catch (error) {
            // Pattern data is optional
            console.log('Could not load pattern data:', error);
        }
    }

    updatePatternIndicators(patterns) {
        // Update UI with pattern insights
        const patternContainer = document.getElementById('patternIndicators');
        if (!patternContainer) return;

        // Implementation for pattern indicators
    }

    async loadSmartSuggestions() {
        try {
            const response = await window.API.getDaddySuggestions();

            if (response.success) {
                this.displaySmartSuggestions(response.suggestions);
            }
        } catch (error) {
            console.log('Could not load smart suggestions:', error);
        }
    }

    displaySmartSuggestions(suggestions) {
        // Implementation for smart suggestions
    }

    // Utility Methods
    updateDateDisplay() {
        const dateElement = document.getElementById('currentDate');
        if (dateElement) {
            const now = new Date();
            dateElement.textContent = now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    initializeChatTabs() {
        // Initialize main chat tab
        this.chatTabs.set('main', { messages: [], active: true });
    }

    handleLogout() {
        window.Auth.logout();
    }

    handleSearch(query) {
        // Implement search functionality
        console.log('Searching for:', query);
    }

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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Projects Page Methods
    async loadProjectsPage() {
        try {
            window.UI.showLoading('projectsList', 'Loading projects...');
            const response = await window.API.getProjects();

            if (response.success) {
                this.displayProjectsPage(response.projects || response);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Projects');
        } finally {
            window.UI.hideLoading('projectsList');
        }
    }

    displayProjectsPage(projects) {
        const container = document.getElementById('projectsList');
        if (!container) return;

        if (!projects || projects.length === 0) {
            container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No projects yet. Create one!</div>';
            return;
        }

        const projectsHTML = projects.map(project => `
            <div class="project-item" data-project-id="${project.id}" onclick="window.App.toggleProjectExpansion('${project.id}')">
                <div class="project-name">${this.escapeHtml(project.title)}</div>
            </div>
        `).join('');

        container.innerHTML = projectsHTML;
    }

    async toggleProjectExpansion(projectId) {
        const projectItem = document.querySelector(`[data-project-id="${projectId}"]`);
        if (!projectItem) return;

        const isExpanded = projectItem.classList.contains('project-expanded');

        if (isExpanded) {
            this.collapseProject(projectId);
        } else {
            await this.expandProject(projectId);
        }
    }

    async expandProject(projectId) {
        try {
            const projectItem = document.querySelector(`[data-project-id="${projectId}"]`);
            if (!projectItem) return;

            projectItem.classList.add('project-expanded');

            // Load subprojects and tasks
            const [subprojectsResponse, tasksResponse] = await Promise.all([
                window.API.getProjectById(projectId),
                window.API.getTasks({ project_id: projectId })
            ]);

            let expansionHTML = '';

            // Add subprojects (if any)
            if (subprojectsResponse.success && subprojectsResponse.subprojects) {
                expansionHTML += subprojectsResponse.subprojects.map(sub => `
                    <div class="subproject-item" onclick="window.App.handleSubprojectClick('${sub.id}')">
                        ${this.escapeHtml(sub.title)}
                    </div>
                `).join('');
            }

            // Add tasks
            if (tasksResponse.success && tasksResponse.tasks) {
                expansionHTML += tasksResponse.tasks.map(task => `
                    <div class="task-item" onclick="window.App.handleTaskClick('${task.id}')">
                        ${this.escapeHtml(task.title)}
                    </div>
                `).join('');
            }

            if (expansionHTML) {
                projectItem.insertAdjacentHTML('afterend', expansionHTML);
            }
        } catch (error) {
            window.UI.handleError(error, 'Expanding Project');
        }
    }

    collapseProject(projectId) {
        const projectItem = document.querySelector(`[data-project-id="${projectId}"]`);
        if (!projectItem) return;

        projectItem.classList.remove('project-expanded');

        // Remove all expanded items after this project
        let nextElement = projectItem.nextElementSibling;
        while (nextElement && (nextElement.classList.contains('subproject-item') || nextElement.classList.contains('task-item'))) {
            const elementToRemove = nextElement;
            nextElement = nextElement.nextElementSibling;
            elementToRemove.remove();
        }
    }

    handleSubprojectClick(subprojectId) {
        // Handle subproject click - could expand further or navigate
        console.log('Subproject clicked:', subprojectId);
    }

    handleTaskClick(taskId) {
        // Handle task click - could open task details
        console.log('Task clicked:', taskId);
    }

    // Email Page Methods
    async loadEmailPage() {
        try {
            const container = document.getElementById('emailContainer');
            if (!container) return;

            // Check email connection status
            const connectionResponse = await window.API.getEmailConnectionStatus();

            if (connectionResponse.success && connectionResponse.connected) {
                // Load email summaries
                await this.loadEmailSummaries();
            } else {
                // Show connection prompt
                this.showEmailConnectionPrompt();
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Email Page');
        }
    }

    showEmailConnectionPrompt() {
        const statusContainer = document.getElementById('emailConnectionStatus');
        if (!statusContainer) return;

        statusContainer.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 16px; margin-bottom: 12px; color: var(--text-primary);">Email Not Connected</div>
                <div style="font-size: 14px; margin-bottom: 16px; color: var(--text-secondary);">
                    Connect your email to view summaries and manage communications.
                </div>
                <button class="btn-primary" onclick="window.App.connectEmail()">Connect Email</button>
            </div>
        `;

        // Clear email cards
        const cardsContainer = document.getElementById('emailCards');
        if (cardsContainer) {
            cardsContainer.innerHTML = '';
        }
    }

    async loadEmailSummaries() {
        try {
            window.UI.showLoading('emailCards', 'Loading emails...');
            const response = await window.API.getEmailSummaries();

            if (response.success) {
                this.displayEmailSummaries(response.emails);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Email Summaries');
        } finally {
            window.UI.hideLoading('emailCards');
        }
    }

    displayEmailSummaries(emails) {
        const statusContainer = document.getElementById('emailConnectionStatus');
        const cardsContainer = document.getElementById('emailCards');

        if (!statusContainer || !cardsContainer) return;

        // Show connection status
        statusContainer.innerHTML = `
            <div style="font-size: 14px; color: var(--text-primary);">
                📧 Connected • ${emails.length} recent emails
            </div>
        `;

        if (!emails || emails.length === 0) {
            cardsContainer.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No emails found.</div>';
            return;
        }

        const emailsHTML = emails.slice(0, 10).map(email => `
            <div class="email-card" onclick="window.App.openEmail('${email.id}')">
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                <div class="email-sender">From: ${this.escapeHtml(email.sender)}</div>
                <div class="email-preview">${this.escapeHtml(email.preview || email.content?.substring(0, 100) || 'No preview available')}</div>
            </div>
        `).join('');

        cardsContainer.innerHTML = emailsHTML;
    }

    async connectEmail() {
        try {
            const response = await window.API.connectEmail();
            if (response.success) {
                window.UI.showSuccess('Email connected successfully!');
                await this.loadEmailPage(); // Reload the page
            }
        } catch (error) {
            window.UI.handleError(error, 'Connecting Email');
        }
    }

    openEmail(emailId) {
        // Handle opening email - could open in new tab or modal
        console.log('Opening email:', emailId);
    }

    // Agents Page Methods
    async loadAgentsPage() {
        try {
            const container = document.getElementById('agentsContainer');
            if (!container) return;

            // Load current agents
            const response = await window.API.getAgents();

            if (response.success && response.agents && response.agents.length > 0) {
                this.displayAgents(response.agents);
            } else {
                this.showNoAgentsMessage();
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Agents Page');
        }
    }

    displayAgents(agents) {
        const container = document.getElementById('agentsList');
        if (!container) return;

        const agentsHTML = agents.map(agent => `
            <div class="agent-card-large">
                <div style="display: flex; align-items: center; margin-bottom: 12px;">
                    <div class="agent-status-indicator ${agent.status}"></div>
                    <div style="font-size: 16px; font-weight: 500; color: var(--text-primary);">
                        ${this.escapeHtml(agent.display_name || agent.name)}
                    </div>
                </div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                    ${this.escapeHtml(agent.type)}
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    Status: ${agent.status} • Tasks: ${agent.tasks_completed || 0}
                </div>
            </div>
        `).join('');

        container.innerHTML = agentsHTML;
    }

    showNoAgentsMessage() {
        const container = document.getElementById('agentsList');
        if (!container) return;

        container.innerHTML = `
            <div class="agent-card-large" style="text-align: center;">
                <div style="font-size: 16px; color: var(--text-primary); margin-bottom: 8px;">
                    No Active Agents
                </div>
                <div style="font-size: 14px; color: var(--text-secondary);">
                    Create an agentic task to get started with AI assistance.
                </div>
            </div>
        `;
    }

    showCreateAgenticTaskModal() {
        const modal = document.getElementById('createAgenticTaskModal');
        if (!modal) return;

        // Initialize the form
        this.initializeAgenticTaskForm();
        modal.style.display = 'flex';
    }

    initializeAgenticTaskForm() {
        const formContainer = document.getElementById('agenticTaskForm');
        if (!formContainer) return;

        formContainer.innerHTML = `
            <div class="step-indicator">
                <div class="step-dot active" data-step="1"></div>
                <div class="step-dot" data-step="2"></div>
                <div class="step-dot" data-step="3"></div>
                <div class="step-dot" data-step="4"></div>
                <div class="step-dot" data-step="5"></div>
            </div>

            <div class="form-step active" data-step="1">
                <div class="form-group">
                    <label class="form-label">End Goal</label>
                    <textarea class="form-textarea" id="endGoal" placeholder="What must you have done?" required></textarea>
                </div>
                <div class="form-navigation">
                    <div></div>
                    <button class="btn-primary" onclick="window.App.nextAgenticStep()">Next</button>
                </div>
            </div>

            <div class="form-step" data-step="2">
                <div class="form-group">
                    <label class="form-label">Steps Identified?</label>
                    <div class="checkbox-group">
                        <input type="checkbox" id="stepsIdentified" onchange="window.App.toggleStepsField()">
                        <label for="stepsIdentified">Yes, I have identified the steps</label>
                    </div>
                </div>
                <div class="form-group" id="stepsField" style="display: none;">
                    <label class="form-label">Steps to Achieve Goal</label>
                    <textarea class="form-textarea" id="stepsDescription" placeholder="Describe the steps needed..."></textarea>
                </div>
                <div class="form-navigation">
                    <button class="btn-secondary" onclick="window.App.prevAgenticStep()">Back</button>
                    <button class="btn-primary" onclick="window.App.nextAgenticStep()">Next</button>
                </div>
            </div>

            <div class="form-step" data-step="3">
                <div class="form-group">
                    <label class="form-label">Time Constraint</label>
                    <input type="text" class="form-input" id="timeConstraint" placeholder="e.g., 2 weeks, 1 month, 3 days">
                </div>
                <div class="form-group">
                    <label class="form-label">Money Constraint</label>
                    <input type="text" class="form-input" id="moneyConstraint" placeholder="e.g., $500, $2000, budget-conscious">
                </div>
                <div class="form-navigation">
                    <button class="btn-secondary" onclick="window.App.prevAgenticStep()">Back</button>
                    <button class="btn-primary" onclick="window.App.nextAgenticStep()">Next</button>
                </div>
            </div>

            <div class="form-step" data-step="4">
                <div class="form-group">
                    <label class="form-label">Number of Agents Requested</label>
                    <input type="number" class="form-input" id="agentsRequested" min="1" max="5" value="1">
                </div>
                <div class="form-group">
                    <label class="form-label">Project Management Agent</label>
                    <div class="checkbox-group">
                        <input type="checkbox" id="pmAgentRequested" checked>
                        <label for="pmAgentRequested">Assign PM Agent for management</label>
                    </div>
                </div>
                <div class="form-navigation">
                    <button class="btn-secondary" onclick="window.App.prevAgenticStep()">Back</button>
                    <button class="btn-primary" onclick="window.App.nextAgenticStep()">Next</button>
                </div>
            </div>

            <div class="form-step" data-step="5">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h3 style="color: var(--text-primary); margin-bottom: 8px;">Confirm Agentic Task</h3>
                    <div id="taskSummary" style="font-size: 14px; color: var(--text-secondary);"></div>
                </div>
                <div class="form-navigation">
                    <button class="btn-secondary" onclick="window.App.prevAgenticStep()">Back</button>
                    <button class="btn-primary" onclick="window.App.submitAgenticTask()">Start Task</button>
                </div>
            </div>
        `;

        this.agenticFormData = {
            step: 1,
            endGoal: '',
            stepsIdentified: false,
            stepsDescription: '',
            timeConstraint: '',
            moneyConstraint: '',
            agentsRequested: 1,
            pmAgentRequested: true
        };
    }

    nextAgenticStep() {
        const currentStep = this.agenticFormData.step;
        if (!this.validateCurrentStep(currentStep)) return;

        this.saveCurrentStepData(currentStep);
        this.moveToStep(currentStep + 1);
    }

    prevAgenticStep() {
        const currentStep = this.agenticFormData.step;
        this.moveToStep(currentStep - 1);
    }

    validateCurrentStep(step) {
        switch (step) {
            case 1:
                const endGoal = document.getElementById('endGoal')?.value?.trim();
                if (!endGoal) {
                    window.UI.showWarning('Please describe your end goal');
                    return false;
                }
                break;
            case 3:
                const timeConstraint = document.getElementById('timeConstraint')?.value?.trim();
                const moneyConstraint = document.getElementById('moneyConstraint')?.value?.trim();
                if (!timeConstraint || !moneyConstraint) {
                    window.UI.showWarning('Please fill in both time and money constraints');
                    return false;
                }
                break;
        }
        return true;
    }

    saveCurrentStepData(step) {
        switch (step) {
            case 1:
                this.agenticFormData.endGoal = document.getElementById('endGoal')?.value?.trim() || '';
                break;
            case 2:
                this.agenticFormData.stepsIdentified = document.getElementById('stepsIdentified')?.checked || false;
                this.agenticFormData.stepsDescription = document.getElementById('stepsDescription')?.value?.trim() || '';
                break;
            case 3:
                this.agenticFormData.timeConstraint = document.getElementById('timeConstraint')?.value?.trim() || '';
                this.agenticFormData.moneyConstraint = document.getElementById('moneyConstraint')?.value?.trim() || '';
                break;
            case 4:
                this.agenticFormData.agentsRequested = parseInt(document.getElementById('agentsRequested')?.value) || 1;
                this.agenticFormData.pmAgentRequested = document.getElementById('pmAgentRequested')?.checked || false;
                break;
        }
    }

    moveToStep(step) {
        // Update form data
        this.agenticFormData.step = step;

        // Update step indicators
        document.querySelectorAll('.step-dot').forEach((dot, index) => {
            const dotStep = index + 1;
            dot.classList.remove('active', 'completed');
            if (dotStep === step) {
                dot.classList.add('active');
            } else if (dotStep < step) {
                dot.classList.add('completed');
            }
        });

        // Show/hide form steps
        document.querySelectorAll('.form-step').forEach((stepEl, index) => {
            const stepNum = index + 1;
            stepEl.classList.toggle('active', stepNum === step);
        });

        // Update summary on final step
        if (step === 5) {
            this.updateTaskSummary();
        }
    }

    toggleStepsField() {
        const checkbox = document.getElementById('stepsIdentified');
        const field = document.getElementById('stepsField');
        if (checkbox && field) {
            field.style.display = checkbox.checked ? 'block' : 'none';
        }
    }

    updateTaskSummary() {
        const summary = document.getElementById('taskSummary');
        if (!summary) return;

        const data = this.agenticFormData;
        summary.innerHTML = `
            <div><strong>Goal:</strong> ${this.escapeHtml(data.endGoal)}</div>
            <div><strong>Steps:</strong> ${data.stepsIdentified ? 'Identified' : 'Not identified'}</div>
            <div><strong>Time:</strong> ${this.escapeHtml(data.timeConstraint)}</div>
            <div><strong>Budget:</strong> ${this.escapeHtml(data.moneyConstraint)}</div>
            <div><strong>Agents:</strong> ${data.agentsRequested}</div>
            <div><strong>PM Agent:</strong> ${data.pmAgentRequested ? 'Yes' : 'No'}</div>
        `;
    }

    async submitAgenticTask() {
        try {
            const response = await window.API.createAgenticTask(this.agenticFormData);

            if (response.success) {
                window.UI.showSuccess('Agentic task created successfully!');
                this.closeModal('createAgenticTaskModal');
                // Reload agents page to show new agents
                await this.loadAgentsPage();
            }
        } catch (error) {
            window.UI.handleError(error, 'Creating Agentic Task');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Goals Page Methods
    async loadGoalsPage() {
        try {
            const container = document.getElementById('goalsContainer');
            if (!container) return;

            window.UI.showLoading('goalsList', 'Loading goals...');
            const response = await window.API.getGoals();

            if (response.success) {
                this.displayGoals(response.goals);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Goals');
        } finally {
            window.UI.hideLoading('goalsList');
        }
    }

    displayGoals(goals) {
        const container = document.getElementById('goalsList');
        if (!container) return;

        if (!goals || goals.length === 0) {
            container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No goals set yet. Create your first goal!</div>';
            return;
        }

        const goalsHTML = goals.map(goal => `
            <div class="goal-item" onclick="window.App.viewGoal('${goal.id}')">
                <div class="goal-title">${this.escapeHtml(goal.title)}</div>
                <div class="goal-description">${this.escapeHtml(goal.description || '')}</div>
                <div class="goal-progress">
                    <span>${goal.progress || 0}%</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${goal.progress || 0}%"></div>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = goalsHTML;
    }

    viewGoal(goalId) {
        // Handle viewing goal details
        console.log('Viewing goal:', goalId);
    }

    // Insights Page Methods
    async loadInsightsPage() {
        try {
            const container = document.getElementById('insightsContainer');
            if (!container) return;

            window.UI.showLoading('insightsContent', 'Loading insights...');
            const response = await window.API.getInsights();

            if (response.success) {
                this.displayInsights(response.insights);
            }
        } catch (error) {
            window.UI.handleError(error, 'Loading Insights');
        } finally {
            window.UI.hideLoading('insightsContent');
        }
    }

    displayInsights(insights) {
        const container = document.getElementById('insightsContent');
        if (!container) return;

        if (!insights || insights.length === 0) {
            container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No insights available yet.</div>';
            return;
        }

        const insightsHTML = insights.map(insight => `
            <div class="insight-card">
                <div class="insight-title">${this.escapeHtml(insight.title)}</div>
                <div class="insight-value">${insight.value}</div>
                <div class="insight-description">${this.escapeHtml(insight.description)}</div>
            </div>
        `).join('');

        container.innerHTML = insightsHTML;
    }
}

// Create and export singleton instance
const app = new KhizrAssistant();
window.App = app; // Make available globally for backward compatibility

// Legacy functions for backward compatibility
function initializeApp() {
    // App is already initialized
}

function loadAgentStatus() {
    return app.loadAgentStatus();
}

function loadTasks() {
    return app.loadTasks();
}

function loadProjects() {
    return app.loadProjects();
}

function resetPreferences() {
    return app.resetPreferences();
}

function updatePreferences() {
    return app.updatePreferences();
}

// Global UI Functions
function showView(view) {
    if (window.app) {
        return window.app.switchView(view);
    }
}

function showPreferenceModal() {
    if (window.app) {
        return window.app.showPreferenceModal();
    }
}

function showAddTaskModal() {
    if (window.app) {
        return window.app.showAddTaskModal();
    }
}

function showAddProjectModal() {
    if (window.app) {
        return window.app.showAddProjectModal();
    }
}

function closeModal(modalId) {
    if (window.app) {
        return window.app.closeModal(modalId);
    }
}

function logout() {
    if (window.Auth) {
        return window.Auth.logout();
    }
}

function setTheme(theme) {
    if (window.app) {
        return window.app.setTheme(theme);
    }
}

function processAINote() {
    if (window.app) {
        return window.app.processAINote();
    }
}

function submitTask(event) {
    if (window.app) {
        return window.app.submitTask(event);
    }
}

function submitProject(event) {
    if (window.app) {
        return window.app.submitProject(event);
    }
}

function sendChatMessage() {
    if (window.app) {
        return window.app.sendChatMessage();
    }
}

function handleChatKeyPress(event) {
    if (window.app) {
        return window.app.handleChatKeyPress(event);
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function switchChatTab(tab) {
    if (window.app) {
        return window.app.switchChatTab(tab);
    }
}

function connectGmail() {
    if (window.app) {
        return window.app.connectGmail();
    }
}

function refreshEmails() {
    if (window.app) {
        return window.app.refreshEmails();
    }
}

function showMindPage() {
    showView('mind');
}

function saveMindNote() {
    if (window.app) {
        return window.app.saveMindNote();
    }
}

function toggleDaddyMonitoring() {
    if (window.app) {
        return window.app.toggleDaddyMonitoring();
    }
}

function showDaddyAnalytics() {
    if (window.app) {
        return window.app.showDaddyAnalytics();
    }
}

function refreshAgentStatus() {
    if (window.app) {
        return window.app.loadAgentStatus();
    }
}

function showAgentAnalytics() {
    if (window.app) {
        return window.app.showAgentAnalytics();
    }
}

function showDaddyControls() {
    if (window.app) {
        return window.app.showDaddyControls();
    }
}

function showPatternInsights() {
    if (window.app) {
        return window.app.showPatternInsights();
    }
}

function resetPreferences() {
    if (window.app) {
        return window.app.resetPreferences();
    }
}

function sortProjects(sortBy) {
    if (window.app) {
        return window.app.sortProjects(sortBy);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KhizrAssistant;
}
