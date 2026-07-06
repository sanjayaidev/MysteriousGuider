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
            handleUserImageUpload(fileInput.files[0]);
        }
    });
}

function handleUserImageUpload(file) {
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        document.getElementById('userImageInput').value = '';
        return;
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
        alert('Please upload a valid image (JPG, PNG, WEBP, GIF)');
        document.getElementById('userImageInput').value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        uploadedImageData = imageData;
        
        const preview = document.getElementById('uploadPreview');
        preview.src = imageData;
        preview.style.display = 'block';
        document.getElementById('uploadArea').querySelector('.upload-placeholder').style.display = 'none';
        document.getElementById('removeImageBtn').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

function removeUploadedImage() {
    uploadedImageData = null;
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('uploadArea').querySelector('.upload-placeholder').style.display = 'block';
    document.getElementById('removeImageBtn').style.display = 'none';
    document.getElementById('userImageInput').value = '';
}

// ==================== START GENERATION ====================
async function startGeneration() {
    if (!uploadedImageData) {
        alert('Please upload an image first!');
        return;
    }
    
    const promptId = selectedPromptId;
    const model = document.getElementById('modelSelect').value;
    const negativePrompt = document.getElementById('negativePrompt').value;
    const guidanceScale = document.getElementById('guidanceScale').value;
    const steps = document.getElementById('steps').value;
    
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generating...';
    generationInProgress = true;
    
    try {
        // Close generation modal and open result modal
        generationModal.style.display = 'none';
        document.getElementById('resultModal').style.display = 'block';
        document.getElementById('resultLoading').style.display = 'flex';
        document.getElementById('resultImage').style.display = 'none';
        
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                promptId,
                imageData: uploadedImageData,
                model: model === 'auto' ? null : model,
                negativePrompt: negativePrompt || null,
                guidanceScale: parseFloat(guidanceScale),
                steps: parseInt(steps)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentResultUrl = data.imageUrl;
            document.getElementById('resultImage').src = data.imageUrl;
            document.getElementById('resultImage').style.display = 'block';
            document.getElementById('resultLoading').style.display = 'none';
        } else {
            throw new Error(data.error || 'Generation failed');
        }
    } catch (error) {
        console.error('Generation error:', error);
        alert('Failed to generate image: ' + error.message);
        document.getElementById('resultLoading').style.display = 'none';
        document.getElementById('resultLoading').innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <span style="font-size: 48px;">❌</span>
                <p style="color: #e74c3c; margin-top: 10px;">Generation failed</p>
                <small style="color: #999;">${error.message}</small>
                <br><br>
                <button onclick="closeResultModal(); resetGenerationForm();" class="btn-secondary">Close</button>
            </div>
        `;
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '🚀 Generate Image';
        generationInProgress = false;
    }
}

// ==================== RESULT MODAL ====================
function closeResultModal() {
    resultModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    // Reset loading state
    document.getElementById('resultLoading').style.display = 'flex';
    document.getElementById('resultLoading').innerHTML = `
        <div class="spinner"></div>
        <p>Generating your image...</p>
        <small>This may take 30-60 seconds</small>
    `;
    document.getElementById('resultImage').style.display = 'none';
    resetGenerationForm();
}

function downloadResult() {
    if (currentResultUrl) {
        const link = document.createElement('a');
        link.href = currentResultUrl;
        link.download = `generated-${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function regenerate() {
    closeResultModal();
    // Reopen generation modal
    if (selectedPromptId) {
        setTimeout(() => openGenerationModal(selectedPromptId), 300);
    }
}

// ==================== PARAMETER DISPLAY ====================
document.getElementById('guidanceScale').addEventListener('input', function() {
    document.getElementById('guidanceValue').textContent = this.value;
});

document.getElementById('steps').addEventListener('input', function() {
    document.getElementById('stepsValue').textContent = this.value;
});

// ==================== UTILITIES ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
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

// ==================== GOOGLE DRIVE INTEGRATION ====================
document.getElementById('driveLoginBtn').addEventListener('click', function() {
    // Placeholder for Google Drive integration
    if (this.classList.contains('connected')) {
        this.textContent = '🔗 Connect Google Drive';
        this.classList.remove('connected');
        localStorage.removeItem('driveConnected');
    } else {
        // Simulate OAuth flow
        alert('Google Drive integration coming soon! Configure in Settings first.');
        // In production, you'd redirect to Google OAuth
        this.textContent = '✅ Connected';
        this.classList.add('connected');
        localStorage.setItem('driveConnected', 'true');
    }
});

// Check saved drive connection
if (localStorage.getItem('driveConnected') === 'true') {
    const btn = document.getElementById('driveLoginBtn');
    btn.textContent = '✅ Connected';
    btn.classList.add('connected');
}

// ==================== CLOSE MODALS ON OUTSIDE CLICK ====================
window.onclick = function(event) {
    if (event.target === generationModal) {
        closeGenerationModal();
    }
    if (event.target === resultModal) {
        closeResultModal();
    }
};
