---
"@yielded/auth": minor
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": minor
"@yielded/auth-openid-client": minor
---

Acquire database, transport, credential-store, and private-output dependencies through Effect services. BEHAVIOR CHANGE: provide each Drizzle driver's `Database` through `databaseLayer` and call its factories with mappings only; select client stores by service key, provide `OperationHttpClient.Client` to `AuthAtom.makeLifetime(options)`, and supply OpenID fetch overrides through `FetchHttpClient.Fetch`.
