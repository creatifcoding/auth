# @yielded/auth-cloudflare

Cloudflare Worker email delivery for Yielded Auth through `effect-cf`.
`layerEmailProofDelivery` implements the `EmailProofDelivery` service used by
email sign-in, verification, and password recovery. The application owns the
Worker binding, sender domain, and deployment configuration.

The default `EmailRenderer` handles numeric codes. Provide that service for
custom wording, localization, or magic links. Delivery awaits provider acceptance;
uncertain sends remain ambiguous and are never automatically retried.

Use the current `@yielded/auth-persistence-drizzle/D1` or `/SqliteDo` strategy
adapters for storage. See the [email guide](../../docs/src/content/docs/guide/codes.md#cloudflare-worker-delivery)
for composition.
