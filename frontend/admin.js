// ==================== STATE ====================
let currentPage = 1;
let totalPages = 1;
let collectionPage = 1;
let collectionTotalPages = 1;
let editingId = null;
let deletingId = null;
let token = null;
let currentImageUrl = null;
let driveConnected = false;
let refreshTimer = null;

// ==================== DOM REFS ====================
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');

// ==================== AUTH & SESSION MANAGEMENT ====================
// Check for existing session on load
document.addEventListener('DOMContentLoaded', async () => {
    const savedToken = localStorage.getItem('adminToken');
    const tokenExpiry = localStorage.getItem('adminTokenExpiry');
    
    if (savedToken && tokenExpiry) {
        const expiry = new Date(parseInt(tokenExpiry));
        const now = new Date();
        
        // Check if token is still valid (with 1 hour buffer)
        if (expiry > now && (expiry - now) > 3600000) {
            token = savedToken;
            
            // Verify token with server
            try {
                const response = await fetch('/api/auth/verify', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                
                if (data.valid) {
                    // Session is valid, show dashboard
                    loginScreen.style.display = 'none';
                    dashboardScreen.style.display = 'block';
                    initDashboard();
                    
                    // Auto-refresh token periodically
                    startTokenRefreshTimer();
                    return;
                }
            } catch (error) {
                console.error('Token verification failed:', error);
            }
        }
    }
    
    // No valid session, show login
    loginScreen.style.display = 'flex';
    dashboardScreen.style.display = 'none';
});

// ==================== LOGIN ====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    
    try {
        const response = await fetch('/api/auth/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            token = data.token;
            
            // Store token with expiry (7 days from now)
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 7);
            localStorage.setItem('adminToken', token);
            localStorage.setItem('adminTokenExpiry', expiry.getTime().toString());
            
            loginScreen.style.display = 'none';
            dashboardScreen.style.display = 'block';
            initDashboard();
            
            // Start auto-refresh timer
            startTokenRefreshTimer();
        } else {
            loginError.textContent = 'Invalid password. Please try again.';
        }
    } catch (error) {
        loginError.textContent = 'Error connecting to server.';
    }
});

// ==================== TOKEN REFRESH ====================
function startTokenRefreshTimer() {
    // Clear any existing timer
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    
    // Refresh token every 6 hours (or before expiry)
    refreshTimer = setInterval(async () => {
        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            if (data.success) {
                token = data.token;
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + 7);
                localStorage.setItem('adminToken', token);
                localStorage.setItem('adminTokenExpiry', expiry.getTime().toString());
                console.log('Token refreshed successfully');
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            // Don't logout immediately, try again later
        }
    }, 6 * 60 * 60 * 1000); // 6 hours
}

// ==================== LOGOUT ====================
function logout() {
    // Clear timer
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    
    // Call logout API
    if (token) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }).catch(console.error);
    }
    
    // Clear local storage
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminTokenExpiry');
    
    token = null;
    dashboardScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
    loginError.textContent = '';
}

// ==================== INIT DASHBOARD ====================
function initDashboard() {
    loadCategories();
    loadRecentPrompts();
    loadCollection();
    loadStats();
    loadSettings();
    loadProfile();
    loadDriveStatus();
    loadUsageData();
    setupTabs();
    setupImageUpload();
}

// ==================== TABS ====================
function setupTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            
            tabContents.forEach(t => t.classList.remove('active'));
            
            const tabId = this.dataset.tab;
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            if (tabId === 'collection') {
                loadCollection();
            }
            if (tabId === 'settings') {
                loadDriveStatus();
                loadUsageData();
            }
        });
    });
}

// ==================== API HELPERS (Updated) ====================
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    try {
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            // Try to refresh token
            try {
                const refreshResponse = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const refreshData = await refreshResponse.json();
                
                if (refreshData.success) {
                    token = refreshData.token;
                    const expiry = new Date();
                    expiry.setDate(expiry.getDate() + 7);
                    localStorage.setItem('adminToken', token);
                    localStorage.setItem('adminTokenExpiry', expiry.getTime().toString());
                    
                    // Retry original request
                    const retryResponse = await fetch(url, {
                        ...options,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            ...options.headers
                        }
                    });
                    return retryResponse;
                }
            } catch (refreshError) {
                console.error('Refresh failed:', refreshError);
            }
            
            // If refresh fails, logout
            logout();
            throw new Error('Session expired');
        }
        
        return response;
    } catch (error) {
        if (error.message === 'Session expired') {
            throw error;
        }
        console.error('API fetch error:', error);
        throw error;
    }
}

