const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('frontend'));

// ==================== SERVE STATIC FILES ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'user', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin', 'index.html'));
});

// ==================== IMPORT UTILITIES ====================
const { uploadToImgBB } = require('./utils/imgbb');
const { generateImage } = require('./utils/alibaba');
const { 
    verifyToken, 
    verifyAdmin, 
    generateToken, 
    hashPassword, 
    comparePassword 
} = require('./middleware/auth');

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        // Check if user exists
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await hashPassword(password);
        
        // Create user
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, hashedPassword, name || email.split('@')[0]]
        );
        
        const user = result.rows[0];
        const token = generateToken(user.id, false);
        
        // Create session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
        
        await pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );
        
        res.status(201).json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        
        // Check password
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate token
        const token = generateToken(user.id, user.is_admin);
        
        // Create session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.is_admin
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Admin login (simplified for existing setup)
app.post('/api/auth/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        
        // Check against env variable
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        // Get or create admin user
        let adminUser = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@promptpro.com']);
        
        if (adminUser.rows.length === 0) {
            const hashedPassword = await hashPassword(process.env.ADMIN_PASSWORD);
            const result = await pool.query(
                'INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, email, name, is_admin',
                ['admin@promptpro.com', hashedPassword, 'Admin', true]
            );
            adminUser = result;
        }
        
        const user = adminUser.rows[0];
        const token = generateToken(user.id, true);
        
        // Create session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.is_admin
            },
            token
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Verify token
app.get('/api/auth/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await pool.query(
            'SELECT u.id, u.email, u.name, u.is_admin FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = $1 AND s.expires_at > NOW()',
            [token]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        res.json({
            valid: true,
            user: result.rows[0]
        });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// ==================== TOKEN REFRESH ENDPOINT ====================
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        // Verify existing token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if session exists and is valid
        const session = await pool.query(
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        
        if (session.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        // Generate new token
        const newToken = jwt.sign(
            { userId: decoded.userId, isAdmin: decoded.isAdmin || false },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Update session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await pool.query(
            'UPDATE sessions SET token = $1, expires_at = $2 WHERE token = $3',
            [newToken, expiresAt, token]
        );
        
        res.json({
            success: true,
            token: newToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Failed to refresh token' });
    }
});

// ==================== SESSION EXTENSION MIDDLEWARE ====================
async function extendSession(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            // Extend session expiry by 7 days on activity
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            
            await pool.query(
                'UPDATE sessions SET expires_at = $1 WHERE token = $2',
                [expiresAt, token]
            );
        } catch (error) {
            // Silently fail - don't block request
        }
    }
    next();
}

// Apply session extension middleware to admin routes
app.use('/api/admin', extendSession);
app.use('/api/auth/refresh', extendSession);

// ==================== GOOGLE DRIVE ROUTES ====================

// Initiate Google Drive OAuth
app.get('/api/drive/auth', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Generate OAuth state
        const state = crypto.randomBytes(32).toString('hex');
        
        // Store state with user ID
        await pool.query(
            'INSERT INTO oauth_states (state, user_id, created_at) VALUES ($1, $2, NOW())',
            [state, decoded.userId]
        );
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
            `redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&` +
            `response_type=code&` +
            `scope=https://www.googleapis.com/auth/drive.file&` +
            `access_type=offline&` +
            `state=${state}&` +
            `prompt=consent`;
        
        res.json({ authUrl });
    } catch (error) {
        console.error('Drive auth error:', error);
        res.status(500).json({ error: 'Failed to initiate Drive auth' });
    }
});

// Google Drive OAuth Callback
app.get('/api/drive/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        // Verify state
        const stateResult = await pool.query(
            'SELECT user_id FROM oauth_states WHERE state = $1 AND created_at > NOW() - INTERVAL \'10 minutes\'',
            [state]
        );
        
        if (stateResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid state' });
        }
        
        const userId = stateResult.rows[0].user_id;
        
        // Exchange code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code'
        });
        
        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        
        // Save to database
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
        
        await pool.query(
            `INSERT INTO drive_connections (user_id, access_token, refresh_token, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
             access_token = $2, refresh_token = $3, expires_at = $4, updated_at = NOW()`,
            [userId, access_token, refresh_token, expiresAt]
        );
        
        // Delete used state
        await pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);
        
        res.redirect(`${process.env.FRONTEND_URL}/admin?drive=connected`);
    } catch (error) {
        console.error('Drive callback error:', error);
        res.status(500).json({ error: 'Failed to connect Drive' });
    }
});

