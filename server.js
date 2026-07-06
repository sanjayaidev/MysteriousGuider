const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// ===== FIX: Serve admin.html at root =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

// Admin authentication middleware
const adminAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token || token !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

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

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📋 Admin panel: http://localhost:${PORT}`);
});