// ==================== INIT DASHBOARD (Updated) ====================
function initDashboard() {
    loadCategories();
    loadRecentPrompts();
    loadCollection();
    loadStats();
    loadSettings();
    loadProfile();
    loadDriveStatus();
    loadUsageData();
    setupTabs();
    setupImageUpload();
    
    // Update last activity on user interactions
    document.addEventListener('click', updateLastActivity);
    document.addEventListener('keydown', updateLastActivity);
}

function updateLastActivity() {
    // Update session expiry on activity
    if (token) {
        fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    }
}

// ==================== IMAGE UPLOAD (ImgBB) ====================
function setupImageUpload() {
    const fileInput = document.getElementById('imageFileInput');
    fileInput.addEventListener('change', async function(e) {
        const file = this.files[0];
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            this.value = '';
            return;
        }
        
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert('Please upload a valid image (JPG, PNG, GIF, WEBP)');
            this.value = '';
            return;
        }
        
        await uploadToImgBB(file);
    });
}

async function uploadToImgBB(file) {
    const progressBar = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Preparing upload...';
    
    try {
        // Use ImgBB API key from environment variable (passed via backend)
        const formData = new FormData();
        formData.append('image', file);
        
        progressFill.style.width = '30%';
        progressText.textContent = 'Uploading to ImgBB...';
        
        const response = await apiFetch('/api/upload/image', {
            method: 'POST',
            body: formData,
            headers: {} // Remove Content-Type for FormData
        });
        
        progressFill.style.width = '80%';
        progressText.textContent = 'Processing...';
        
        const data = await response.json();
        
        if (data.success) {
            const imageUrl = data.url;
            currentImageUrl = imageUrl;
            document.getElementById('demoImage').value = imageUrl;
            
            const preview = document.getElementById('demoImagePreview');
            preview.src = imageUrl;
            preview.style.display = 'block';
            document.getElementById('uploadPlaceholder').style.display = 'none';
            document.getElementById('removeImageBtn').style.display = 'inline-block';
            
            progressFill.style.width = '100%';
            progressText.textContent = '✅ Upload complete!';
            
            setTimeout(() => {
                progressBar.style.display = 'none';
            }, 2000);
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload image: ' + error.message);
        progressBar.style.display = 'none';
    }
}

function removeImage() {
    currentImageUrl = null;
    document.getElementById('demoImage').value = '';
    document.getElementById('demoImagePreview').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    document.getElementById('removeImageBtn').style.display = 'none';
    document.getElementById('imageFileInput').value = '';
}

// ==================== LOAD CATEGORIES ====================
async function loadCategories() {
    try {
        const response = await apiFetch('/api/admin/categories');
        const categories = await response.json();
        
        const categorySelect = document.getElementById('category');
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        
        const collectionCategory = document.getElementById('collectionCategory');
        collectionCategory.innerHTML = '<option value="">All Categories</option>';
        
        categories.forEach(cat => {
            const option1 = document.createElement('option');
            option1.value = cat.name;
            option1.textContent = cat.name;
            categorySelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = cat.name;
            option2.textContent = cat.name;
            collectionCategory.appendChild(option2);
        });
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// ==================== RECENT PROMPTS ====================
async function loadRecentPrompts() {
    try {
        const response = await apiFetch('/api/admin/prompts?limit=5');
        const data = await response.json();
        
        const container = document.getElementById('recentPromptsList');
        if (data.prompts.length === 0) {
            container.innerHTML = '<p class="loading-text">No prompts yet. Create your first prompt!</p>';
            return;
        }
        
        container.innerHTML = data.prompts.map(prompt => `
            <div class="recent-prompt-item">
                <span class="prompt-title">${escapeHtml(prompt.headline)}</span>
                <span class="prompt-category">${escapeHtml(prompt.category)}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading recent prompts:', error);
    }
}

// ==================== PROMPT FORM ====================
document.getElementById('promptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        headline: document.getElementById('headline').value,
        description: document.getElementById('description').value,
        full_prompt: document.getElementById('fullPrompt').value,
        category: document.getElementById('category').value,
        sub_category: document.getElementById('subCategory').value || null,
        tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t),
        demo_image_url: document.getElementById('demoImage').value || null,
        max_images_allowed: parseInt(document.getElementById('maxImages').value),
        is_active: document.getElementById('isActive').value === 'true'
    };
    
    try {
        let response;
        const editingId = document.getElementById('promptId').value;
        
        if (editingId) {
            response = await apiFetch(`/api/admin/prompts/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            response = await apiFetch('/api/admin/prompts', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
        
        if (response.ok) {
            alert(editingId ? 'Prompt updated successfully!' : 'Prompt created successfully!');
            document.getElementById('promptForm').reset();
            document.getElementById('promptId').value = '';
            removeImage();
            loadRecentPrompts();
            loadCollection();
            loadStats();
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error('Error saving prompt:', error);
        alert('Failed to save prompt');
    }
});

// ==================== COLLECTION ====================
async function loadCollection() {
    try {
        const search = document.getElementById('collectionSearch').value;
        const category = document.getElementById('collectionCategory').value;
        const limit = parseInt(document.getElementById('collectionLimit').value);
        
        const url = `/api/admin/prompts?page=${collectionPage}&limit=${limit}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
        
        const response = await apiFetch(url);
        const data = await response.json();
        
        renderCollection(data.prompts);
        collectionTotalPages = data.totalPages;
        updateCollectionPagination();
    } catch (error) {
        console.error('Error loading collection:', error);
        document.getElementById('collectionGrid').innerHTML = '<div class="loading-text">Error loading prompts</div>';
    }
}

function renderCollection(prompts) {
    const grid = document.getElementById('collectionGrid');
    
    if (prompts.length === 0) {
        grid.innerHTML = '<div class="loading-text">No prompts found</div>';
        return;
    }
    
    grid.innerHTML = prompts.map(prompt => `
        <div class="collection-card">
            ${prompt.demo_image_url ? `<img src="${escapeHtml(prompt.demo_image_url)}" alt="${escapeHtml(prompt.headline)}" class="card-image">` : 
            `<div class="card-image" style="background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-size: 48px;">📷</div>`}
            <div class="card-body">
                <div class="card-headline">${escapeHtml(prompt.headline)}</div>
                <div class="card-description">${escapeHtml(prompt.description || 'No description')}</div>
                <div class="card-meta">
                    <span>${escapeHtml(prompt.category)}${prompt.sub_category ? ` → ${escapeHtml(prompt.sub_category)}` : ''}</span>
                    <span>📸 ${prompt.max_images_allowed} image${prompt.max_images_allowed > 1 ? 's' : ''}</span>
                </div>
                ${prompt.tags && prompt.tags.length > 0 ? `
                    <div class="card-tags">
                        ${prompt.tags.map(tag => `<span class="card-tag">#${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                    <button class="btn-edit" onclick="editPrompt('${prompt.id}')">✏️ Edit</button>
                    <button class="btn-delete" onclick="deletePrompt('${prompt.id}')">🗑️ Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

function updateCollectionPagination() {
    document.getElementById('collectionPageInfo').textContent = `Page ${collectionPage} of ${collectionTotalPages || 1}`;
    document.getElementById('collectionPrevBtn').disabled = collectionPage === 1;
    document.getElementById('collectionNextBtn').disabled = collectionPage === collectionTotalPages || collectionTotalPages === 0;
}

function changeCollectionPage(direction) {
    if (direction === 'prev' && collectionPage > 1) {
        collectionPage--;
    } else if (direction === 'next' && collectionPage < collectionTotalPages) {
        collectionPage++;
    }
    loadCollection();
}

// ==================== EDIT PROMPT ====================
async function editPrompt(id) {
    try {
        const response = await apiFetch(`/api/admin/prompts/${id}`);
        const prompt = await response.json();
        
        document.querySelector('[data-tab="editor"]').click();
        
        document.getElementById('promptId').value = id;
        document.getElementById('headline').value = prompt.headline;
        document.getElementById('description').value = prompt.description || '';
        document.getElementById('fullPrompt').value = prompt.full_prompt;
        document.getElementById('category').value = prompt.category;
        document.getElementById('subCategory').value = prompt.sub_category || '';
        document.getElementById('tags').value = prompt.tags ? prompt.tags.join(', ') : '';
        document.getElementById('maxImages').value = prompt.max_images_allowed;
        document.getElementById('isActive').value = prompt.is_active ? 'true' : 'false';
        
        if (prompt.demo_image_url) {
            currentImageUrl = prompt.demo_image_url;
            document.getElementById('demoImage').value = prompt.demo_image_url;
            const preview = document.getElementById('demoImagePreview');
            preview.src = prompt.demo_image_url;
            preview.style.display = 'block';
            document.getElementById('uploadPlaceholder').style.display = 'none';
            document.getElementById('removeImageBtn').style.display = 'inline-block';
        }
        
        document.querySelector('.editor-form').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading prompt for edit:', error);
        alert('Failed to load prompt data');
    }
}

// ==================== DELETE PROMPT ====================
function deletePrompt(id) {
    deletingId = id;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    deletingId = null;
}

async function confirmDelete() {
    if (!deletingId) return;
    
    try {
        const response = await apiFetch(`/api/admin/prompts/${deletingId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            closeDeleteModal();
            loadRecentPrompts();
            loadCollection();
            loadStats();
            alert('Prompt deleted successfully!');
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error('Error deleting prompt:', error);
        alert('Failed to delete prompt');
    }
}

// ==================== STATS ====================
async function loadStats() {
    try {
        const response = await apiFetch('/api/admin/stats');
        const stats = await response.json();
        
        document.getElementById('totalPrompts').textContent = stats.totalPrompts || 0;
        document.getElementById('activePrompts').textContent = stats.activePrompts || 0;
        document.getElementById('totalCategories').textContent = stats.totalCategories || 0;
        document.getElementById('totalImages').textContent = stats.totalImages || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ==================== DRIVE INTEGRATION ====================
async function loadDriveStatus() {
    try {
        const response = await apiFetch('/api/drive/status');
        const data = await response.json();
        
        driveConnected = data.connected;
        updateDriveUI(data);
    } catch (error) {
        console.error('Error loading drive status:', error);
    }
}

function updateDriveUI(data) {
    const connectBtn = document.getElementById('driveConnectBtn');
    const disconnectBtn = document.getElementById('driveDisconnectBtn');
    const statusText = document.getElementById('driveStatus');
    const infoBox = document.getElementById('driveConnectionInfo');
    
    if (data.connected) {
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
        statusText.textContent = '✅ Connected';
        statusText.className = 'drive-status-connected';
        infoBox.style.display = 'block';
        document.getElementById('driveExpiry').textContent = data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A';
    } else {
        connectBtn.style.display = 'inline-block';
        disconnectBtn.style.display = 'none';
        statusText.textContent = '❌ Not connected';
        statusText.className = 'drive-status-disconnected';
        infoBox.style.display = 'none';
    }
}

function connectDrive() {
    // Open Google OAuth in a new window
    const width = 600;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    const popup = window.open(
        '/api/drive/auth',
        'Google Drive OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
    );
    
    // Listen for the OAuth callback
    window.addEventListener('message', handleDriveAuthMessage);
}

function handleDriveAuthMessage(event) {
    if (event.data && event.data.type === 'drive_auth_complete') {
        loadDriveStatus();
        alert('Google Drive connected successfully!');
    }
}

async function disconnectDrive() {
    if (!confirm('Are you sure you want to disconnect Google Drive?')) return;
    
    try {
        const response = await apiFetch('/api/drive/disconnect', {
            method: 'POST'
        });
        
        if (response.ok) {
            alert('Google Drive disconnected successfully');
            loadDriveStatus();
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error('Error disconnecting drive:', error);
        alert('Failed to disconnect Drive');
    }
}

// ==================== USAGE TRACKING ====================
async function loadUsageData() {
    try {
        const response = await apiFetch('/api/admin/usage');
        const data = await response.json();
        
        // Update stats cards
        document.getElementById('totalUsers').textContent = data.totalUsers || 0;
        document.getElementById('totalGenerations').textContent = data.totalGenerations || 0;
        document.getElementById('totalImages').textContent = data.totalImages || 0;
        document.getElementById('totalStorage').textContent = (data.totalStorage || 0).toFixed(2) + ' MB';
        
        // Update table
        renderUsageTable(data.users || []);
    } catch (error) {
        console.error('Error loading usage data:', error);
        document.getElementById('usageTableBody').innerHTML = '<tr><td colspan="8" class="loading-text">Error loading usage data</td></tr>';
    }
}

function renderUsageTable(users) {
    const tbody = document.getElementById('usageTableBody');
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No user data available</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td><span class="user-name">${escapeHtml(user.name || 'N/A')}</span></td>
            <td><span class="user-email">${escapeHtml(user.email)}</span></td>
            <td><span class="badge badge-info">${user.total_generations || 0}</span></td>
            <td>${user.total_images_generated || 0}</td>
            <td>
                <div class="tag-list">
                    ${user.tools_used && user.tools_used.length > 0 
                        ? user.tools_used.slice(0, 3).map(t => `<span class="tag-item">${escapeHtml(t)}</span>`).join('') 
                        : '<span style="color: #999;">None</span>'}
                    ${user.tools_used && user.tools_used.length > 3 ? `<span class="tag-item">+${user.tools_used.length - 3}</span>` : ''}
                </div>
            </td>
            <td>
                <div class="tag-list">
                    ${user.templates_used && user.templates_used.length > 0 
                        ? user.templates_used.slice(0, 3).map(t => `<span class="tag-item">${escapeHtml(t)}</span>`).join('') 
                        : '<span style="color: #999;">None</span>'}
                    ${user.templates_used && user.templates_used.length > 3 ? `<span class="tag-item">+${user.templates_used.length - 3}</span>` : ''}
                </div>
            </td>
            <td>${(user.storage_used_mb || 0).toFixed(2)} MB</td>
            <td>${user.last_active ? new Date(user.last_active).toLocaleDateString() : 'Never'}</td>
        </tr>
    `).join('');
}

function refreshUsage() {
    loadUsageData();
}

function exportUsage() {
    const table = document.getElementById('usageTable');
    const rows = table.querySelectorAll('tr');
    let csv = [];
    
    // Header
    const headers = ['User', 'Email', 'Generations', 'Images', 'Tools Used', 'Templates', 'Storage (MB)', 'Last Active'];
    csv.push(headers.join(','));
    
    // Data rows
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length > 0) {
            const rowData = Array.from(cols).map(col => {
                let text = col.textContent.trim();
                // Handle comma in text
                if (text.includes(',')) {
                    text = `"${text}"`;
                }
                return text;
            });
            csv.push(rowData.join(','));
        }
    });
    
    // Download
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ==================== SETTINGS ====================
function loadSettings() {
    document.getElementById('driveFolderId').value = localStorage.getItem('driveFolderId') || '';
}

function saveDriveSettings() {
    localStorage.setItem('driveFolderId', document.getElementById('driveFolderId').value);
    alert('Drive settings saved successfully!');
}

// ==================== PROFILE ====================
function loadProfile() {
    document.getElementById('brandName').value = localStorage.getItem('brandName') || 'PromptPro';
    document.getElementById('brandLogo').value = localStorage.getItem('brandLogo') || '';
    document.getElementById('brandColor').value = localStorage.getItem('brandColor') || '#667eea';
    document.getElementById('siteTitle').value = localStorage.getItem('siteTitle') || 'PromptPro - AI Image Generator';
    document.getElementById('siteDescription').value = localStorage.getItem('siteDescription') || 'Generate stunning images with AI-powered prompts';
    document.getElementById('defaultPerPage').value = localStorage.getItem('defaultPerPage') || '24';
}

function saveBrandSettings() {
    localStorage.setItem('brandName', document.getElementById('brandName').value);
    localStorage.setItem('brandLogo', document.getElementById('brandLogo').value);
    localStorage.setItem('brandColor', document.getElementById('brandColor').value);
    alert('Brand settings saved successfully!');
}

function saveUISettings() {
    localStorage.setItem('siteTitle', document.getElementById('siteTitle').value);
    localStorage.setItem('siteDescription', document.getElementById('siteDescription').value);
    localStorage.setItem('defaultPerPage', document.getElementById('defaultPerPage').value);
    alert('UI settings saved successfully!');
}

// ==================== UTILITIES ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== CLOSE MODALS ====================
window.onclick = function(event) {
    if (event.target === document.getElementById('deleteModal')) {
        closeDeleteModal();
    }
};