// Get Drive connection status
app.get('/api/drive/status', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM drive_connections WHERE user_id = $1 AND expires_at > NOW()',
            [req.userId]
        );
        
        res.json({ connected: result.rows.length > 0 });
    } catch (error) {
        console.error('Drive status error:', error);
        res.status(500).json({ error: 'Failed to check Drive status' });
    }
});

// ==================== ADMIN ROUTES (Protected) ====================

// Get all prompts (admin)
app.get('/api/admin/prompts', verifyToken, verifyAdmin, async (req, res) => {
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

// Get single prompt (admin)
app.get('/api/admin/prompts/:id', verifyToken, verifyAdmin, async (req, res) => {
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

// Create new prompt (admin)
app.post('/api/admin/prompts', verifyToken, verifyAdmin, async (req, res) => {
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
             (headline, description, full_prompt, category, sub_category, tags, demo_image_url, max_images_allowed, is_active, created_by) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
             RETURNING *`,
            [headline, description, full_prompt, category, sub_category, tags || [], demo_image_url, max_images_allowed || 1, is_active !== undefined ? is_active : true, req.userId]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating prompt:', error);
        res.status(500).json({ error: 'Failed to create prompt' });
    }
});

// Update prompt (admin)
app.put('/api/admin/prompts/:id', verifyToken, verifyAdmin, async (req, res) => {
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

// Delete prompt (admin)
app.delete('/api/admin/prompts/:id', verifyToken, verifyAdmin, async (req, res) => {
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

// Get all categories (admin)
app.get('/api/admin/categories', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get all sub-categories (admin)
app.get('/api/admin/subcategories/:category', verifyToken, verifyAdmin, async (req, res) => {
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

// ==================== USER ROUTES (Protected) ====================

// Get prompts for user
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
        
        const sortMap = {
            'newest': 'created_at DESC',
            'popular': 'views DESC',
            'views': 'views DESC'
        };
        query += ` ORDER BY ${sortMap[sort] || 'created_at DESC'}`;
        
        query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
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
// ==================== IMAGE UPLOAD ENDPOINT ====================
app.post('/api/upload/image', verifyToken, verifyAdmin, async (req, res) => {
    try {
        // Handle FormData upload
        const formData = req.body;
        const file = req.files?.image;
        
        if (!file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        
        // Upload to ImgBB using env var
        const form = new FormData();
        form.append('key', process.env.IMGBB_API_KEY);
        form.append('image', file.data.toString('base64'));
        
        const response = await axios.post('https://api.imgbb.com/1/upload', form, {
            headers: form.getHeaders()
        });
        
        if (response.data.success) {
            res.json({ success: true, url: response.data.data.url });
        } else {
            throw new Error('ImgBB upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// ==================== ADMIN STATS ENDPOINT ====================
app.get('/api/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [promptsResult, activeResult, categoriesResult, imagesResult] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM prompts'),
            pool.query('SELECT COUNT(*) FROM prompts WHERE is_active = true'),
            pool.query('SELECT COUNT(*) FROM categories'),
            pool.query('SELECT COALESCE(SUM(total_images_generated), 0) as total FROM usage_stats')
        ]);
        
        res.json({
            totalPrompts: parseInt(promptsResult.rows[0].count),
            activePrompts: parseInt(activeResult.rows[0].count),
            totalCategories: parseInt(categoriesResult.rows[0].count),
            totalImages: parseInt(imagesResult.rows[0].total)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ==================== USAGE TRACKING ENDPOINT ====================
app.get('/api/admin/usage', verifyToken, verifyAdmin, async (req, res) => {
    try {
        // Get all users with their usage stats
        const usersResult = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.name,
                COALESCE(us.total_generations, 0) as total_generations,
                COALESCE(us.total_images_generated, 0) as total_images_generated,
                COALESCE(us.tools_used, '{}') as tools_used,
                COALESCE(us.templates_used, '{}') as templates_used,
                COALESCE(us.storage_used_mb, 0) as storage_used_mb,
                us.last_active
            FROM users u
            LEFT JOIN usage_stats us ON u.id = us.user_id
            WHERE u.is_admin = false
            ORDER BY us.last_active DESC NULLS LAST
        `);
        
        // Get totals
        const totalsResult = await pool.query(`
            SELECT 
                COUNT(DISTINCT u.id) as total_users,
                COALESCE(SUM(us.total_generations), 0) as total_generations,
                COALESCE(SUM(us.total_images_generated), 0) as total_images,
                COALESCE(SUM(us.storage_used_mb), 0) as total_storage
            FROM users u
            LEFT JOIN usage_stats us ON u.id = us.user_id
            WHERE u.is_admin = false
        `);
        
        res.json({
            users: usersResult.rows,
            totalUsers: parseInt(totalsResult.rows[0].total_users),
            totalGenerations: parseInt(totalsResult.rows[0].total_generations),
            totalImages: parseInt(totalsResult.rows[0].total_images),
            totalStorage: parseFloat(totalsResult.rows[0].total_storage)
        });
    } catch (error) {
        console.error('Error fetching usage data:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

// ==================== DRIVE STATUS ENDPOINT ====================
app.get('/api/drive/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT access_token, expires_at FROM drive_connections WHERE expires_at > NOW() LIMIT 1'
        );
        
        if (result.rows.length > 0) {
            res.json({
                connected: true,
                expires_at: result.rows[0].expires_at
            });
        } else {
            res.json({ connected: false });
        }
    } catch (error) {
        console.error('Drive status error:', error);
        res.status(500).json({ error: 'Failed to check Drive status' });
    }
});

// ==================== DRIVE AUTH ENDPOINT ====================
app.get('/api/drive/auth', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        
        await pool.query(
            'INSERT INTO oauth_states (state) VALUES ($1)',
            [state]
        );
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
            `redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&` +
            `response_type=code&` +
            `scope=https://www.googleapis.com/auth/drive.file&` +
            `access_type=offline&` +
            `state=${state}&` +
            `prompt=consent`;
        
        res.redirect(authUrl);
    } catch (error) {
        console.error('Drive auth error:', error);
        res.status(500).json({ error: 'Failed to initiate Drive auth' });
    }
});

// ==================== DRIVE CALLBACK ENDPOINT ====================
app.get('/api/drive/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        const stateResult = await pool.query(
            'SELECT * FROM oauth_states WHERE state = $1 AND created_at > NOW() - INTERVAL \'10 minutes\'',
            [state]
        );
        
        if (stateResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid state' });
        }
        
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code'
        });
        
        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
        
        // Store globally (no user_id)
        await pool.query(
            `INSERT INTO drive_connections (access_token, refresh_token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
             access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()`,
            [access_token, refresh_token, expiresAt]
        );
        
        await pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);
        
        // Close popup and notify parent
        res.send(`
            <html>
                <body>
                    <script>
                        window.opener.postMessage({ type: 'drive_auth_complete' }, '*');
                        window.close();
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Drive callback error:', error);
        res.status(500).json({ error: 'Failed to connect Drive' });
    }
});

// ==================== DRIVE DISCONNECT ENDPOINT ====================
app.post('/api/drive/disconnect', verifyToken, verifyAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM drive_connections');
        res.json({ success: true });
    } catch (error) {
        console.error('Drive disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect Drive' });
    }
});
// ==================== GENERATION ROUTE ====================
app.post('/api/generate', verifyToken, async (req, res) => {
    try {
        const { promptId, imageData, model, negativePrompt } = req.body;
        
        // Get prompt
        const promptResult = await pool.query('SELECT * FROM prompts WHERE id = $1 AND is_active = true', [promptId]);
        if (promptResult.rows.length === 0) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        const prompt = promptResult.rows[0];
        
        // Select model
        let selectedModel = model;
        if (!selectedModel || selectedModel === 'auto') {
            selectedModel = 'qwen-image-2.0-pro';
        }
        
        // Generate image
        const result = await generateImage(
            selectedModel,
            prompt.full_prompt,
            imageData,
            negativePrompt
        );
        
        // Save generation
        await pool.query(
            'INSERT INTO generations (prompt_id, user_id, model, image_url, status) VALUES ($1, $2, $3, $4, $5)',
            [promptId, req.userId, selectedModel, result.imageUrl, 'completed']
        );
        
        res.json({
            success: true,
            imageUrl: result.imageUrl,
            model: selectedModel
        });
    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log('🚀 PromptPro Server Started');
    console.log('='.repeat(70));
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 User: http://localhost:${PORT}`);
    console.log('='.repeat(70));
});
