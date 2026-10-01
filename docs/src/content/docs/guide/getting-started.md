---
title: Getting started
description: Run a complete local account app, then connect authentication to your application.
---

Start with a working account app, then adapt its shared contract, account model,
and services to your application. Yielded Auth is currently in beta.

## Run the starter

Install [Bun](https://bun.sh/), then [download the starter](/auth/auth-starter.tar.gz).
The archive contains a standalone app with published npm dependencies; no repository
checkout, database server, or email-provider credentials are needed.

```sh
tar -xzf auth-starter.tar.gz
cd yielded-auth-starter
bun install
bunx vp run start
```

Open `http://localhost:4181`. Choose **Create account**, enter a name, an email
such as `you@example.com`, and a unique password. Registration signs you in.
Sign out and sign back in to try the complete login flow. Accounts and sessions
survive restarting the server.

The app creates its SQLite database, applies the included migrations, and generates
private keys under `.data/`. Password screening uses Pwned Passwords over HTTPS,
so an internet connection is required; it needs no API key and sends only a hash prefix.

### Verify an email and recover an account

In local mode, email is delivered to private JSON files in **`.data/mail/`**.
Open the newest message for your address and enter its `code` in the app. This
simulates access to an inbox; it does not establish ownership of a real email address.
The app never serves these files over HTTP or prints codes to its logs.

After verification, sign out and choose **Forgot password?**. Request a code,
read the new local message, and choose a new password. You can also choose
**Add passkey** while signed in, then use it for your next sign-in.

Use `localhost:4181` consistently for passkeys. Stop the server before deleting
`.data/` to reset this starter's accounts, sessions, messages, and keys.

### Make it your app

| File                                               | What to change                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/account/contract.ts`                          | Session claims and the actions exposed to your client.                      |
| `src/account/auth.ts`                              | Authentication methods and session policy.                                  |
| `src/schema.ts`, `src/live.ts`, `src/policy.ts`    | Your accounts, provisioning, claims, and authorization.                     |
| `src/delivery.ts`                                  | Email delivery; `.env.example` shows the optional Cloudflare configuration. |
| `src/account/client.ts`, `src/account/browser.tsx` | Effect Atom workflows and React forms.                                      |

This starter binds to loopback and uses development cookies. Before deployment,
configure your HTTPS origin, Secure cookies and passkey relying party, replace local
email delivery, and protect the persistent database and keys. The
[HTTP guide](./http-and-client#configure-the-server), [passkey guide](./passkeys#install-the-server-verifier),
and [persistence reference](../reference/adapters) explain those boundaries.

## Add auth to an existing app

Define a shared contract, choose your server methods, and call them from your
application. The contract also supplies your HTTP endpoints and browser client.

## Install

```sh
bun add @yielded/auth@beta effect
```

Install additional peer dependencies only for
the [adapters](../reference/adapters) you use.

## Define the shared contract

<!--@include: @/../README.md#auth-contract-->

The contract includes `getSession`, `requireSession`, `signOut`, and
`renewSession`. The `actions` callback explicitly adds password sign-in.
Keep this module free of server configuration, keys, and persistence.

## Define your auth service

<!--@include: @/../README.md#auth-server-->

`claims` defines the data your application puts in each session. The password
method verifies credentials; your account service supplies `displayName`.
`Auth.make` declares a yieldable service. `AppAuth.layer` acquires its scoped
resources; constructing the definition performs no I/O.

## Call it from a server Effect

Inside an Effect request handler covered by the [auth middleware](./http-and-client#application-routes), use your
validated `email` and `password` directly:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.signIn({ email, password });
```

`auth.signIn` already returns an Effect. The HTTP boundary supplies request
credentials and cookie delivery. An `Authenticated` result contains the typed
session; an additional-factor result must be completed before granting access.
Errors stay in the Effect error channel; see
[passwords](./passwords#handle-a-rejected-sign-in) for application error handling.

## Use the same API on the client

<!--@include: @/../README.md#auth-client-->

Use `auth.session`, `auth.signIn`, and `auth.signOut` directly as queries and
mutations in your application Atom registry. For a direct call inside a client
Effect using the same service:

<!-- prettier-ignore -->
```ts
const client = yield* AppClient;
const result = yield* client.auth.signIn({ email, password });
```

`auth.runtime` provides the client to composed queries and workflows; standalone
Effect programs provide `AppClient.layer`. Both constructors are synchronous.
The registry or application Scope owns acquisition and finalization. See
[client state](./http-and-client#connect-client-state) for reactivity keys and
ordinary React Atom hooks.

## Connect your application

```text
request handler
  ├─ Auth.AuthRequest        credentials + caller + delivery, per request
  └─ AppAuth.layer
       ├─ session storage   selected by Sessions.stateful(...)
       ├─ account Layer     credential lookup + claims
       └─ persistence Layer transactions + durable records
```

`AppAuth.layer` tells TypeScript which services remain to be provided. Use
[session configuration](./sessions#configure-sessions) and
[the Layer wiring example](../reference/adapters#compose-the-application-layer) to
connect storage, accounts, and keys. These services have no automatic defaults;
the library supplies Web Crypto and empty hooks. Supply password hashing with
[`@yielded/auth-crypto/Password`](./passwords#supply-the-services). For HTTP,
[the server adapter](./http-and-client#configure-the-server) supplies the request
boundary and writes credential cookies.

## Add another method

For local composition, you can pass an identifier and claims directly to
`Auth.make`. Each strategy gets a name. Pass that name when calling a non-default
strategy:

```ts title="auth-with-passkeys.ts"
import { Schema } from "effect";
import { Auth, Sessions } from "@yielded/auth";
import { Passkey, Password } from "@yielded/auth/strategies";

export const AppAuth = Auth.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  sessions: Sessions.stateful(),
  strategies: {
    password: Password.make(),
    passkey: Passkey.make(),
  },
  defaultStrategy: "password",
});
```

Call `auth.signIn({ email, password })` for passwords or
`auth.signIn("passkey", { flowId, commandId, profileId: "default" })` for passkeys.
The [passkey guide](./passkeys) shows the browser ceremony and completion.
To expose it remotely, add the selected actions to a shared contract as shown in
[HTTP and client state](./http-and-client#compose-a-passkey-workflow).
