// ==================== STATE ====================
let currentPage = 1;
let totalPages = 1;
let editingId = null;
let deletingId = null;
let token = null;

// ==================== DOM REFS ====================
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const promptsBody = document.getElementById('promptsBody');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const limitFilter = document.getElementById('limitFilter');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const promptModal = document.getElementById('promptModal');
const deleteModal = document.getElementById('deleteModal');
const promptForm = document.getElementById('promptForm');
const modalTitle = document.getElementById('modalTitle');
const promptId = document.getElementById('promptId');

// ==================== AUTH ====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            token = data.token;
            loginScreen.style.display = 'none';
            dashboardScreen.style.display = 'block';
            loadCategories();
            loadPrompts();
        } else {
            loginError.textContent = 'Invalid password. Please try again.';
        }
    } catch (error) {
        loginError.textContent = 'Error connecting to server.';
    }
});

function logout() {
    token = null;
    dashboardScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
    loginError.textContent = '';
}

// ==================== API HELPERS ====================
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        logout();
        throw new Error('Session expired');
    }
    return response;
}

// ==================== LOAD PROMPTS ====================
async function loadPrompts() {
    try {
        const search = searchInput.value;
        const category = categoryFilter.value;
        const limit = limitFilter.value;
        
        const url = `/api/admin/prompts?page=${currentPage}&limit=${limit}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
        
        const response = await apiFetch(url);
        const data = await response.json();
        
        renderPrompts(data.prompts);
        totalPages = data.totalPages;
        updatePagination();
    } catch (error) {
        console.error('Error loading prompts:', error);
        promptsBody.innerHTML = '<tr><td colspan="7" class="loading-text">Error loading prompts</td></tr>';
    }
}

function renderPrompts(prompts) {
    if (prompts.length === 0) {
        promptsBody.innerHTML = '<tr><td colspan="7" class="loading-text">No prompts found</td></tr>';
        return;
    }
    
    promptsBody.innerHTML = prompts.map((prompt, index) => `
        <tr>
            <td>${index + 1 + (currentPage - 1) * parseInt(limitFilter.value)}</td>
            <td><strong>${escapeHtml(prompt.headline)}</strong></td>
            <td>${escapeHtml(prompt.category)}</td>
            <td>${escapeHtml(prompt.sub_category || '-')}</td>
            <td>${prompt.max_images_allowed}</td>
            <td>
                <span class="status-badge ${prompt.is_active ? 'status-active' : 'status-inactive'}">
                    ${prompt.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <button class="btn-edit" onclick="editPrompt('${prompt.id}')">✏️ Edit</button>
                <button class="btn-delete" onclick="deletePrompt('${prompt.id}')">🗑️ Delete</button>
            </td>
        </tr>
    `).join('');
}

// ==================== CATEGORIES ====================
async function loadCategories() {
    try {
        const response = await apiFetch('/api/admin/categories');
        const categories = await response.json();
        
        // Populate category filter
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        
        // Populate category dropdown in form
        const categorySelect = document.getElementById('category');
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        
        categories.forEach(cat => {
            categoryFilter.innerHTML += `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`;
            categorySelect.innerHTML += `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`;
        });
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function updateSubCategories() {
    const category = document.getElementById('category').value;
    if (!category) return;
    
    try {
        const response = await apiFetch(`/api/admin/subcategories/${encodeURIComponent(category)}`);
        const subCategories = await response.json();
        
        // For now, we'll just show a datalist suggestion or leave it as free text
        // You can implement a dropdown if needed
    } catch (error) {
        console.error('Error loading sub-categories:', error);
    }
}

// ==================== PAGINATION ====================
function updatePagination() {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function changePage(direction) {
    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    }
    loadPrompts();
}

// ==================== MODAL OPERATIONS ====================
function openAddModal() {
    editingId = null;
    modalTitle.textContent = 'Add New Prompt';
    promptForm.reset();
    promptId.value = '';
    document.getElementById('isActive').value = 'true';
    promptModal.style.display = 'block';
}

function closeModal() {
    promptModal.style.display = 'none';
}

async function editPrompt(id) {
    try {
        const response = await apiFetch(`/api/admin/prompts/${id}`);
        const prompt = await response.json();
        
        editingId = id;
        modalTitle.textContent = 'Edit Prompt';
        promptId.value = id;
        
        document.getElementById('headline').value = prompt.headline;
        document.getElementById('description').value = prompt.description || '';
        document.getElementById('fullPrompt').value = prompt.full_prompt;
        document.getElementById('category').value = prompt.category;
        document.getElementById('subCategory').value = prompt.sub_category || '';
        document.getElementById('tags').value = prompt.tags ? prompt.tags.join(', ') : '';
        document.getElementById('demoImage').value = prompt.demo_image_url || '';
        document.getElementById('maxImages').value = prompt.max_images_allowed;
        document.getElementById('isActive').value = prompt.is_active ? 'true' : 'false';
        
        promptModal.style.display = 'block';
    } catch (error) {
        console.error('Error loading prompt for edit:', error);
        alert('Failed to load prompt data');
    }
}

// ==================== SAVE PROMPT ====================
promptForm.addEventListener('submit', async (e) => {
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
            closeModal();
            loadPrompts();
            alert(editingId ? 'Prompt updated successfully!' : 'Prompt created successfully!');
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error('Error saving prompt:', error);
        alert('Failed to save prompt');
    }
});

// ==================== DELETE PROMPT ====================
function deletePrompt(id) {
    deletingId = id;
    deleteModal.style.display = 'block';
}

function closeDeleteModal() {
    deleteModal.style.display = 'none';
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
            loadPrompts();
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

// ==================== UTILITIES ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== CLOSE MODALS ON OUTSIDE CLICK ====================
window.onclick = function(event) {
    if (event.target === promptModal) {
        closeModal();
    }
    if (event.target === deleteModal) {
        closeDeleteModal();
    }
};
