# Testing Guide - Stripe 100% Discount Promo Code

## Why We Need This

The production Stripe integration is in LIVE mode, which means:
- ❌ Cannot use test credit cards (4242 4242 4242 4242)
- ❌ Would require real payment method to test
- ✅ **Solution**: Create a 100% discount promo code for testing

## How to Create a 100% Discount Promo Code in Stripe

### Step 1: Access Stripe Dashboard
1. Go to [https://dashboard.stripe.com](https://dashboard.stripe.com)
2. Log in with your Stripe account credentials

### Step 2: Navigate to Coupons
1. Click on **Products** in the left sidebar
2. Click on **Coupons** in the dropdown menu
3. Click **+ New** button (top right)

### Step 3: Create the Testing Coupon
Configure the following settings:

**Coupon Details:**
- **Type**: Percentage discount
- **Percent Off**: `100` (this gives 100% off = FREE)
- **Name**: `Testing - 100% Off` (internal name for you)
- **Coupon ID**: `TEST100` (what customers enter) - Optional but recommended

**Duration:**
- Select: **Forever** (discount applies to all future invoices)
  - OR **Once** (applies only to first payment)
  - OR **Multiple months** (specify number of months)

**Advanced Options** (Optional):
- **Max redemptions**: Leave empty for unlimited testing
- **Expires on**: Leave empty or set far future date
- **Products**: Leave empty to apply to all products

### Step 4: Create Promotion Code
After creating the coupon:
1. Go to **Products** → **Promotion codes**
2. Click **+ New**
3. Select the coupon you just created (`TEST100`)
4. Configure:
   - **Code**: `TEST100` (what users type at checkout)
   - **Active**: Yes
   - **Customer facing name**: `100% Off Testing Code`
   - **Max redemptions**: Leave empty for unlimited
5. Click **Create promotion code**

## How to Use the Promo Code

### Option 1: Direct Checkout Link with Promo Code
When creating the Stripe checkout session in your code, add:
```javascript
const session = await stripe.checkout.sessions.create({
  // ... other params
  discounts: [{
    promotion_code: 'promo_xxxxx' // Stripe promo code ID
  }],
  // OR allow customer to enter:
  allow_promotion_codes: true
});
```

### Option 2: Manual Entry at Checkout
1. Start the checkout process normally
2. Click "Add promotion code" link on checkout page
3. Enter: `TEST100`
4. Total will show €0.00

## Testing the Complete Flow

### Test Scenario: Professional Plan Signup
1. Navigate to: https://restaurant-ai-mcp.vercel.app
2. Click **Start Free Trial** on Professional plan (€99.99/month)
3. Fill out the Stripe checkout form:
   - **Email**: `test@restaurant.com`
   - **Card**: Any real card OR leave empty if 100% off
   - **Name**: `Test Restaurant Owner`
   - **Address**: Any valid address
4. Click **Add promotion code**
5. Enter: `TEST100`
6. Verify total shows: **€0.00 due today**
7. Click **Start trial**
8. ✅ Should complete successfully and redirect to onboarding

### What Happens Next
- Customer email (`test@restaurant.com`) is captured
- Subscription is created in Stripe (€0.00/month due to coupon)
- Onboarding API receives `customer_email` from Stripe
- Restaurant account is created successfully
- User can access full platform

## Alternative: Stripe Test Mode (Requires Code Change)

If you want to use test mode instead:

1. **In Stripe Dashboard**: Toggle to "Test mode" (top right)
2. **Get Test API Keys**:
   - Go to Developers → API keys
   - Copy **Publishable key** (starts with `pk_test_`)
   - Copy **Secret key** (starts with `sk_test_`)

3. **Update Vercel Environment Variables**:
   - `STRIPE_PUBLISHABLE_KEY` → Test publishable key
   - `STRIPE_SECRET_KEY` → Test secret key
   - Redeploy or wait for auto-deploy

4. **Use Test Cards**:
   - Success: `4242 4242 4242 4242`
   - Declined: `4000 0000 0000 0002`
   - Expiration: Any future date
   - CVC: Any 3 digits

## Recommendation

**Use the 100% Promo Code approach** because:
- ✅ No code changes needed
- ✅ Tests the real production Stripe flow
- ✅ Can be used immediately
- ✅ Can be disabled/deleted easily after testing
- ✅ Simulates real customer experience

## Cleanup After Testing

1. Delete test subscriptions:
   - Stripe Dashboard → Customers
   - Find `test@restaurant.com`
   - Cancel subscription
   - Delete customer (optional)

2. Deactivate promo code:
   - Products → Promotion codes
   - Find `TEST100`
   - Click "..." → Deactivate
   - Or delete entirely

3. Clean up test restaurant data:
   - Use Supabase dashboard to delete test records
   - Or leave for ongoing testing

## Summary

**CRITICAL FIXES APPLIED:**

1. ✅ **BLOCKER #3 FIXED**: Walk-in seating bug
   - **Issue**: table_ids was being converted to comma-separated string
   - **Fix**: Pass table_ids as array to Supabase
   - **Status**: Deployed to production (commit c4ada74)

2. ✅ **BLOCKER #1 & #2 WORKAROUND**: Stripe checkout/onboarding
   - **Issue**: Cannot use test cards in live mode
   - **Workaround**: Use 100% discount promo code (documented above)
   - **Status**: Ready to implement

3. ℹ️ **White Text Issue**: Not found
   - Investigated "Add Walk-in" button
   - Text is white on indigo background (correct and readable)
   - May be browser/display specific - please provide screenshot if issue persists

## Next Steps

1. Create the `TEST100` promo code in Stripe (5 minutes)
2. Test complete user journey with promo code
3. Verify walk-in seating now works in production
4. Report any remaining issues
