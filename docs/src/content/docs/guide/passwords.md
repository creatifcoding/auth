---
title: Passwords
description: Register accounts, sign in, and change passwords.
---

Use `Password.make()` for existing-account sign-in. Configure registration and
recovery to enable full password management.

## Enable passwords

```ts title="apps/server/auth.ts"
import { Schema } from "effect";
import { Auth, Password, Sessions } from "@yielded/auth";

export const AppAuth = Auth.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  sessions: Sessions.stateful(),
  strategies: {
    password: Password.make({
      registration: Schema.Struct({ displayName: Schema.NonEmptyString }),
    }),
  },
  defaultStrategy: "password",
});
```

Password policy and reset-token expiry have defaults. Your application controls
account creation and recovery delivery. Override `policy` or `reset` when needed. For sign-in only, use
`password: Password.make()` as in [getting started](./getting-started).

This definition exposes local methods. The calls below belong inside an existing
Effect request handler, with `AppAuth` provided and the HTTP request boundary in
place. To expose methods to a browser, declare them in the
[shared contract](./http-and-client#define-the-routes); enabling registration or
reset support does not automatically publish those endpoints.

## Register an account

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.register({
  requestId,
  email,
  newPassword,
  registration: { displayName },
});
```

Generate `requestId` once per submission and retain it for an exact retry.
`RegistrationAccepted` does not reveal whether the account already existed.

## Handle a rejected sign-in

With `Effect` imported from `effect`, handle only the expected rejection:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.signIn({ email, password }).pipe(
  Effect.catchTag("PasswordRejected", () =>
    Effect.succeed({ _tag: "InvalidCredentials" as const }),
  ),
);
```

Use the same message for a missing account and a wrong password. Storage and
hashing failures remain errors; do not turn them into successful sign-ins.
An `Authenticated` result carries the session; an additional-factor result
must be completed before granting access.

## Change a password

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.changePassword({ commandId, currentPassword, newPassword });
```

This call requires an authenticated `Auth.AuthRequest`. Applications requiring
another factor also supply `actionProof`. The result reports the session
invalidation behavior of your selected strategy.

## Supply the services

Supply `PasswordHashing` explicitly. The maintained Argon2id adapter lives in
`@yielded/auth-crypto/Password`; its Layer also requires bounded KDF admission and
Web Crypto. Storage, claims, account creation, screening, and change authorization
remain application-owned:

```ts title="apps/server/password-live.ts"
import { Layer } from "effect";
import { Password, Proofs, WebCrypto } from "@yielded/auth";
import * as PasswordCrypto from "@yielded/auth-crypto/Password";

import { AppAuth } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { authorizePasswordChange, registerAccount, resolvePasswordClaims } from "./auth-accounts";
import { PasswordPersistenceLive, ProofPersistenceLive } from "./auth-persistence";
import { checkPassword } from "./password-screening";
import { emailVendor, sendEmail } from "./email";

export const PasswordLive = Layer.mergeAll(
  PasswordCrypto.layer().pipe(
    Layer.provide(Password.PasswordKdfAdmission.layer()),
    Layer.provide(WebCrypto.layerWebCrypto),
  ),
  PasswordPersistenceLive,
  ProofPersistenceLive,
  Layer.succeed(AppAuth.strategies.password.SessionClaims, { resolve: resolvePasswordClaims }),
  Layer.succeed(AppAuth.strategies.password.RegistrationAuthority, { register: registerAccount }),
  Layer.succeed(Password.CompromisedPasswords, { check: checkPassword }),
  Layer.succeed(Password.PasswordActionEvidence, { verify: authorizePasswordChange }),
  Proofs.EmailProofDelivery.layer(emailVendor, sendEmail),
);

export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(PasswordLive),
  Layer.provide(AuthDependencies),
);
```

The relative imports are your application modules; [Drizzle adapters](../reference/adapters#passwords)
can provide persistence and registration. `AuthDependencies` supplies the shared
[session, account, and key configuration](../reference/adapters#compose-the-application-layer).
For sign-in-only `Password.make()`, supply hashing, password persistence, and claims
alongside those shared services. Keep normalization stable for stored credentials.

## Recover a password with Cloudflare email

Recovery uses `requestReset` → `verifyReset` → `completeReset` and requires an
independently verified email address. Registration/management enables these methods;
provide proof persistence and email delivery alongside the services above.

Password reset proofs default to tokens. Cloudflare's default `EmailRenderer`
only renders numeric codes, so explicitly select numeric reset proofs in the
`Password.make` call above:

```ts
Password.make({
  registration: Schema.Struct({ displayName: Schema.NonEmptyString }),
  reset: { secret: { _tag: "NumericCode", digits: 6 } },
});
```

Numeric proofs also require `Proofs.ProofKeys.layer(proofKeys)` in
[`AuthDependencies`](../reference/adapters#compose-the-application-layer).
Use a secret-managed keyring with at least 32 random bytes per key, encoded as
base64url; retain old key IDs until their proofs expire. Keep the default proof
expiry and attempt limits unless your application supplies its own policy.

Replace `Proofs.EmailProofDelivery.layer(emailVendor, sendEmail)` in `PasswordLive`
with `EmailDeliveryLive`:

```ts title="apps/server/email.ts"
import { layerEmailProofDelivery } from "@yielded/auth-cloudflare";

