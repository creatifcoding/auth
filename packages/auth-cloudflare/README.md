# @yielded/auth-cloudflare

Cloudflare Worker email delivery for Yielded Auth through `effect-cf`.
`layerEmailProofDelivery` implements the `EmailProofDelivery` service used by
email sign-in, verification, and password recovery. The application owns the
Worker binding, sender domain, and deployment configuration.

The default `EmailRenderer` handles numeric codes. Password recovery defaults to
**tokens**. Set `reset.secret` to `{ _tag: "NumericCode", digits: 6 }` in
`Password.make({ registration, reset })` and supply `Proofs.ProofKeys` to use the
default renderer. Follow the [password recovery recipe](../../docs/src/content/docs/guide/passwords.md#recover-a-password-with-cloudflare-email)
for Layer composition, private continuation delivery, and completion. Provide
`EmailRenderer` for custom wording, localization, or application-owned token links.
Unsupported formats fail with `DefiniteFailure` / `policy` before calling the
provider. The Layer receives no strategy proof policy, so it cannot diagnose that
mismatch at construction; it validates the Worker binding's availability and shape.

Delivery awaits provider acceptance, which does not prove inbox delivery. Local
email validation failures are definite policy failures; correct configuration
before a fresh, rate-limited recovery request. Typed provider
`EmailOperationError` failures are conservatively `Ambiguous`. No delivery-ID deduplication is promised, so the
adapter never retries an uncertain send. Keep message bodies and secrets out of
logs and public results.

A generic recovery receipt does not prove delivery. Dispatch is process-local,
not a durable outbox: a crash after persistence commits can leave an unsent proof.
An exact request retry does not guarantee a resend. After checking their inbox,
the user can explicitly start a new flow under application cooldown and attempt
limits; do not infer permission to resend or repeat a password mutation from an
uncertain outcome.

Use the current `@yielded/auth-persistence-drizzle/D1` or `/SqliteDo` strategy
adapters for storage. See the [email guide](../../docs/src/content/docs/guide/codes.md#cloudflare-worker-delivery)
for composition.
