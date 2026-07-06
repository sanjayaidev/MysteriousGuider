const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== DATABASE CONNECTION ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('frontend'));

// ==================== SERVE ADMIN ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

// ==================== ADMIN AUTH ====================
const adminAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token || token !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ==================== IMGBB UPLOAD HELPER ====================
async function uploadToImgBB(imageData) {
    try {
        const apiKey = process.env.IMGBB_API_KEY;
        if (!apiKey) {
            throw new Error('ImgBB API key not configured');
        }

        let base64Data = imageData;

        // If it's a URL, download and convert to base64
        if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
            const response = await axios.get(imageData, { responseType: 'arraybuffer' });
            base64Data = Buffer.from(response.data).toString('base64');
        } 
        // If it's a data URL, extract base64 part
        else if (imageData.startsWith('data:image')) {
            base64Data = imageData.split(',')[1];
        }
        // If it's already base64 without prefix, use as is

        const formData = new FormData();
        formData.append('key', apiKey);
        formData.append('image', base64Data);

        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        if (response.data.success) {
            return response.data.data.display_url || response.data.data.url;
        } else {
            throw new Error(response.data.error?.message || 'ImgBB upload failed');
        }
    } catch (error) {
        console.error('ImgBB upload error:', error);
        throw error;
    }
}

// ==================== ALIBABA CLOUD MODEL CALLS ====================
// Based on your working test.js and test-wan.js

async function callQwenModel(model, promptText, imageUrl, negativePrompt, guidanceScale, steps) {
    const API_KEY = process.env.DASHSCOPE_API_KEY;
    if (!API_KEY) {
        throw new Error('DashScope API key not configured');
    }

    const ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
    const isBareEdit = model === 'qwen-image-edit';

    // Upload user image to ImgBB first if it's a data URL
    let finalImageUrl = imageUrl;
    if (imageUrl.startsWith('data:image')) {
        finalImageUrl = await uploadToImgBB(imageUrl);
    }

    const body = {
        model,
        input: {
            messages: [{
                role: "user",
                content: [
                    { image: finalImageUrl },
                    { text: promptText }
                ]
            }]
        },
        parameters: isBareEdit
            ? { n: 1 }
            : {
                n: 1,
                watermark: false,
                prompt_extend: true,
                negative_prompt: negativePrompt || " ",
            }
    };

    // Add optional parameters if provided
    if (!isBareEdit) {
        if (guidanceScale) body.parameters.guidance_scale = parseFloat(guidanceScale);
        if (steps) body.parameters.steps = parseInt(steps);
    }

    const response = await axios.post(ENDPOINT, body, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 120000
    });

    if (response.data.code) {
        throw new Error(response.data.message || response.data.code);
    }

    const content = response.data.output?.choices?.[0]?.message?.content || [];
    const imageEntry = content.find(c => c.image);
    
    if (imageEntry) {
        // Upload generated image to ImgBB
        const imgbbUrl = await uploadToImgBB(imageEntry.image);
        return { success: true, imageUrl: imgbbUrl };
    } else {
        throw new Error('No image in response');
    }
}

async function callWanSyncModel(model, promptText, imageUrl, negativePrompt, guidanceScale, steps) {
    const API_KEY = process.env.DASHSCOPE_API_KEY;
    if (!API_KEY) {
        throw new Error('DashScope API key not configured');
    }

    const ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

    // Upload user image to ImgBB first if it's a data URL
    let finalImageUrl = imageUrl;
    if (imageUrl.startsWith('data:image')) {
        finalImageUrl = await uploadToImgBB(imageUrl);
    }

    const body = {
        model,
        input: {
            messages: [{
                role: "user",
                content: [
                    { text: promptText },
                    { image: finalImageUrl }
                ]
            }]
        },
        parameters: {
            n: 1,
            enable_interleave: false,
            watermark: false,
            prompt_extend: true,
            size: "1K",
            negative_prompt: negativePrompt || " ",
        }
    };

    // Add optional parameters if provided
    if (guidanceScale) body.parameters.guidance_scale = parseFloat(guidanceScale);
    if (steps) body.parameters.steps = parseInt(steps);

    const response = await axios.post(ENDPOINT, body, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 120000
    });

    if (response.data.code) {
        throw new Error(response.data.message || response.data.code);
    }

    const content = response.data.output?.choices?.[0]?.message?.content || [];
    const imageEntry = content.find(c => c.image);
    
    if (imageEntry) {
        // Upload generated image to ImgBB
        const imgbbUrl = await uploadToImgBB(imageEntry.image);
        return { success: true, imageUrl: imgbbUrl };
    } else {
        throw new Error('No image in response');
    }
}

