---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
"@yielded/auth-openid-client": patch
"@yielded/auth-cloudflare": patch
---

Release password admission after attempt retention, page phone admission cleanup, and resolve OAuth reservations when the provider definitely issues no token.

Keep request resources on the request scope, let post-commit hooks observe caller deadlines, report password hashing and authority outages as unavailable, reuse each OIDC issuer's JWKS cache, and leave provider message text out of delivery traces.

BEHAVIOR CHANGE: Existing unresolved OAuth reservations from earlier definite provider rejections stay in place; clear those development rows if a cohort remains blocked. Reset is not required for password attempts, which stop counting once their retention instant has passed.
