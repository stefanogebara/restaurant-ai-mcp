/**
 * Authentication Middleware
 *
 * Provides JWT-based authentication for API endpoints
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { supabaseAdmin: supabase } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
require('./validate-env'); // Auto-warns about missing critical env vars on cold start
const logger = createSecureLogger('Auth');

// JWT_SECRET for internally generated tokens (HS256)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.warn('JWT_SECRET not set — internal token signing/verification will be unavailable');
}

const JWT_EXPIRY = '8h';

// JWKS client for verifying Supabase ECC (ES256) tokens
// Supabase migrated from HS256 to ECC (P-256) signing
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const jwks = SUPABASE_URL ? jwksClient({
  jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  rateLimit: true,
}) : null;

function getSigningKey(header, callback) {
  if (!jwks) return callback(new Error('JWKS client not configured'));
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

async function verifyWithJWKS(token) {
  if (!jwks) throw new Error('JWKS client not configured');
  return new Promise((resolve, reject) => {
    jwt.verify(token, getSigningKey, { algorithms: ['ES256', 'RS256'] }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}

// Cache user→restaurant mappings (TTL 5 minutes) to avoid repeated DB lookups
const restaurantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Cache token→decoded user (TTL 10 seconds) to avoid repeated Supabase getUser() calls.
// Intentionally short: a revoked token will only replay for at most TOKEN_CACHE_TTL ms
// before the next liveness check forces it out.
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 3 * 1000;

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
    // 1. Check if this user is the restaurant owner
    const { data: ownerData, error: ownerError } = await supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, timezone')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!ownerError && ownerData) {
      const result = {
        restaurantId: ownerData.id,
        timezone: ownerData.timezone || 'UTC',
        role: 'owner',
        timestamp: Date.now(),
      };
      restaurantCache.set(userId, result);

      if (restaurantCache.size > 500) {
        const now = Date.now();
        for (const [key, val] of restaurantCache.entries()) {
          if (now - val.timestamp > CACHE_TTL) restaurantCache.delete(key);
        }
      }

      return result;
    }

    // 2. Check restaurant_members (team member path)
    const { data: memberData, error: memberError } = await supabase
      .schema('restaurant')
      .from('restaurant_members')
      .select('restaurant_id, role, restaurant_config!inner(timezone)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!memberError && memberData) {
      const result = {
        restaurantId: memberData.restaurant_id,
        timezone: memberData.restaurant_config?.timezone || 'UTC',
        role: memberData.role,
        timestamp: Date.now(),
      };
      restaurantCache.set(userId, result);
      return result;
    }

    logger.info(`[Auth] No restaurant found for user ${userId}`);
    return null;
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

  // Check token cache first to avoid repeated verification calls
  const cached = tokenCache.get(token);
  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
    return cached.decoded;
  }

  let decoded = null;

  // Helper: confirm the session is still live with Supabase.
  // Returns the Supabase user object on success, null on revoked/error.
  // SEC-09: This is the critical liveness gate that prevents post-logout token replay.
  async function checkSessionLiveness() {
    if (!supabase) return null; // Supabase client unavailable — skip (defense in depth)
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return null;
      return user;
    } catch {
      return null;
    }
  }

  // 1. Try HS256 verification with JWT_SECRET (for internally generated tokens)
  if (JWT_SECRET) {
    try {
      const hs256Decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      // SEC-09 fix: signature alone is not enough — confirm the session is still active
      const liveUser = await checkSessionLiveness();
      if (!liveUser) {
        // Session revoked (logged out) — evict any stale cache entry and reject
        tokenCache.delete(token);
        logger.info('[Auth] HS256 token rejected: session no longer active (post-logout replay)');
        return null;
      }
      decoded = hs256Decoded;
    } catch (jwtError) {
      // Not a custom HS256 token — try JWKS next
    }
  }

  // 2. Try JWKS verification (for Supabase ECC/ES256 tokens)
  if (!decoded && jwks) {
    try {
      const jwksDecoded = await verifyWithJWKS(token);
      // SEC-09 fix: signature alone is not enough — confirm the session is still active
      const liveUser = await checkSessionLiveness();
      if (!liveUser) {
        // Session revoked (logged out) — evict any stale cache entry and reject
        tokenCache.delete(token);
        logger.info('[Auth] JWKS token rejected: session no longer active (post-logout replay)');
        return null;
      }
      decoded = jwksDecoded;
    } catch (jwksError) {
      // JWKS verification failed — try Supabase API as final fallback
    }
  }

  // 3. Final fallback: Supabase API (handles edge cases, token refresh).
  // This path already validates session liveness via getUser(), so no extra check needed.
  if (!decoded && supabase) {
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
    } catch (supabaseError) {
      logger.error('[Auth] Supabase verification error:', supabaseError.message);
      return null;
    }
  }

  if (!decoded) return null;

  // Ensure restaurant_id, timezone, and role are present on the user object
  if (!decoded.restaurant_id && decoded.sub) {
    const restaurant = await getRestaurantIdForUser(decoded.sub);
    if (restaurant) {
      decoded.restaurant_id = restaurant.restaurantId;
      decoded.timezone = restaurant.timezone;
      decoded.role = restaurant.role || 'owner';
    }
  }

  // Cache verified token to avoid repeated verification on subsequent requests
  tokenCache.set(token, { decoded, timestamp: Date.now() });

  // Evict old entries if cache grows too large
  if (tokenCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of tokenCache.entries()) {
      if (now - val.timestamp > TOKEN_CACHE_TTL) tokenCache.delete(key);
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

    // SEC-H3: Cookie fallback — backward-compat only.
    // No production code sets the auth_token cookie (res.cookie / Set-Cookie are not used).
    // verifyAuth() used by all Vercel serverless handlers does NOT read cookies.
    // If a cookie-based flow is ever added, the Set-Cookie header MUST include
    // SameSite=Strict; Secure; HttpOnly to prevent CSRF and interception.
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // Verify token
    const user = await verifyJWT(token);

    if (!user && required) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check roles if specified
    if (user && roles.length > 0 && !roles.includes(user.role)) {
      res.setHeader('Cache-Control', 'no-store');
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
