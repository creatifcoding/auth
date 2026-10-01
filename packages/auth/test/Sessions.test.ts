import { it } from "@effect/vitest";
import { coordinateCommit, LifecycleHooks } from "@yielded/auth/Hooks";
import { SubjectId, TokenDigest } from "@yielded/auth/Schema";
import * as Sessions from "@yielded/auth/Sessions";
import { layerWebCrypto } from "@yielded/auth/WebCrypto";
import { DateTime, Effect, Layer, Redacted, Schema } from "effect";
import { expect } from "vite-plus/test";

const subjectId = SubjectId.make("actor-session-audience-regression");
const sessions = Sessions.make(Schema.Struct({}), { namespace: "test/audience" });

const keys: Sessions.SessionSigningKeyring = {
  activeKeyId: "test",
  keys: [{ id: "test", material: Redacted.make("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") }],
};

const sessionLayer = (audience: string) =>
  sessions
    .statelessLayer(
      Sessions.stateless({ keys, issuer: "kommunikasie", audience }).policy(sessions.moduleId),
      keys,
    )
    .pipe(Layer.provide([layerWebCrypto, LifecycleHooks.empty]));

const authority = Layer.succeed(Sessions.AuthenticationAuthority, {
  capture: () => Effect.die("This regression supplies trusted method evidence directly"),
  requirements: () =>
    Effect.succeed(
      Sessions.AuthenticationRequirement.make({
        alternatives: [
          {
            factors: ["knowledge"],
            userVerified: false,
            phishingResistant: false,
            minimumCredentials: 1,
          },
        ],
        maximumAgeMillis: 60_000,
      }),
    ),
  approve: (_input, prepare) =>
    coordinateCommit((journal) => Effect.sync(() => prepare(undefined, journal)), {
      mode: "interactive",
    }).pipe(
      Effect.map((result) => result.value),
      Effect.orDie,
      Effect.provide(LifecycleHooks.empty),
    ),
});

const issue = Effect.fnUntraced(
  function* (_audience: string) {
    const strategy = yield* sessions.SessionStrategy;

    const evidence = Sessions.AuthenticationEvidence.make({
      revision: {
        subjectId,
        securityRevision: Sessions.SecurityRevision.make("1"),
        credentials: [{ credentialId: "password", revision: Sessions.SecurityRevision.make("1") }],
      },
      flowId: Sessions.AuthenticationFlowId.make("audience-regression"),
      bindingDigest: TokenDigest.make("audience-regression-binding"),
      proofs: [
        {
          method: "password",
          credentialId: "password",
          factors: ["knowledge"],
          userVerified: false,
          phishingResistant: false,
          verifiedAt: yield* DateTime.now,
        },
      ],
    });

    const prepared = yield* strategy.prepareEstablish({ evidence, claims: {} });
    const issued = yield* prepared.read;
    const command = issued.credentialCommands.find((command) => command._tag === "Issue");

    if (command === undefined) return yield* Effect.die("Session issuance omitted its credential");

    return command.credential;
  },
  (effect, audience) => effect.pipe(Effect.provide([sessionLayer(audience), authority])),
);

const verify = (token: Redacted.Redacted<string>, audience: string) =>
  Effect.flatMap(sessions.SessionStrategy, (strategy) => strategy.verify(token)).pipe(
    Effect.provide(sessionLayer(audience)),
  );

// Preserve the existing audience-isolation regression at the current session boundary.
// Shared keys isolate the audience check from signature rejection.
it.effect("rejects another audience even when the signing key is shared", () =>
  Effect.gen(function* () {
    const production = yield* issue("kommunikasie");

    expect((yield* verify(production, "kommunikasie")).subjectId).toBe(subjectId);
    expect(yield* Effect.flip(verify(production, "kommunikasie-preview:pr-101"))).toBeInstanceOf(
      Sessions.SessionInvalid,
    );
  }),
);
