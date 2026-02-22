/**
 * Authentication Middleware
 *
 * Provides JWT-based authentication for API endpoints
 */

const jwt = require('jsonwebtoken');
const { supabaseAdmin: supabase } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('Auth');

// JWT_SECRET priority: explicit JWT_SECRET > Supabase JWT secret
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

const JWT_EXPIRY = '24h';

// Log error if no proper secret configured
if (!JWT_SECRET) {
  logger.error('[Auth] CRITICAL: No JWT_SECRET or SUPABASE_JWT_SECRET configured. JWT signing/verification will fail. Set JWT_SECRET in environment variables.');
}

// Cache user→restaurant mappings (TTL 5 minutes) to avoid repeated DB lookups
const restaurantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Cache token→decoded user (TTL 1 minute) to avoid repeated Supabase getUser() calls
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 60 * 1000;

/**
 * Look up the restaurant_id for a given user ID
 * Uses restaurant.restaurant_config table (set during onboarding)
 * @param {string} userId - Supabase auth user UUID
 * @returns {string|null} restaurant_id UUID or null
 */
async function getRestaurantIdForUser(userId) {
  if (!userId || !supabase) return null;

  // Check cache first
  const cached = restaurantCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }

  try {
    const { data, error } = await supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, timezone')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      logger.info(`[Auth] No restaurant found for user ${userId}`);
      return null;
    }

    // Cache the result (includes both restaurantId and timezone)
    const result = { restaurantId: data.id, timezone: data.timezone || 'UTC', timestamp: Date.now() };
    restaurantCache.set(userId, result);

    // Evict old entries if cache grows too large
    if (restaurantCache.size > 500) {
      const now = Date.now();
      for (const [key, val] of restaurantCache.entries()) {
        if (now - val.timestamp > CACHE_TTL) restaurantCache.delete(key);
      }
    }

    return result;
  } catch (err) {
    logger.error('[Auth] Error looking up restaurant for user:', err.message);
    return null;
  }
}

/**
 * Verify JWT token and return decoded payload
 * @param {string} token - JWT token
 * @returns {object|null} Decoded token payload or null if invalid
 */
async function verifyJWT(token) {
  if (!token) return null;

  let decoded = null;

  // First try to verify with our JWT secret
  if (JWT_SECRET) {
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      // JWT verification failed, try Supabase fallback
      logger.info('[Auth] JWT verification failed, trying Supabase fallback');
    }
  }

  // Fallback: verify with Supabase (handles Supabase session tokens)
  if (!decoded && supabase) {
    // Check token cache first to avoid repeated network calls
    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      return cached.decoded;
    }

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        logger.error('[Auth] Supabase token verification failed:', error?.message);
        return null;
      }
      decoded = {
        sub: user.id,
        email: user.email,
        role: user.role || 'user'
      };
      tokenCache.set(token, { decoded, timestamp: Date.now() });
    } catch (supabaseError) {
      logger.error('[Auth] Supabase verification error:', supabaseError.message);
      return null;
    }
  }

  if (!decoded) return null;

  // Ensure restaurant_id and timezone are present on the user object
  if (!decoded.restaurant_id && decoded.sub) {
    const restaurant = await getRestaurantIdForUser(decoded.sub);
    if (restaurant) {
      decoded.restaurant_id = restaurant.restaurantId;
      decoded.timezone = restaurant.timezone;
    }
  }

  return decoded;
}

/**
 * Generate JWT token
 * @param {object} payload - Token payload
 * @returns {string} JWT token
 */
async function generateJWT(payload) {
  if (!JWT_SECRET) {
    logger.error('[Auth] CRITICAL: No JWT secret available. Check environment configuration.');
    throw new Error('Authentication configuration error. Please contact support.');
  }
  // Look up restaurant_id and timezone if not already in payload
  if (!payload.restaurant_id && payload.sub) {
    const restaurant = await getRestaurantIdForUser(payload.sub);
    if (restaurant) {
      payload.restaurant_id = restaurant.restaurantId;
      payload.timezone = restaurant.timezone;
    }
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
  maskSensitiveData,
  getRestaurantIdForUser
};