async function callWanAsyncModel(model, promptText, imageUrl, negativePrompt, guidanceScale, steps) {
    const API_KEY = process.env.DASHSCOPE_API_KEY;
    if (!API_KEY) {
        throw new Error('DashScope API key not configured');
    }

    const CREATE_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis";
    const TASK_ENDPOINT = "https://dashscope-intl.aliyuncs.com/api/v1/tasks/";

    // Upload user image to ImgBB first if it's a data URL
    let finalImageUrl = imageUrl;
    if (imageUrl.startsWith('data:image')) {
        finalImageUrl = await uploadToImgBB(imageUrl);
    }

    const createBody = {
        model,
        input: {
            prompt: promptText,
            images: [finalImageUrl]
        },
        parameters: {
            n: 1,
            negative_prompt: negativePrompt || " ",
        }
    };

    // Add optional parameters if provided
    if (guidanceScale) createBody.parameters.guidance_scale = parseFloat(guidanceScale);
    if (steps) createBody.parameters.steps = parseInt(steps);

    const createRes = await axios.post(CREATE_ENDPOINT, createBody, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'X-DashScope-Async': 'enable'
        },
        timeout: 30000
    });

    if (createRes.status !== 200 || createRes.data.code) {
        throw new Error(createRes.data.message || createRes.data.code || `HTTP ${createRes.status}`);
    }

    const taskId = createRes.data.output?.task_id;
    if (!taskId) {
        throw new Error('No task_id returned');
    }

    // Poll for result
    for (let i = 0; i < 30; i++) {
        await sleep(5000);
        const pollRes = await axios.get(TASK_ENDPOINT + taskId, {
            headers: { 'Authorization': `Bearer ${API_KEY}` },
            timeout: 10000
        });

        const status = pollRes.data.output?.task_status;
        if (status === 'SUCCEEDED') {
            const resultUrl = pollRes.data.output?.results?.[0]?.url;
            if (resultUrl) {
                // Upload generated image to ImgBB
                const imgbbUrl = await uploadToImgBB(resultUrl);
                return { success: true, imageUrl: imgbbUrl };
            } else {
                throw new Error('No image URL in result');
            }
        }
        if (status === 'FAILED' || status === 'CANCELED') {
            throw new Error(pollRes.data.output?.message || status);
        }
    }
    throw new Error('Timed out waiting for task to finish');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== GENERATION CONTROLLER ====================
async function generateImage(model, promptText, imageData, negativePrompt, guidanceScale, steps) {
    // Determine model type
    const isQwen = model.startsWith('qwen');
    const isWanSync = ['wan2.7-image-pro', 'wan2.7-image', 'wan2.6-image'].includes(model);
    const isWanAsync = model === 'wan2.5-i2i-preview';

    let result;
    if (isQwen) {
        result = await callQwenModel(model, promptText, imageData, negativePrompt, guidanceScale, steps);
    } else if (isWanSync) {
        result = await callWanSyncModel(model, promptText, imageData, negativePrompt, guidanceScale, steps);
    } else if (isWanAsync) {
        result = await callWanAsyncModel(model, promptText, imageData, negativePrompt, guidanceScale, steps);
    } else {
        throw new Error('Unknown model');
    }

    return result;
}