export const EmailDeliveryLive = layerEmailProofDelivery({
  binding: "AUTH_EMAIL",
  from: "hello@example.com",
});
```

Configure the Worker email binding and sender domain, and provide the current
Worker environment as `WorkerEnvironment` from `effect-cf` at your Worker boundary.
The Layer checks binding availability and shape; it does not receive the password
strategy's proof policy and cannot check renderer compatibility at construction.
To keep token proofs instead, provide the adapter's `EmailRenderer` service with
application-owned link rendering. Without it, tokens fail delivery before any
provider call.

Start recovery inside an Effect request handler:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const requested = yield* auth.requestReset({ flowId, requestId, email, locale: "en" });
```

Retain `flowId`, `email`, and `requested.reference` for this flow. Generate
`requestId` once per submission and retain it for an exact retry. Always show a
generic response such as “If this address is eligible, check your email.” The
receipt does not reveal account eligibility or whether a message was sent.

In the next request, verify the code entered from the email, preserving leading
zeroes by keeping it a string:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const verified = yield* auth.verifyReset({ flowId, email, reference, secret: code });
```

Retain `verified.continuation.continuationId`. Its matching credential is issued
through the private `proof-continuation` channel. Complete the reset with the same
flow and email:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.completeReset({
  flowId,
  email,
  commandId,
  newPassword,
  continuationId,
  credential,
});
```

These are server-side inputs. For browser endpoints, map `credential` to the
`proof-continuation` slot through the contract's `requestFields`, so the HTTP
adapter reads the private cookie. Never return codes or continuation credentials
in operation results or logs, or make the browser copy an HttpOnly cookie into
JSON. Generate `commandId` once for the completion submission. Completion changes
the password; sign in separately to obtain a session.

### Delivery and retry boundaries

Cloudflare delivery awaits provider acceptance in the request; acceptance does
not prove inbox delivery. Unsupported formats and local email validation failures
are definite policy failures: correct the configuration before starting a fresh,
rate-limited recovery request. Provider operation failures are treated
conservatively as uncertain acceptance, even when they contain an error code.
Do not automatically resend: the binding has no delivery-ID deduplication contract.

An exact `requestReset` retry can recover a generic receipt, not guarantee another
send. Dispatch is a process-local continuation after persistence commits, not a
durable outbox. A crash can leave an unsent proof; neither the receipt nor a
restart guarantees eventual delivery. Let the user check their inbox and, if
needed, explicitly start a new recovery flow under the configured cooldown and
attempt limits. Do not use a generic receipt as a signal to enqueue retries.

A consumed proof or an unknown commit outcome is not permission to repeat a
password mutation. Prepared-password intents bind the original action, credential
revision, and replacement verifier.

See the [complete password composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/password-methods.ts)
for recovery and factor authorization; its local delivery collector is independent
of Cloudflare and uses token proofs.
