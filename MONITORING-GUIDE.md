# Production Monitoring Guide - Restaurant AI MCP

**Last Updated**: 2025-10-27
**Status**: Implemented
**Based on**: 2025 Best Practices for Node.js Serverless Monitoring

---

## Overview

This guide outlines the comprehensive monitoring and observability strategy for the Restaurant AI MCP platform, following 2025 industry best practices for serverless Node.js applications.

---

## Core Monitoring Components

### 1. Health Check Endpoint

**URL**: `https://restaurant-ai-mcp.vercel.app/api/health`

**Features**:
- Database connectivity checks
- Stale data detection
- Data quality validation
- Real-time metrics collection
- Automated alert generation

**Usage**:
```bash
# Basic health check
curl https://restaurant-ai-mcp.vercel.app/api/health

# Detailed metrics
curl https://restaurant-ai-mcp.vercel.app/api/health?detailed=true
```

**Response Format**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T15:30:00.000Z",
  "responseTime": "245ms",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection successful",
      "tablesCount": 12
    },
    "staleData": {
      "status": "healthy",
      "staleServiceRecords": 0,
      "staleWaitlistEntries": 0,
      "totalStaleRecords": 0,
      "message": "No stale data detected"
    },
    "dataQuality": {
      "status": "healthy",
      "nullDataCount": 0,
      "message": "All data quality checks passed"
    }
  },
  "alerts": []
}
```

---

## Monitoring Thresholds

### Stale Data Detection

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Service Records | > 12 hours | Warning | Complete service or delete record |
| Waitlist Entries | > 24 hours | Warning | Remove from waitlist |
| Reservations | > 90 days future | Info | Review reservation validity |

### Performance Metrics

| Metric | Baseline | Alert Threshold | Severity |
|--------|----------|-----------------|----------|
| API Response Time | 100-500ms | > 2000ms | Warning |
| Database Query Time | 50-200ms | > 1000ms | Warning |
| Health Check Time | < 500ms | > 2000ms | Critical |

### Data Quality Metrics

| Check | Expected | Alert On | Severity |
|-------|----------|----------|----------|
| NULL Customer Names | 0 | > 0 | Info |
| NULL Party Sizes | 0 | > 0 | Info |
| Invalid Phone Numbers | 0 | > 5 | Warning |

---

## Alert Types and Responses

### 1. Stale Data Alerts

**Alert**:
```json
{
  "severity": "warning",
  "type": "stale_data",
  "message": "Found 2 stale service record(s) older than 12 hours",
  "action": "DELETE old service records via Complete Service flow"
}
```

**Response Actions**:
1. Review stale records in dashboard
2. Complete service for legitimate parties
3. Delete test data using cleanup scripts
4. Investigate why service wasn't completed

**Automation Options**:
- Schedule daily cleanup job via Vercel Cron
- Auto-complete services after 24 hours
- Send email notification to ops team

### 2. Data Quality Alerts

**Alert**:
```json
{
  "severity": "info",
  "type": "data_quality",
  "message": "Found 3 record(s) with NULL/missing required fields",
  "action": "Review data validation in API endpoints"
}
```

**Response Actions**:
1. Identify affected records via health check
2. Add validation to prevent future NULL values
3. Clean up existing NULL data
4. Review API endpoint validation logic

### 3. Database Connectivity Alerts

**Alert**:
```json
{
  "severity": "critical",
  "type": "database_error",
  "message": "Database connection failed",
  "action": "Check Airtable API key and network connectivity"
}
```

**Response Actions**:
1. Check Airtable service status
2. Verify API key in Vercel environment variables
3. Check network connectivity
4. Review Vercel function logs

---

## Monitoring Best Practices (2025)

### 1. Establish Baselines

**Key Metrics to Track**:
- Average response time: 200-500ms
- P95 response time: < 1000ms
- Error rate: < 0.1%
- Stale data count: 0
- NULL data count: 0

**Baseline Collection**:
```bash
# Collect 24 hours of baseline data
for i in {1..288}; do
  curl -s "https://restaurant-ai-mcp.vercel.app/api/health?detailed=true" >> baseline-metrics.json
  sleep 300  # Every 5 minutes
