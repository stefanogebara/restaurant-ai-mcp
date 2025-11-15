# Restaurant Config Performance Guide

## Performance Considerations

### 1. Index Strategy

#### What's Indexed (from migration)
```sql
-- B-tree indexes (standard lookups)
✅ user_id (PRIMARY - most common query)
✅ email (UNIQUE lookups)
✅ phone (UNIQUE lookups)
✅ city, country (location filtering)
✅ restaurant_type (analytics)
✅ is_active (filtered queries)

-- GIN indexes (JSONB fields)
✅ business_hours (JSONB queries)
✅ table_configuration (JSONB queries)
✅ reservation_settings (JSONB queries)
✅ team_members (JSONB queries)
```

#### Why This Works
- **B-tree indexes**: Fast exact matches, range queries
- **GIN indexes**: Fast JSONB queries (`?`, `@>`, `->`, `->>` operators)
- **Partial index on is_active**: Only indexes active restaurants (smaller, faster)

### 2. Query Performance

#### ✅ FAST Queries (Use These)
```sql
-- Single user lookup (uses user_id index)
SELECT * FROM restaurant_config WHERE user_id = $1 AND is_active = true;

-- Phone lookup (uses phone index)
SELECT * FROM restaurant_config WHERE phone = $1;

-- JSONB path queries (uses GIN index)
SELECT business_hours->'monday' FROM restaurant_config WHERE user_id = $1;
```

#### ⚠️ SLOW Queries (Avoid These)
```sql
-- ❌ Full table scan without index
SELECT * FROM restaurant_config WHERE website LIKE '%example%';

-- ❌ Complex JSONB operations without index
SELECT * FROM restaurant_config
WHERE jsonb_array_length(team_members) > 5;

-- ❌ Multiple JSONB array expansions in one query
SELECT * FROM restaurant_config,
  jsonb_array_elements(table_configuration) AS area,
  jsonb_array_elements(area->'tables') AS table;
-- Better: Do this in application layer after fetching data
```

### 3. Caching Strategy

#### Primary Pattern: Cache Full Config Per User
```javascript
// Redis caching example
class CachedConfigService extends RestaurantConfigService {
  async getAIAgentContext(userId) {
    const cacheKey = `restaurant_config:${userId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const config = await super.getAIAgentContext(userId);

    // Cache for 5 minutes (config changes are infrequent)
    await redis.setex(cacheKey, 300, JSON.stringify(config));

    return config;
  }

  async invalidateCache(userId) {
    await redis.del(`restaurant_config:${userId}`);
  }
}
```

#### Cache Invalidation Rules
```javascript
// Invalidate on ANY config update
async updateDayHours(userId, day, hours) {
  await super.updateDayHours(userId, day, hours);
  await this.invalidateCache(userId);
}

// Also invalidate on: table changes, team member changes, AI config updates
```

#### Cache TTL Recommendations
- **Full config**: 5-10 minutes (changes infrequently)
- **Business hours**: 1 hour (rarely changes mid-day)
- **Voice config**: 30 minutes
- **Table configuration**: 5 minutes (might change between shifts)

### 4. Connection Pooling

```javascript
// Supabase client with connection pooling
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      pool: {
        min: 2,
        max: 10, // Adjust based on concurrent AI calls
        idleTimeoutMillis: 30000
      }
    }
  }
);
```

### 5. Database Monitoring

#### Key Metrics to Track
```sql
-- Table size growth
SELECT pg_size_pretty(pg_total_relation_size('restaurant_config'));

-- Index usage (ensure indexes are being used)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  idx_tup_read AS rows_read
FROM pg_stat_user_indexes
WHERE tablename = 'restaurant_config'
ORDER BY idx_scan DESC;

-- Slow queries (pg_stat_statements extension)
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%restaurant_config%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### 6. JSONB Query Optimization

#### Efficient JSONB Operators
```sql
-- ✅ FAST: Direct path access
SELECT business_hours->'monday'->>'is_open'
FROM restaurant_config WHERE user_id = $1;

-- ✅ FAST: Containment check (uses GIN index)
SELECT * FROM restaurant_config
WHERE business_hours @> '{"monday": {"is_open": true}}';

-- ✅ FAST: Key existence (uses GIN index)
SELECT * FROM restaurant_config
WHERE business_hours ? 'monday';

-- ⚠️ SLOWER: jsonb_array_elements (requires array expansion)
SELECT * FROM restaurant_config,
  jsonb_array_elements(team_members) AS member;
-- Only use when necessary, prefer application-layer filtering
```

#### Application vs Database Processing
```javascript
// ❌ BAD: Complex JSONB query in database
const { data } = await supabase
  .from('restaurant_config')
  .select(`
    *,
    table_configuration->0->tables AS first_area_tables
  `)
  .eq('user_id', userId);

// ✅ GOOD: Fetch once, process in application
const { data } = await supabase
  .from('restaurant_config')
  .select('*')
  .eq('user_id', userId)
  .single();

// Process in JavaScript
const firstAreaTables = data.table_configuration[0].tables;
```

