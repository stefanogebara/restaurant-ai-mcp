# Subscription System Setup Guide

Complete guide to setting up the HostGenius subscription and feature gating system.

## 📋 Table of Contents

1. [Airtable Setup](#1-airtable-setup)
2. [Environment Variables](#2-environment-variables)
3. [Stripe Webhook Configuration](#3-stripe-webhook-configuration)
4. [Testing the System](#4-testing-the-system)
5. [Usage Examples](#5-usage-examples)

---

## 1. Airtable Setup

### Create Subscriptions Table

1. Go to your Airtable base: https://airtable.com/appm7zo5vOf3c3rqm
2. Click **"Add or import"** → **"Create empty table"**
3. Name the table: **"Subscriptions"**
4. Create the following fields:

| Field Name | Field Type | Options/Notes |
|------------|------------|---------------|
| `Subscription ID` | Single line text | PRIMARY KEY - Stripe subscription ID |
| `Customer ID` | Single line text | Stripe customer ID |
| `Customer Email` | Email | Customer's email address |
| `Plan Name` | Single select | Options: `basic`, `professional`, `enterprise` |
| `Price ID` | Single line text | Stripe price ID |
| `Status` | Single select | Options: `active`, `trialing`, `past_due`, `canceled`, `unpaid` |
| `Current Period Start` | Date | Subscription billing period start |
| `Current Period End` | Date | Subscription billing period end |
| `Trial End` | Date | Trial end date (optional) |
| `Canceled At` | Date | Cancellation date (optional) |
| `Created At` | Date | Subscription creation date |

### Get the Table ID

1. Click on the **Subscriptions** table
2. Look at the URL: `https://airtable.com/appm7zo5vOf3c3rqm/tblXXXXXXXXXXXXXX`
3. Copy the table ID (starts with `tbl`)
4. Example: `tblSubscriptions123456`

---

## 2. Environment Variables

### Add to Vercel

1. Go to: https://vercel.com/stefanogebara/restaurant-ai-mcp/settings/environment-variables
2. Add the following variable:

```
Name: SUBSCRIPTIONS_TABLE_ID
Value: tblYourSubscriptionsTableID
Environment: Production, Preview, Development
```

3. Click **"Save"**
4. **Redeploy** your application for changes to take effect

### Local Development

Add to your `.env` file:

```bash
# Subscriptions
SUBSCRIPTIONS_TABLE_ID=tblYourSubscriptionsTableID
```

---

## 3. Stripe Webhook Configuration

### Get Webhook Signing Secret

1. Go to Stripe Dashboard: https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. Enter endpoint URL:
   ```
   https://restaurant-ai-mcp.vercel.app/api/stripe-webhook
   ```
4. Select events to listen for:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`
   - ✅ `customer.subscription.trial_will_end`

5. Click **"Add endpoint"**
6. Copy the **"Signing secret"** (starts with `whsec_`)

### Add Webhook Secret to Vercel

1. Go to Vercel environment variables
2. Add:
   ```
   Name: STRIPE_WEBHOOK_SECRET
   Value: whsec_your_webhook_secret_here
   Environment: Production
   ```
3. Click **"Save"** and redeploy

---

## 4. Testing the System

### Test Subscription Flow

1. **Create a test subscription:**
   ```bash
   # Navigate to pricing page
   https://restaurant-ai-mcp.vercel.app/#pricing
   ```

2. **Click "Start Free Trial" on any plan**

3. **Use Stripe test card:**
   ```
   Card Number: 4242 4242 4242 4242
   Expiry: Any future date (e.g., 12/34)
   CVC: Any 3 digits (e.g., 123)
   ZIP: Any 5 digits (e.g., 12345)
   ```

4. **Complete checkout**

5. **Verify in Airtable:**
   - Go to Subscriptions table
   - You should see a new record with:
     - Customer email
     - Plan name (basic/professional/enterprise)
     - Status: `trialing`
     - Trial end date (14 days from now)

### Test Webhook Events

1. **Go to Stripe Dashboard** → **Webhooks**
2. Click on your webhook endpoint
3. Click **"Send test webhook"**
4. Select event type: `customer.subscription.created`
5. Click **"Send test webhook"**
6. Check Vercel logs to see if webhook was received

### Test Frontend Subscription Check

1. **Open browser console** on your site
2. **Run this JavaScript:**
   ```javascript
   fetch('/api/subscription-status?email=YOUR_TEST_EMAIL@example.com')
     .then(res => res.json())
     .then(data => console.log(data));
   ```

3. **You should see:**
   ```json
   {
     "has_subscription": true,
     "subscription": {
       "plan": "professional",
       "status": "trialing",
       "is_active": true,
       "is_trial": true
     }
   }
   ```

---

## 5. Usage Examples

### Frontend: Check Subscription Status

```typescript
import { useSubscription } from '@/hooks/useSubscription';

function MyComponent() {
  const { data, isLoading } = useSubscription({
    email: 'customer@example.com'
  });

  if (isLoading) return <div>Loading...</div>;

  if (!data?.has_subscription) {
    return <UpgradePrompt feature="Advanced Analytics" />;
  }

  return <div>Welcome, {data.subscription.plan} user!</div>;
}
```

### Frontend: Check Feature Access

```typescript
import { useFeatureAccess } from '@/hooks/useSubscription';

function AnalyticsPanel() {
  const { hasAccess, isLoading } = useFeatureAccess(
    'advanced_analytics',
    'customer@example.com'
  );

  if (!hasAccess) {
    return <UpgradePrompt feature="Advanced Analytics" />;
  }

  return <AdvancedAnalytics />;
}
```

### Frontend: Display Plan Badge

```typescript
import PlanBadge from '@/components/PlanBadge';
import { usePlanInfo } from '@/hooks/useSubscription';

function UserProfile() {
  const { planName, isTrial } = usePlanInfo('customer@example.com');

  return (
    <div>
      <h2>Your Plan</h2>
      <PlanBadge plan={planName} isTrial={isTrial} />
    </div>
  );
}
```

### Backend: Protect Routes (Example)

```javascript
// api/advanced-analytics.js
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');

module.exports = async (req, res) => {
  // Apply middleware manually for Vercel serverless
  try {
    // Check subscription
    await new Promise((resolve, reject) => {
      checkSubscription(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check feature access
    await new Promise((resolve, reject) => {
      requireFeature('advanced_analytics')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // User has access - return data
    return res.status(200).json({
      analytics: {
        // ... advanced analytics data
      }
    });
  } catch (error) {
    // Middleware will have already sent error response
    return;
  }
};
```

---

## 🎯 Plan Feature Matrix

| Feature | Basic | Professional | Enterprise |
|---------|-------|--------------|------------|
| AI Reservations | ✅ | ✅ | ✅ |
| Host Dashboard | ✅ | ✅ | ✅ |
| Basic Analytics | ✅ | ✅ | ✅ |
| **Advanced Analytics** | ❌ | ✅ | ✅ |
| **Waitlist Management** | ❌ | ✅ | ✅ |
| **SMS Notifications** | ❌ | ✅ | ✅ |
| **Priority Support** | ❌ | ✅ | ✅ |
| **Multi-Location** | ❌ | ❌ | ✅ |
| **Custom Integrations** | ❌ | ❌ | ✅ |
| **White Label** | ❌ | ❌ | ✅ |
| **24/7 Phone Support** | ❌ | ❌ | ✅ |
| **Dedicated Account Manager** | ❌ | ❌ | ✅ |
| **Reservation Limit** | 50/month | Unlimited | Unlimited |

---

## 🔧 Troubleshooting

### Webhook Not Receiving Events

1. Check Vercel logs: `vercel logs --follow`
2. Verify webhook URL is correct in Stripe dashboard
3. Test with "Send test webhook" in Stripe
4. Check webhook signing secret matches environment variable

### Subscription Not Showing in Airtable

1. Verify `SUBSCRIPTIONS_TABLE_ID` is correct
2. Check Airtable API key has write permissions
3. Look at Vercel function logs for errors
4. Test webhook manually in Stripe dashboard

### Frontend Not Detecting Subscription

1. Check customer email is correct
2. Verify subscription exists in Airtable
3. Check API endpoint: `/api/subscription-status?email=test@example.com`
4. Open browser console for fetch errors

---

## 📚 Related Files

- **Backend:**
  - `api/services/subscription-limits.js` - Plan limits configuration
  - `api/_lib/airtable.js` - Subscription CRUD operations
  - `api/_lib/subscription-middleware.js` - Auth middleware
  - `api/stripe-webhook.js` - Stripe event handlers
  - `api/subscription-status.js` - Frontend API endpoint

- **Frontend:**
  - `client/src/hooks/useSubscription.ts` - Subscription hook
  - `client/src/components/UpgradePrompt.tsx` - Upgrade modal
  - `client/src/components/UpgradeBanner.tsx` - Inline upgrade banner
  - `client/src/components/PlanBadge.tsx` - Plan display badge

---

## 🚀 Next Steps

1. ✅ Complete Airtable setup
2. ✅ Add environment variables
3. ✅ Configure Stripe webhook
4. ✅ Test subscription flow
5. ⬜ Implement feature gating in your dashboard
6. ⬜ Add upgrade prompts to restricted features
7. ⬜ Test with real payment (switch to live keys)
8. ⬜ Monitor webhook events in production

---

**Need help?** Check the troubleshooting section or contact support.