// ==================== ADMIN ROUTES ====================

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true, token: password });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Get all prompts (with pagination and filters)
app.get('/api/admin/prompts', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', category = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM prompts WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (search) {
            query += ` AND (headline ILIKE $${paramCount} OR description ILIKE $${paramCount} OR full_prompt ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        
        if (category) {
            query += ` AND category = $${paramCount}`;
            params.push(category);
            paramCount++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM prompts WHERE 1=1';
        const countParams = [];
        let countParamCount = 1;
        
        if (search) {
            countQuery += ` AND (headline ILIKE $${countParamCount} OR description ILIKE $${countParamCount} OR full_prompt ILIKE $${countParamCount})`;
            countParams.push(`%${search}%`);
            countParamCount++;
        }
        
        if (category) {
            countQuery += ` AND category = $${countParamCount}`;
            countParams.push(category);
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);
        
        res.json({
            prompts: result.rows,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching prompts:', error);
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});

// Get single prompt
app.get('/api/admin/prompts/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM prompts WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching prompt:', error);
        res.status(500).json({ error: 'Failed to fetch prompt' });
    }
});

// Create new prompt
app.post('/api/admin/prompts', adminAuth, async (req, res) => {
    try {
        const { 
            headline, 
            description, 
            full_prompt, 
            category, 
            sub_category, 
            tags, 
            demo_image_url, 
            max_images_allowed,
            is_active 
        } = req.body;
        
        const result = await pool.query(
            `INSERT INTO prompts 
             (headline, description, full_prompt, category, sub_category, tags, demo_image_url, max_images_allowed, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
             RETURNING *`,
            [headline, description, full_prompt, category, sub_category, tags || [], demo_image_url, max_images_allowed || 1, is_active !== undefined ? is_active : true]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating prompt:', error);
        res.status(500).json({ error: 'Failed to create prompt' });
    }
});

// Update prompt
app.put('/api/admin/prompts/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            headline, 
            description, 
            full_prompt, 
            category, 
            sub_category, 
            tags, 
            demo_image_url, 
            max_images_allowed,
            is_active 
        } = req.body;
        
        const result = await pool.query(
            `UPDATE prompts SET 
                headline = $1, 
                description = $2, 
                full_prompt = $3, 
                category = $4, 
                sub_category = $5, 
                tags = $6, 
                demo_image_url = $7, 
                max_images_allowed = $8,
                is_active = $9,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $10 
             RETURNING *`,
            [headline, description, full_prompt, category, sub_category, tags || [], demo_image_url, max_images_allowed || 1, is_active !== undefined ? is_active : true, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating prompt:', error);
        res.status(500).json({ error: 'Failed to update prompt' });
    }
});

// Delete prompt
app.delete('/api/admin/prompts/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM prompts WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        
        res.json({ message: 'Prompt deleted successfully' });
    } catch (error) {
        console.error('Error deleting prompt:', error);
        res.status(500).json({ error: 'Failed to delete prompt' });
    }
});

// Get all categories
app.get('/api/admin/categories', adminAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get all sub-categories for a category
app.get('/api/admin/subcategories/:category', adminAuth, async (req, res) => {
    try {
        const { category } = req.params;
        const result = await pool.query(
            'SELECT DISTINCT sub_category FROM prompts WHERE category = $1 AND sub_category IS NOT NULL ORDER BY sub_category',
            [category]
        );
        res.json(result.rows.map(row => row.sub_category));
    } catch (error) {
        console.error('Error fetching sub-categories:', error);
        res.status(500).json({ error: 'Failed to fetch sub-categories' });
    }
});

// ==================== USER ROUTES ====================

// Get prompts for user (public)
app.get('/api/prompts', async (req, res) => {
    try {
        const { page = 1, limit = 12, category, subCategory, search, sort = 'newest' } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM prompts WHERE is_active = true';
        const params = [];
        let paramCount = 1;
        
        if (category) {
            query += ` AND category = $${paramCount}`;
            params.push(category);
            paramCount++;
        }
        
        if (subCategory) {
            query += ` AND sub_category = $${paramCount}`;
            params.push(subCategory);
            paramCount++;
        }
        
        if (search) {
            query += ` AND (headline ILIKE $${paramCount} OR description ILIKE $${paramCount} OR full_prompt ILIKE $${paramCount} OR tags::text ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        
        // Sorting
        const sortMap = {
            'newest': 'created_at DESC',
            'popular': 'views DESC',
            'views': 'views DESC'
        };
        query += ` ORDER BY ${sortMap[sort] || 'created_at DESC'}`;
        
        query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM prompts WHERE is_active = true';
        const countParams = [];
        let countParamCount = 1;
        
        if (category) {
            countQuery += ` AND category = $${countParamCount}`;
            countParams.push(category);
            countParamCount++;
        }
        
        if (subCategory) {
            countQuery += ` AND sub_category = $${countParamCount}`;
            countParams.push(subCategory);
            countParamCount++;
        }
        
        if (search) {
            countQuery += ` AND (headline ILIKE $${countParamCount} OR description ILIKE $${countParamCount} OR full_prompt ILIKE $${countParamCount} OR tags::text ILIKE $${countParamCount})`;
            countParams.push(`%${search}%`);
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);
        
        res.json({
            prompts: result.rows,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching prompts:', error);
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});

// Get single prompt (public)
app.get('/api/prompts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM prompts WHERE id = $1 AND is_active = true', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        
        // Increment view count
        await pool.query('UPDATE prompts SET views = COALESCE(views, 0) + 1 WHERE id = $1', [id]);
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching prompt:', error);
        res.status(500).json({ error: 'Failed to fetch prompt' });
    }
});

// Get categories (public)
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get sub-categories (public)
app.get('/api/subcategories/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const result = await pool.query(
            'SELECT DISTINCT sub_category FROM prompts WHERE category = $1 AND sub_category IS NOT NULL AND is_active = true ORDER BY sub_category',
            [category]
        );
        res.json(result.rows.map(row => row.sub_category));
    } catch (error) {
        console.error('Error fetching sub-categories:', error);
        res.status(500).json({ error: 'Failed to fetch sub-categories' });
    }
});