done
```

### 2. Meaningful Alerts

**Do's**:
- Alert on deviations from baseline (>2x normal)
- Group related alerts to reduce noise
- Include actionable remediation steps
- Set different severity levels

**Don'ts**:
- Alert on every minor fluctuation
- Send alerts without context
- Create alerts without clear owners
- Ignore alert fatigue

### 3. Distributed Tracing Readiness

**Current Implementation**:
- Request timestamps in all API responses
- Error logging with context
- Performance timing in health checks

**Future Enhancement**:
- Integrate AWS X-Ray for Vercel
- Add correlation IDs to requests
- Track full request lifecycle
- Monitor cold start latency

### 4. Real-time Synchronization

**Current Approach**:
- 30-second polling in frontend
- Real-time database queries
- No data caching beyond React Query

**Recommendations**:
- Consider WebSocket for instant updates
- Implement optimistic UI updates
- Add server-sent events for alerts

---

## Automated Monitoring Setup

### Option 1: Vercel Cron Jobs

Create `vercel.json` cron configuration:

```json
{
  "crons": [{
    "path": "/api/health",
    "schedule": "*/5 * * * *"
  }, {
    "path": "/api/cleanup-stale-data",
    "schedule": "0 0 * * *"
  }]
}
```

**Benefits**:
- Built-in to Vercel
- No external service needed
- Automatic retry on failure

**Limitations**:
- Max 1 cron per minute
- 10 second execution limit
- No alert notifications

### Option 2: UptimeRobot (Free Tier)

**Setup**:
1. Create monitor at uptimerobot.com
2. URL: `https://restaurant-ai-mcp.vercel.app/api/health`
3. Interval: Every 5 minutes
4. Alert on: Status code ≠ 200

**Benefits**:
- Email/SMS notifications
- Status page creation
- Historical uptime tracking
- Free for 50 monitors

### Option 3: Better Uptime

**Setup**:
1. Sign up at betterstack.com/better-uptime
2. Create HTTP monitor
3. Advanced checks: Parse JSON response
4. Alert if `status !== "healthy"`

**Benefits**:
- JSON response validation
- Slack/PagerDuty integration
- Incident management
- Free tier: 10 monitors

### Option 4: AWS CloudWatch (Advanced)

**For Production Scale**:
```javascript
// In Vercel function
const { CloudWatch } = require('@aws-sdk/client-cloudwatch');
const cloudwatch = new CloudWatch({ region: 'us-east-1' });

// Put custom metrics
await cloudwatch.putMetricData({
  Namespace: 'RestaurantAI/Production',
  MetricData: [{
    MetricName: 'StaleDataCount',
    Value: staleDataCount,
    Unit: 'Count',
    Timestamp: new Date()
  }]
});
```

**Benefits**:
- Enterprise-grade monitoring
- Automated actions via Lambda
- Deep AWS integration
- Customizable dashboards

---

## Testing the Monitoring System

### 1. Health Check Test

```bash
# Test basic health
curl -i https://restaurant-ai-mcp.vercel.app/api/health

# Expected: 200 OK, status: "healthy"
```

### 2. Stale Data Detection Test

```bash
# Add test data older than threshold
# (via Airtable or API)

# Check health
curl -s https://restaurant-ai-mcp.vercel.app/api/health | jq '.alerts'

# Expected: Warning alert about stale data
```

### 3. Performance Test

```bash
# Measure response time
time curl -s https://restaurant-ai-mcp.vercel.app/api/health

# Expected: < 2 seconds
```

### 4. Load Test

```bash
# Send 100 concurrent requests
for i in {1..100}; do
  curl -s https://restaurant-ai-mcp.vercel.app/api/health &
done
wait

# Monitor: No 503 errors, consistent response times
```

---

## Monitoring Dashboard Integration

### Current Observability Dashboard

**Location**: `/observability` (Week 7-8 feature)

