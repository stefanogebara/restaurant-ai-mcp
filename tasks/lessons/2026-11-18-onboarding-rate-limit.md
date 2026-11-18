# Onboarding retry limits

The rate limiter reads a named policy from RATE_LIMITS. Its public check takes the request, response and policy name. Set the cap and window in that policy, then verify the effective headers or rejection count.