// ==================== GENERATION ENDPOINT ====================
app.post('/api/generate', async (req, res) => {
    try {
        const { 
            promptId, 
            imageData, 
            model, 
            negativePrompt, 
            guidanceScale, 
            steps 
        } = req.body;

        console.log('Generation request:', { promptId, model, imageData: imageData ? 'present' : 'missing' });

        // Validate input
        if (!promptId) {
            return res.status(400).json({ error: 'Prompt ID is required' });
        }

        if (!imageData) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        // Get the prompt
        const promptResult = await pool.query('SELECT * FROM prompts WHERE id = $1 AND is_active = true', [promptId]);
        if (promptResult.rows.length === 0) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        const prompt = promptResult.rows[0];

        // Auto-select model if not specified
        let selectedModel = model;
        if (!selectedModel || selectedModel === 'auto') {
            // Default to qwen-image-2.0-pro as it's the most capable
            selectedModel = 'qwen-image-2.0-pro';
        }

        console.log(`Generating with model: ${selectedModel}`);

        // Generate image using the selected model
        const result = await generateImage(
            selectedModel,
            prompt.full_prompt,
            imageData,
            negativePrompt,
            guidanceScale,
            steps
        );

        // Save generation history (optional)
        try {
            await pool.query(
                `INSERT INTO generations (prompt_id, model, image_url, created_at) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
                [promptId, selectedModel, result.imageUrl]
            );
        } catch (dbError) {
            console.warn('Could not save generation history:', dbError);
        }

        res.json({ 
            success: true, 
            imageUrl: result.imageUrl,
            model: selectedModel
        });

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Generation failed' 
        });
    }
});

// ==================== SETTINGS ROUTES (for admin) ====================

// Get settings (protected)
app.get('/api/admin/settings', adminAuth, async (req, res) => {
    try {
        // You can store settings in a database table or use environment variables
        const settings = {
            imgbbApiKey: process.env.IMGBB_API_KEY ? '********' : null,
            dashscopeApiKey: process.env.DASHSCOPE_API_KEY ? '********' : null,
            nimEndpoint: process.env.NIM_ENDPOINT || null,
            nimApiKey: process.env.NIM_API_KEY ? '********' : null,
            driveFolderId: process.env.DRIVE_FOLDER_ID || null,
            defaultStorage: process.env.DEFAULT_STORAGE || 'imgbb'
        };
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log('🚀 PromptPro Server Started');
    console.log('='.repeat(70));
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🔐 Admin panel: http://localhost:${PORT}/admin.html`);
    console.log(`👤 User interface: http://localhost:${PORT}/user.html`);
    console.log('='.repeat(70));
    console.log('📋 Available Models:');
    console.log('  - qwen-image-2.0-pro (Recommended)');
    console.log('  - qwen-image-2.0');
    console.log('  - qwen-image-edit-max');
    console.log('  - qwen-image-edit-plus');
    console.log('  - qwen-image-edit');
    console.log('  - wan2.7-image-pro');
    console.log('  - wan2.7-image');
    console.log('  - wan2.6-image');
    console.log('  - wan2.5-i2i-preview');
    console.log('='.repeat(70));
    console.log('⚡ All images uploaded to ImgBB automatically');
    console.log('='.repeat(70));
});