### 7. AI Agent Runtime Optimization

#### Pattern: Single Query Per Call
```javascript
// ✅ OPTIMAL: One query gets everything
async handleIncomingCall(phoneNumber) {
  const config = await configService.getAIAgentContext(userIdFromPhone);

  // Now we have everything in memory
  const greeting = config.ai_config.greeting_message;
  const isOpen = config.today.is_currently_open;
  const tables = findTablesForParty(config.table_configuration, partySize);

  // No additional database queries needed
}

// ❌ AVOID: Multiple queries per call
async handleIncomingCall(phoneNumber) {
  const voice = await getVoiceConfig(userId);     // Query 1
  const hours = await getBusinessHours(userId);   // Query 2
  const tables = await getTableConfig(userId);    // Query 3
  const policies = await getPolicies(userId);     // Query 4
  // 4x database round trips!
}
```

### 8. Scaling Considerations

#### Current Design Scales To:
- **~10,000 restaurants**: No issues with current indexes
- **~100,000 restaurants**: May need partitioning by region
- **~1M+ restaurants**: Consider separate microservice architecture

#### When to Partition
If you reach high scale, partition by region:
```sql
CREATE TABLE restaurant_config_us (
  CHECK (country = 'USA')
) INHERITS (restaurant_config);

CREATE TABLE restaurant_config_eu (
  CHECK (country IN ('UK', 'France', 'Germany', ...))
) INHERITS (restaurant_config);
```

#### Read Replicas
For read-heavy AI agent workloads:
```javascript
// Write to primary
await primarySupabase.from('restaurant_config').update(...);

// Read from replica
const config = await replicaSupabase.from('restaurant_config').select(...);
```

### 9. Security Performance Impact

#### RLS Policy Performance
```sql
-- ✅ EFFICIENT: Direct user_id check (uses index)
CREATE POLICY "Users can view own config"
  ON restaurant_config FOR SELECT
  USING (auth.uid() = user_id);

-- ⚠️ SLOWER: Complex RLS with joins
CREATE POLICY "Team members can view config"
  ON restaurant_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.restaurant_id = restaurant_config.id
        AND tm.user_id = auth.uid()
    )
  );
-- Avoid complex RLS; handle authorization in application layer
```

### 10. Best Practices Summary

#### ✅ DO
- Cache full config per user (5-10 min TTL)
- Use single query to fetch all AI agent context
- Leverage JSONB GIN indexes for complex queries
- Monitor query performance with pg_stat_statements
- Use connection pooling (min: 2, max: 10)
- Process JSONB arrays in application layer
- Invalidate cache on any config update

#### ❌ DON'T
- Make multiple queries per AI call
- Expand JSONB arrays unnecessarily in SQL
- Use complex RLS policies (handle in app layer)
- Cache for too long (config changes need quick propagation)
- Query without using indexed columns
- Store binary data in JSONB (use separate storage)

### 11. Example Benchmarks

#### Expected Query Times (with proper indexes)
```
Single user lookup:           < 5ms
Phone number lookup:          < 5ms
Full AI context query:        < 10ms
JSONB business hours query:   < 3ms
Table availability query:     < 5ms
Week schedule query:          < 10ms
```

#### Cache Hit Rates (target)
```
Restaurant config:            > 90% (rarely changes)
Business hours:              > 95% (very stable)
Voice settings:              > 85%
```

### 12. Monitoring Checklist

```javascript
// Log slow queries
if (queryTime > 50) {
  logger.warn(`Slow query: ${queryTime}ms`, { userId, query });
}

// Track cache hit rate
metrics.increment('config.cache.hit');
metrics.increment('config.cache.miss');

// Monitor database connections
metrics.gauge('db.pool.active', pool.activeConnections);
metrics.gauge('db.pool.idle', pool.idleConnections);

// Alert on high latency
if (avgQueryTime > 100) {
  alert('Restaurant config queries slow');
}
```

---

## Quick Reference

### Most Important Optimizations
1. **Cache full config per user** (biggest win)
2. **Single query per AI call** (reduce round trips)
3. **Use indexed columns** (user_id, phone, email)
4. **GIN indexes for JSONB** (already in migration)
5. **Connection pooling** (2-10 connections)

### Query Performance Hierarchy
```
user_id lookup:        ~5ms   ⚡⚡⚡ (indexed)
phone lookup:          ~5ms   ⚡⚡⚡ (indexed)
email lookup:          ~5ms   ⚡⚡⚡ (indexed)
JSONB path access:     ~3ms   ⚡⚡⚡ (GIN indexed)
JSONB array expand:    ~10ms  ⚡⚡  (GIN indexed, but slower)
Full table scan:       ~100ms ⚡   (avoid!)
```
