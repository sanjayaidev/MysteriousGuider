// ==================== STATE ====================
let userPage = 1;
let userTotalPages = 1;
let selectedPromptId = null;
let uploadedImageData = null;
let currentResultUrl = null;
let generationInProgress = false;

// ==================== DOM REFS ====================
const promptsGrid = document.getElementById('userPromptsGrid');
const categoryFilter = document.getElementById('userCategoryFilter');
const subCategoryFilter = document.getElementById('userSubCategoryFilter');
const searchFilter = document.getElementById('userSearchFilter');
const sortFilter = document.getElementById('userSortFilter');
const generationModal = document.getElementById('generationModal');
const resultModal = document.getElementById('resultModal');

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    loadUserCategories();
    loadUserPrompts();
    setupUserUpload();
});

// ==================== LOAD PROMPTS ====================
async function loadUserPrompts() {
    try {
        const category = categoryFilter.value;
        const subCategory = subCategoryFilter.value;
        const search = searchFilter.value;
        const sort = sortFilter.value;
        const limit = 12;

        const url = `/api/prompts?page=${userPage}&limit=${limit}&category=${encodeURIComponent(category)}&subCategory=${encodeURIComponent(subCategory)}&search=${encodeURIComponent(search)}&sort=${sort}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        renderUserPrompts(data.prompts);
        userTotalPages = data.totalPages || 1;
        updateUserPagination();
    } catch (error) {
        console.error('Error loading prompts:', error);
        promptsGrid.innerHTML = '<div class="loading-spinner">Error loading prompts. Please refresh.</div>';
    }
}

function renderUserPrompts(prompts) {
    if (prompts.length === 0) {
        promptsGrid.innerHTML = '<div class="loading-spinner">No prompts found</div>';
        return;
    }

    promptsGrid.innerHTML = prompts.map(prompt => `
        <div class="prompt-card" onclick="openGenerationModal('${prompt.id}')">
            ${prompt.demo_image_url ? 
                `<img src="${escapeHtml(prompt.demo_image_url)}" alt="${escapeHtml(prompt.headline)}" class="card-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23667eea%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%22150%22 y=%22110%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2236%22%3E📷%3C/text%3E%3C/svg%3E'">` :
                `<div class="card-image" style="background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-size: 48px;">📷</div>`
            }
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
                <button class="btn-use" onclick="event.stopPropagation(); openGenerationModal('${prompt.id}')">
                    ✨ Use This Prompt
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== CATEGORIES ====================
async function loadUserCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(cat => {
            categoryFilter.innerHTML += `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`;
        });
        
        // Load sub-categories when category changes
        categoryFilter.addEventListener('change', loadUserSubCategories);
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function loadUserSubCategories() {
    const category = categoryFilter.value;
    subCategoryFilter.innerHTML = '<option value="">All Sub-Categories</option>';
    
    if (!category) {
        loadUserPrompts();
        return;
    }
    
    try {
        const response = await fetch(`/api/subcategories/${encodeURIComponent(category)}`);
        const subCategories = await response.json();
        
        subCategories.forEach(sub => {
            subCategoryFilter.innerHTML += `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`;
        });
    } catch (error) {
        console.error('Error loading sub-categories:', error);
    }
    loadUserPrompts();
}

// ==================== FILTERS ====================
searchFilter.addEventListener('input', debounce(loadUserPrompts, 500));
sortFilter.addEventListener('change', loadUserPrompts);
subCategoryFilter.addEventListener('change', loadUserPrompts);

// ==================== PAGINATION ====================
function updateUserPagination() {
    document.getElementById('userPageInfo').textContent = `Page ${userPage} of ${userTotalPages || 1}`;
    document.getElementById('userPrevBtn').disabled = userPage === 1;
    document.getElementById('userNextBtn').disabled = userPage === userTotalPages || userTotalPages === 0;
}

function changeUserPage(direction) {
    if (direction === 'prev' && userPage > 1) {
        userPage--;
    } else if (direction === 'next' && userPage < userTotalPages) {
        userPage++;
    }
    loadUserPrompts();
    document.querySelector('.prompts-grid').scrollIntoView({ behavior: 'smooth' });
}

// ==================== GENERATION MODAL ====================
async function openGenerationModal(promptId) {
    selectedPromptId = promptId;
    
    try {
        const response = await fetch(`/api/prompts/${promptId}`);
        const prompt = await response.json();
        
        document.getElementById('genPromptHeadline').textContent = prompt.headline;
        document.getElementById('genPromptDescription').textContent = prompt.description || 'No description';
        document.getElementById('genFullPrompt').textContent = prompt.full_prompt;
        
        // Set max images from prompt
        const maxImages = prompt.max_images_allowed || 1;
        document.querySelector('.upload-section small').textContent = 
            `Supports JPG, PNG, WEBP (Max 10MB) - ${maxImages} image${maxImages > 1 ? 's' : ''} allowed`;
        
        generationModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    } catch (error) {
        console.error('Error loading prompt:', error);
        alert('Failed to load prompt details');
    }
}

function closeGenerationModal() {
    generationModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    if (!generationInProgress) {
        resetGenerationForm();
    }
}

function resetGenerationForm() {
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('uploadArea').querySelector('.upload-placeholder').style.display = 'block';
    document.getElementById('removeImageBtn').style.display = 'none';
    document.getElementById('userImageInput').value = '';
    uploadedImageData = null;
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('generateBtn').textContent = '🚀 Generate Image';
}

// ==================== IMAGE UPLOAD ====================
function setupUserUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('userImageInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleUserImageUpload(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleUserImageUpload(fileInput.f
