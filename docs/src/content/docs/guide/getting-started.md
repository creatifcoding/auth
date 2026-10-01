---
title: Getting started
description: Install Yielded Auth, define one shared contract, and use it from your server and client.
---

Install the beta release with Effect:

```sh
bun add @yielded/auth@beta effect
```

Add companion packages, such as Drizzle persistence or Argon2id hashing, only for
the [adapters](../reference/adapters) you use.

## Define the shared contract

<!--@include: @/../README.md#auth-contract-->

`claims` is the data each session carries. `actions` lists what clients may call;
here, password sign-in. Every contract also includes `getSession`,
`requireSession`, `signOut`, and `renewSession`. Keep this module free of server
configuration, keys, and persistence so the browser can import it.

## Bind the server

<!--@include: @/../README.md#auth-server-->

`Auth.make` declares a yieldable service; constructing it performs no I/O.
`Http.layer` serves the contract's actions as routes and owns cookies, Origin,
and CSRF checks.

## Supply storage and accounts

The type of `AuthRoutes` lists every service your methods still need. The library
supplies Web Crypto and empty lifecycle hooks; you supply the rest:

| You supply                                    | With                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Storage for credentials, sessions, and proofs | [Managed tables, your schema, or your services](./storage)                            |
| Account checks and session claims             | Your account Layers; see [passwords](./passwords#supply-the-services)                 |
| Password hashing                              | `@yielded/auth-crypto/Password`                                                       |
| Proof and request-binding keys                | Your secrets; see [Layer wiring](../reference/adapters#compose-the-application-layer) |

Provide them to `AuthRoutes` and merge it with your router:

```ts title="apps/server/routes.ts"
import { Layer } from "effect";

import { ApplicationRoutes } from "./application-routes";
import { AuthRoutes } from "./auth";
import { AuthDependencies } from "./auth-live"; // storage, accounts, hashing, keys

export const Routes = Layer.mergeAll(AuthRoutes, ApplicationRoutes).pipe(
  Layer.provide(AuthDependencies),
);
```

The [managed Drizzle app](https://github.com/yielded-dev/auth/tree/main/examples/persistence-drizzle-managed/src)
is a complete composition: `schema.ts` maps a customer table, `live.ts` supplies
accounts and storage, and `server.ts` serves the routes.

## Call auth on the server

Inside an Effect route covered by the [auth middleware](./http-and-client#application-routes),
call the service with your validated input:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.signIn({ email, password });
```

The request boundary supplies credentials and delivers the session cookie. An
`Authenticated` result carries the typed session; an additional-factor result must
be completed before you grant access. Failures stay typed in the error channel; see
[rejected sign-ins](./passwords#handle-a-rejected-sign-in).

## Call it from the client

<!--@include: @/../README.md#auth-client-->

Use `auth.session`, `auth.signIn`, and `auth.signOut` directly as queries and
mutations with ordinary `@effect/atom-react` hooks. Compose your own queries
through `auth.runtime` to share the client and account lifetime:

<!--@include: @/../README.md#auth-query-->

Fetch is configured by default. Pass `{ httpClient: ApplicationHttpClient }` to
`AuthAtom.make` to use your transport Layer. The [client guide](./http-and-client#connect-client-state)
shows React, shared invalidation, and standalone Effect calls.

## Add another method

Name each strategy in `Auth.make`:

```ts title="apps/server/auth.ts"
export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful(),
  strategies: {
    password: Password.make(),
    passkey: Passkey.make(),
  },
  defaultStrategy: "password",
});
```

Calls use the default strategy unless they name another:

<!-- prettier-ignore -->
```ts
yield* auth.signIn({ email, password });
yield* auth.signIn("passkey", { flowId, commandId, profileId: "default" });
```

Clients reach a method only through a contract action. The
[passkey guide](./passkeys) shows the browser ceremony and its actions.
