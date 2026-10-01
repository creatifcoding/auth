import {
  EmailProofDelivery,
  type ProofDeliveryMessage,
  type ProofDeliveryOutcome,
} from "@yielded/auth/Proofs";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { Email } from "effect-cf";

/** Worker email binding used by the proof-delivery adapter. */
export class AuthEmail extends Email.Tag<AuthEmail>()("effect-auth/AuthEmail") {}

export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachments?: ReadonlyArray<Email.EmailAttachment>;
}

/** Private rendering boundary. Return undefined for an unsupported template or format.
 * The default renders numeric codes; applications supply link rendering and localization. */
export const EmailRenderer = Context.Reference<{
  readonly render: (message: ProofDeliveryMessage) => Effect.Effect<EmailContent | undefined>;
}>("effect-auth/cloudflare/EmailRenderer", {
  defaultValue: () => ({
    render: Effect.fn("Cloudflare.EmailRenderer")(function* (
      message: ProofDeliveryMessage,
    ): Effect.fn.Return<EmailContent | undefined> {
      if (message.format !== "numeric-code") return undefined;
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      const minutes = Math.max(1, Math.ceil((message.expiresAtMillis - now) / 60_000));
      const description = message.purpose === "password-reset" ? "password reset" : "verification";

      return {
        subject: `Your ${description} code`,
        text: `Your ${description} code is ${Redacted.value(message.secret)}. It expires in ${minutes} minute${minutes === 1 ? "" : "s"}. If you did not request it, ignore this email.`,
      };
    }),
  }),
});

/** Supply the same EmailProofDelivery port used by Email and Password strategies.
 * Await provider acceptance within the request. An uncertain send stays ambiguous;
 * the binding has no delivery-ID deduplication contract, so it is never retried here. */
export const layerEmailProofDelivery = (options: {
  readonly binding: string;
  readonly from: string | Email.EmailAddress;
}) => {
  const from = typeof options.from === "string" ? options.from : { ...options.from };

  return Layer.unwrap(
    Effect.gen(function* () {
      const email = yield* AuthEmail;
      const renderer = yield* EmailRenderer;

      return EmailProofDelivery.layer(
        { vendorId: "cloudflare", idempotencyMillis: 0 },
        Effect.fn("Cloudflare.EmailProofDelivery.send")(function* (
          message: ProofDeliveryMessage,
        ): Effect.fn.Return<ProofDeliveryOutcome> {
          if (message.recipient.namespace !== "email")
            return { _tag: "DefiniteFailure", reason: "policy" };
          const rendered = yield* renderer.render(message);

          if (rendered === undefined) return { _tag: "DefiniteFailure", reason: "policy" };

          return yield* email
            .send({
              from,
              to: message.recipient.value,
              subject: rendered.subject,
              text: rendered.text,
              ...(rendered.html === undefined ? {} : { html: rendered.html }),
              ...(rendered.attachments === undefined
                ? {}
                : { attachments: [...rendered.attachments] }),
            })
            .pipe(
              Effect.as({ _tag: "Accepted" } as const),
              Effect.catchTags({
                EmailValidationError: () =>
                  Effect.succeed({ _tag: "DefiniteFailure", reason: "policy" } as const),
                EmailOperationError: () => Effect.succeed({ _tag: "Ambiguous" } as const),
              }),
            );
        }),
      );
    }),
  ).pipe(Layer.provide(AuthEmail.layer({ binding: options.binding })));
};
