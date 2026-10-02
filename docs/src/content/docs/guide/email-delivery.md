---
title: Email delivery
description: Connect your email provider to Auth with an Effect service.
---

Auth creates reset and sign-in links or codes, renders their email content, and
calls `EmailDelivery`. Your application supplies that service with a Layer. The
transport receives only `to`, `subject`, and private `text`/optional `html` bodies;
it does not need to understand authentication proofs.

Use any email provider through its SDK or HTTP API. The recipes below show
SendGrid over HTTP, Alchemy, and effect-cf; Auth itself requires only Effect.

The transport's `send` returns `Effect<void, EmailNotAccepted | EmailAcceptanceUnknown>`.
Success means the provider accepted the message, not that it reached the inbox.
Use `EmailNotAccepted` only when rejection is certain; use `EmailAcceptanceUnknown`
when sending might have happened. Map typed provider errors without copying their
messages or causes into Auth errors. Defects and interruption must propagate.

## Bridge SendGrid

This server-side Layer uses [SendGrid's Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)
with Effect's fetch client. Supply `SENDGRID_API_KEY` through your ConfigProvider
and replace the sender with a verified address. No Cloudflare services are required.

```ts title="apps/server/email.ts"
import {
  EmailDelivery,
  EmailMessage,
  EmailNotAccepted,
  EmailAcceptanceUnknown,
} from "@yielded/auth/EmailDelivery";
import { Config, Effect, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

export const EmailLive = Layer.effect(
  EmailDelivery,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("SENDGRID_API_KEY");
    const http = HttpClient.withScope(yield* HttpClient.HttpClient);

    return EmailDelivery.of({
      send: Effect.fnUntraced(
        function* (message: EmailMessage) {
          const request = yield* HttpClientRequest.post(
            "https://api.sendgrid.com/v3/mail/send",
          ).pipe(
            HttpClientRequest.bearerToken(apiKey),
            HttpClientRequest.bodyJson({
              personalizations: [{ to: [{ email: message.to }] }],
              from: { email: "hello@example.com" },
              subject: message.subject,
              content: [
                { type: "text/plain", value: Redacted.value(message.text) },
                ...(message.html === undefined
                  ? []
                  : [{ type: "text/html", value: Redacted.value(message.html) }]),
              ],
              tracking_settings: {
                click_tracking: { enable: false, enable_text: false },
                open_tracking: { enable: false },
              },
            }),
            Effect.mapError(() => EmailNotAccepted.make({})),
          );

          const response = yield* http.execute(request).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError(() => EmailAcceptanceUnknown.make({})),
          );

          if (response.status === 202) return;
          if ([400, 401, 403, 404, 405, 413].includes(response.status)) {
            return yield* EmailNotAccepted.make({});
          }
          return yield* EmailAcceptanceUnknown.make({});
        },
        Effect.scoped,
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "error",
          credentials: "omit",
        }),
      ),
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
```

`202` means accepted. The listed request/authentication rejections are definite;
timeouts, transport failures, server errors, and unrecognized responses remain
uncertain. The recipe sends once, follows no redirects, closes the response with
the send's scope, and never reads provider diagnostics. Click tracking is disabled
so authentication links keep their private fragment. For EU regional subusers,
use SendGrid's documented `api.eu.sendgrid.com` endpoint.

Resend, Postmark, SES, or an existing application mail service can implement the
same contract. Use each provider's acceptance semantics and disable SDK retries;
do not reuse SendGrid's status mapping for another provider.

## Bridge Alchemy

Alchemy has both [AWS SES bindings](https://alchemy.run/aws/email/sending/) and
Cloudflare email bindings; its [Resend recipe](https://alchemy.run/better-auth/sign-in-providers/email-password/#send-mail-through-resend)
uses HTTP. The SendGrid Layer above also works in an Alchemy application.

For Alchemy's Cloudflare email binding, declare
`const sender = yield* Cloudflare.Email.SendEmail("AUTH_EMAIL")`. Inside the Worker's
construction effect, bind it and create the transport Layer:

<!-- prettier-ignore -->
```ts
import {
  EmailDelivery,
  EmailAcceptanceUnknown,
} from "@yielded/auth/EmailDelivery";
import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy/RuntimeContext";
import { Effect, Layer, Redacted } from "effect";

const mail = yield* Cloudflare.Email.Send(sender);

const EmailLive = Layer.effect(
  EmailDelivery,
  Effect.gen(function* () {
    const runtime = yield* RuntimeContext;

    return EmailDelivery.of({
      send: (message) =>
        mail.send({
          from: "hello@example.com",
          to: message.to,
          subject: message.subject,
          text: Redacted.value(message.text),
          ...(message.html === undefined
            ? {}
            : { html: Redacted.value(message.html) }),
        }).pipe(
          Effect.provideService(RuntimeContext, runtime),
          Effect.asVoid,
          Effect.mapError(() => EmailAcceptanceUnknown.make({})),
        ),
    });
  }),
);
```

Build/provide this Layer inside Worker request execution, where Alchemy supplies
`RuntimeContext`. Do not cache a request's runtime across requests. Alchemy's
`SendEmailError` does not distinguish rejection from uncertain acceptance, so this
bridge maps it to uncertainty. Provision sender permissions and destination
eligibility for your deployment separately.

## Bridge effect-cf

Use your existing `Email.Tag` service, or define one for the Worker's email binding:

```ts title="apps/server/email.ts"
import {
  EmailDelivery,
  EmailNotAccepted,
  EmailAcceptanceUnknown,
} from "@yielded/auth/EmailDelivery";
import { Effect, Layer, Redacted } from "effect";
import { Email } from "effect-cf";

class AppMail extends Email.Tag<AppMail>()("app/Mail") {}

export const EmailLive = Layer.effect(
  EmailDelivery,
  Effect.gen(function* () {
    const mail = yield* AppMail;

    return EmailDelivery.of({
      send: (message) =>
        mail
          .send({
            from: "hello@example.com",
            to: message.to,
            subject: message.subject,
            text: Redacted.value(message.text),
            ...(message.html === undefined ? {} : { html: Redacted.value(message.html) }),
          })
          .pipe(
            Effect.asVoid,
            Effect.mapError((error) =>
              error._tag === "EmailValidationError"
                ? EmailNotAccepted.make({})
                : EmailAcceptanceUnknown.make({}),
            ),
          ),
    });
  }),
).pipe(Layer.provide(AppMail.layer({ binding: "AUTH_EMAIL" })));
```

Provide `WorkerEnvironment` from `effect-cf` with the current Worker environment
at your application boundary. The binding and verified sender are application
configuration. Local validation happens before provider I/O; operation failures
are classified conservatively as uncertain acceptance.

## Compose Auth

Use your chosen `EmailLive` alongside your existing application services:

```ts
const AuthLive = AppAuth.layer.pipe(Layer.provide(EmailLive), Layer.provide(AuthDependencies));
```

For the Alchemy Worker example, supply `AuthLive` to the request handler with `Effect.provide`.
For effect-cf, its remaining requirement is the Worker's environment. Auth keeps
provider SDKs out of its core dependencies; these small bridges belong to your app.

Keep email bodies and capability URLs out of logs and telemetry. Auth disables
tracing around the transport call, but your bridge must not explicitly log private
content or retry sends. No delivery-ID deduplication is promised by this interface;
use `maximumDeliveryAttempts: 1`. A generic auth receipt does not prove delivery,
and a process restart does not resume an unsent email from a durable outbox.

When replacing proof-level email delivery, start new email flows with fresh request
IDs; old request fingerprints include the previous delivery configuration. Let old
proofs and continuations expire. Account, password, and session data need no reset.

## Customize wording

The default renderer supplies plain-text code and link messages. Override
`EmailDelivery.EmailRenderer` with a Layer for wording, HTML, or localization.
It receives purpose, locale, expiry, and either a private `Code` or a complete private
`Link`. Return a subject and redacted text/HTML bodies. Escape untrusted content
when building HTML; retain the supplied link rather than reconstructing its protocol.

## Handle links

`Password.resetLink({ url })` and `Email.makeLink({ url })` use a fixed HTTPS landing
page. Auth checks the destination at Layer construction; credentials, query strings,
and fragments are forbidden in the configured URL.

The email link contains only the reference and secret in its fragment. On the
originating client, `EmailDelivery.parseLinkFragment(Redacted.make(location.hash))`
returns `{ reference, secret }`. Remove the fragment immediately with
`history.replaceState`, then wait for an intentional user action before a
same-origin, CSRF-protected POST. Keep the original flow, email and any request-binding
credential; the link does not replace that state. An email scanner's GET must not
issue, verify, or complete authentication.

`EmailDelivery.linkLandingHeaders` provides no-store, no-referrer and restrictive
CSP headers for the static landing response. Adapt its script policy to your UI.
Disable provider click tracking or rewriting that would expose the secret in a
query string or log. See [password recovery](./passwords#recover-a-password) and
[email sign-in](./codes) for the rest of each flow.
