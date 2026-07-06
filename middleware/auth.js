const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Generate JWT token with admin flag
function generateToken(userId, isAdmin = false) {
    return jwt.sign(
        { userId, isAdmin },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Simple admin verification - just check if token has isAdmin flag (no session DB check)
async function verifyAdminToken(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // For admin, just check if isAdmin flag is set - no session DB check
        if (!decoded.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        req.userId = decoded.userId;
        req.isAdmin = true;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Verify JWT token
async function verifyToken(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if session exists and is valid
        const session = await pool.query(
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        
        if (session.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        req.userId = decoded.userId;
        req.isAdmin = decoded.isAdmin || false;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Verify admin
function verifyAdmin(req, res, next) {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Hash password
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

// Compare password
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

module.exports = {
    generateToken,
    verifyToken,
    verifyAdminToken,
    verifyAdmin,
    hashPassword,
    comparePassword
};
