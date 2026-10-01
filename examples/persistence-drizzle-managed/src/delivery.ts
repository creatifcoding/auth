import { EmailProofDelivery } from "@yielded/auth/Proofs";
import { Email } from "@yielded/auth/Schema";
import { Config, Effect, FileSystem, Layer, Path, Schema } from "effect";

import { DeliveryLive as CloudflareDeliveryLive } from "../../shared/account/delivery";
import { AppData, DataLive } from "./data";

// This private local mailbox is a delivery destination, never an HTTP response or log.
const LocalMessage = Schema.fromJsonString(
  Schema.Struct({
    to: Email,
    purpose: Schema.String,
    code: Schema.RedactedFromValue(Schema.String),
    expiresAtMillis: Schema.Number,
  }),
);

const LocalDeliveryLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.join(yield* AppData, "mail");

    yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });

    return EmailProofDelivery.layer(
      { vendorId: "local-files", idempotencyMillis: 0 },
      Effect.fn("Starter.deliverLocalEmail")(function* (message) {
        if (message.recipient.namespace !== "email" || message.format !== "numeric-code")
          return { _tag: "DefiniteFailure", reason: "policy" } as const;

        const body = yield* Schema.encodeEffect(LocalMessage)({
          to: yield* Schema.decodeEffect(Email)(message.recipient.value),
          purpose: message.purpose,
          code: message.secret,
          expiresAtMillis: message.expiresAtMillis,
        });

        // Exclusive files preserve earlier messages. An uncertain write is never retried.
        return yield* fs
          .writeFileString(
            path.join(directory, `${encodeURIComponent(message.deliveryId)}.json`),
            body,
            {
              flag: "wx",
              mode: 0o600,
            },
          )
          .pipe(
            Effect.as({ _tag: "Accepted" } as const),
            Effect.catchTag("PlatformError", () => Effect.succeed({ _tag: "Ambiguous" } as const)),
          );
      }),
    );
  }),
).pipe(Layer.provide(DataLive));

type Delivery = typeof LocalDeliveryLive | typeof CloudflareDeliveryLive;

export const DeliveryLive = Layer.unwrap(
  Config.schema(Schema.Literals(["local", "cloudflare"]), "AUTH_EMAIL_DELIVERY").pipe(
    Config.withDefault("local"),
    Effect.map(
      (mode): Layer.Layer<EmailProofDelivery, Layer.Error<Delivery>, Layer.Services<Delivery>> =>
        mode === "local" ? LocalDeliveryLive : CloudflareDeliveryLive,
    ),
  ),
);
