/**
 * Authentication Middleware
 *
 * Provides JWT-based authentication for API endpoints
 */

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
const JWT_EXPIRY = '24h';

// Initialize Supabase client for user verification
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Verify JWT token and return decoded payload
 * @param {string} token - JWT token
 * @returns {object|null} Decoded token payload or null if invalid
 */
async function verifyJWT(token) {
  if (!token) return null;

  try {
    // First try to verify with our JWT secret
    if (JWT_SECRET) {
      const decoded = jwt.verify(token, JWT_SECRET);
      return decoded;
    }

    // Fallback: verify with Supabase
    if (supabase) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return null;
      return {
        sub: user.id,
        email: user.email,
        role: user.role || 'user'
      };
    }

    return null;
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    return null;
  }
}

/**
 * Generate JWT token
 * @param {object} payload - Token payload
 * @returns {string} JWT token
 */
function generateJWT(payload) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Authentication middleware for Express-style handlers
 * @param {object} options - Middleware options
 * @param {boolean} options.required - Whether auth is required (default: true)
 * @param {string[]} options.roles - Required roles (optional)
 * @returns {function} Middleware function
 */
function authMiddleware(options = {}) {
  const { required = true, roles = [] } = options;

  return async (req, res, next) => {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Also check for token in cookies
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // Verify token
    const user = await verifyJWT(token);

    if (!user && required) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Check roles if specified
    if (user && roles.length > 0 && !roles.includes(user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    // Attach user to request
    req.user = user;

    if (typeof next === 'function') {
      next();
    }

    return user;
  };
}

/**
 * Verify authentication for Vercel serverless functions
 * @param {object} req - Request object
 * @param {object} options - Options
 * @returns {object|null} User object or null
 */
async function verifyAuth(req, options = {}) {
  const { required = true, roles = [] } = options;

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Verify token
  const user = await verifyJWT(token);

  if (!user && required) {
    return { error: 'Unauthorized', status: 401 };
  }

  // Check roles if specified
  if (user && roles.length > 0 && !roles.includes(user.role)) {
    return { error: 'Forbidden', status: 403 };
  }

  return { user };
}

/**
 * Hash sensitive data for logging
 * @param {string} data - Data to hash
 * @returns {string} Masked data
 */
function maskSensitiveData(data) {
  if (!data || typeof data !== 'string') return '***';
  if (data.length <= 4) return '***';
  return data.substring(0, 2) + '***' + data.substring(data.length - 2);
}

module.exports = {
  verifyJWT,
  generateJWT,
  authMiddleware,
  verifyAuth,
  maskSensitiveData
};