**Metrics Displayed**:
- System health status
- Active alerts count
- Response time chart
- Error rate over time
- Stale data tracking

**Integration**:
```typescript
// In ObservabilityDashboard.tsx
const { data: health } = useQuery({
  queryKey: ['health', 'detailed'],
  queryFn: async () => {
    const res = await fetch('/api/health?detailed=true');
    return res.json();
  },
  refetchInterval: 30000  // Refresh every 30s
});
```

---

## Incident Response Playbook

### Scenario 1: Stale Data Alert

**Symptoms**: Health check shows stale records

**Steps**:
1. **Assess Impact**: Check how many records, how old
2. **Identify Type**: Service records or waitlist entries?
3. **Manual Review**: Are these legitimate or test data?
4. **Clean Up**:
   - Service records: Use Complete Service flow
   - Waitlist: DELETE via API endpoint
5. **Prevent**: Add validation, improve workflows
6. **Document**: Update runbook with findings

**Timeline**: < 1 hour for resolution

### Scenario 2: Database Connectivity Failure

**Symptoms**: Health check returns 503, database: "unhealthy"

**Steps**:
1. **Verify Airtable**: Check status.airtable.com
2. **Check Credentials**: Verify API key in Vercel
3. **Test Manually**: Use curl to test Airtable API
4. **Review Logs**: Check Vercel function logs
5. **Escalate**: Contact Airtable support if needed
6. **Communicate**: Update status page

**Timeline**: Depends on Airtable status

### Scenario 3: Slow Response Times

**Symptoms**: Response time > 2000ms consistently

**Steps**:
1. **Identify Bottleneck**: Check which health check is slow
2. **Database Query**: Optimize Airtable filters
3. **Code Review**: Look for N+1 queries
4. **Caching**: Consider adding Redis/Upstash
5. **Scale**: Review Vercel function configuration
6. **Monitor**: Track improvement over 24h

**Timeline**: 2-4 hours for investigation + fixes

---

## Future Enhancements

### Short Term (Next 2 Weeks)

- [ ] Set up UptimeRobot monitoring
- [ ] Create Slack alerts for critical issues
- [ ] Add automated daily cleanup cron job
- [ ] Document baseline metrics

### Medium Term (Next Month)

- [ ] Integrate with Sentry for error tracking
- [ ] Add distributed tracing (X-Ray or Datadog)
- [ ] Create public status page
- [ ] Set up performance budgets

### Long Term (Next Quarter)

- [ ] AI-powered anomaly detection
- [ ] Predictive alerting based on trends
- [ ] Multi-region health checks
- [ ] Advanced SLA tracking

---

## Key Metrics Dashboard

**Daily Monitoring Checklist**:
- [ ] Check health endpoint status
- [ ] Review alert count (should be 0)
- [ ] Verify stale data count (should be 0)
- [ ] Monitor response times (should be < 500ms)
- [ ] Check error logs in Vercel

**Weekly Review**:
- [ ] Analyze baseline metric trends
- [ ] Review and update thresholds
- [ ] Test alerting workflows
- [ ] Document any incidents

**Monthly Audit**:
- [ ] Review all alert configurations
- [ ] Update monitoring documentation
- [ ] Optimize health check performance
- [ ] Plan monitoring improvements

---

## Resources

### Documentation
- Health Check API: `/api/health`
- Observability Dashboard: `/observability`
- Session Summary: `SESSION-OCT-27-DATA-CLEANUP-COMPLETE.md`

### External Tools
- Airtable Status: https://status.airtable.com
- Vercel Status: https://www.vercel-status.com
- UptimeRobot: https://uptimerobot.com
- Better Uptime: https://betterstack.com/better-uptime

### Best Practices References
- Node.js Observability 2025: https://nodesource.com/blog/nodejs-observability-tools-2025
- Serverless Monitoring: https://www.serverless.com/blog/best-tools-serverless-observability
- Stale Data Detection: https://dqops.com/stale-data-definition-examples/

---

**Status**: Production Ready
**Next Review**: 2025-11-27
**Owner**: Development Team
