# @yielded/auth-persistence-convex

Convex storage for Yielded Auth's `OAuthServer.Persistence`: consent, authorization
code redemption, and refresh-token families. Each grant occupies one indexed
Convex document. Conditional writes and monotonic revocation commit through
internal mutations called from an action or HTTP action.

The application owns its Convex deployment, identity authority, function exports,
and cleanup schedule. Effect Schema validates persisted and transported records;
bearer credentials are never stored. Unknown mutation outcomes remain unavailable
and are never automatically retried by the adapter.

This initial adapter covers OAuth authorization-server grants. Passwords,
sign-in proofs, and session persistence are not implemented.
See the [Convex persistence guide](../../docs/src/content/docs/guide/convex.mdx).
