/**
 * Multi-Tenant Supabase Factory
 *
 * Creates and caches Supabase clients for specific restaurants.
 * Uses a connection pool with TTL to manage resources efficiently.
 * Falls back to central Supabase when restaurant-specific credentials aren't available.
 */

const { createClient } = require('@supabase/supabase-js');
const { centralSupabase } = require('./central-supabase');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('MultiTenantSupabase');

// Connection pool cache with timestamps
const connectionPool = new Map();

// Connection time-to-live (5 minutes)
const CONNECTION_TTL = 5 * 60 * 1000;

// Maximum connections in pool
const MAX_POOL_SIZE = 50;

/**
 * Get or create a Supabase client for a specific restaurant
 * @param {object} restaurant - Restaurant record with optional supabase_url and supabase_service_role_key
 * @returns {object} Supabase client (restaurant-specific or central fallback)
 */
function getRestaurantClient(restaurant) {
  // If restaurant doesn't have its own credentials, use central Supabase
  if (!restaurant || !restaurant.supabase_url || !restaurant.supabase_service_role_key) {
    logger.info('Restaurant credentials not available, using central Supabase');
    if (!centralSupabase) {
      logger.error('Central Supabase not configured');
      throw new Error('Database connection not available');
    }
    return centralSupabase;
  }

  const cacheKey = restaurant.id;

  // Check for existing valid connection
  const cached = connectionPool.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CONNECTION_TTL) {
    cached.lastUsed = Date.now();
    return cached.client;
  }

  // Clean up old connections if pool is getting large
  if (connectionPool.size >= MAX_POOL_SIZE) {
    cleanupPool();
  }

  // Create new client
  logger.info(`Creating new client for restaurant: ${restaurant.restaurant_name || restaurant.id}`);

  const client = createClient(
    restaurant.supabase_url,
    restaurant.supabase_service_role_key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  // Store in pool
  connectionPool.set(cacheKey, {
    client,
    timestamp: Date.now(),
    lastUsed: Date.now(),
    restaurantName: restaurant.restaurant_name
  });

  return client;
}

/**
 * Get a client using just URL and key (for backward compatibility)
 * @param {string} url - Supabase URL
 * @param {string} key - Supabase service role key
 * @returns {object} Supabase client
 */
function getClientByCredentials(url, key) {
  // Use URL as cache key for credential-based access
  const cacheKey = `url:${url}`;

  const cached = connectionPool.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CONNECTION_TTL) {
    cached.lastUsed = Date.now();
    return cached.client;
  }

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  connectionPool.set(cacheKey, {
    client,
    timestamp: Date.now(),
    lastUsed: Date.now()
  });

  return client;
}

/**
 * Clean up expired connections from pool
 */
function cleanupPool() {
  const now = Date.now();
  let removed = 0;

  for (const [key, value] of connectionPool.entries()) {
    // Remove if expired or least recently used
    if (now - value.timestamp > CONNECTION_TTL || now - value.lastUsed > CONNECTION_TTL) {
      connectionPool.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(`Cleaned up ${removed} expired connections. Pool size: ${connectionPool.size}`);
  }
}

/**
 * Clear all connections from pool
 */
function clearConnectionPool() {
  const size = connectionPool.size;
  connectionPool.clear();
  logger.info(`Cleared ${size} connections from pool`);
}

/**
 * Get current pool statistics
 * @returns {object} Pool stats
 */
function getPoolStats() {
  return {
    size: connectionPool.size,
    maxSize: MAX_POOL_SIZE,
    ttlMs: CONNECTION_TTL,
    connections: Array.from(connectionPool.entries()).map(([key, value]) => ({
      key: key.substring(0, 20) + '...',
      restaurantName: value.restaurantName || 'N/A',
      ageMs: Date.now() - value.timestamp,
      lastUsedMs: Date.now() - value.lastUsed
    }))
  };
}

/**
 * Check if restaurant has a valid cached connection
 * @param {string} restaurantId - Restaurant UUID
 * @returns {boolean} True if valid connection exists
 */
function hasValidConnection(restaurantId) {
  const cached = connectionPool.get(restaurantId);
  return cached && Date.now() - cached.timestamp < CONNECTION_TTL;
}

module.exports = {
  getRestaurantClient,
  getMultiTenantClient: getRestaurantClient, // Alias for backward compatibility
  getClientByCredentials,
  cleanupPool,
  clearConnectionPool,
  getPoolStats,
  hasValidConnection
};
