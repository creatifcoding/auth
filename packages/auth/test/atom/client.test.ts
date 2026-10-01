import { it } from "@effect/vitest";
import * as AuthAtom from "@yielded/auth/Atom";
import * as AuthContract from "@yielded/auth/AuthContract";
import * as Client from "@yielded/auth/Client";
import { Deferred, Effect, Fiber, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import type { Atom } from "effect/unstable/reactivity";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { expect, test } from "vite-plus/test";

// e2ca72c admitted credential requests without a deadline; a stalled response
// blocked account transitions and Scope cleanup even with an outer timeout.
it.effect("bounds credential admission without retrying and releases its request Scope", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const response = yield* Deferred.make<Response>();
    let calls = 0;
    let aborted = false;

    const AppClient = Client.make(
      AuthContract.make("test/admission-deadline", { claims: Schema.Struct({}) }),
      {
        baseUrl: "https://example.test",
      },
    );

    const httpClient = HttpClient.make((request, _url, signal) =>
      Effect.gen(function* () {
        calls++;
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
          },
          { once: true },
        );
        yield* Deferred.succeed(entered, undefined);

        return HttpClientResponse.fromWeb(request, yield* Deferred.await(response));
      }),
    );

    const fiber = yield* AppClient.make.pipe(
      Effect.flatMap(({ auth }) => auth.signOut()),
      Effect.provideService(HttpClient.HttpClient, httpClient),
      Effect.result,
      Effect.scoped,
      Effect.forkChild,
    );

    yield* Deferred.await(entered);
    yield* TestClock.adjust("30 seconds");
    const observed = fiber.pollUnsafe();

    // Release the old implementation as well, so a red assertion cannot hang cleanup.
    yield* Deferred.succeed(response, Response.json({ _tag: "Success" }));
    yield* Fiber.await(fiber);
    expect(observed).toMatchObject({
      _tag: "Success",
      value: { _tag: "Failure", failure: { _tag: "OperationHttpError", reason: "timeout" } },
    });
    expect(calls).toBe(1);
    expect(aborted).toBe(true);
  }),
);

test("latest named authentication settles after interrupted admission and failures discard previous values", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const authContract = AuthContract.make("test/mutation-race", {
          claims: Schema.Struct({}),
          actions: () => ({
            authenticate: AuthContract.action({
              payload: Schema.String,
              success: Schema.String,
              error: Schema.String,
              mode: "mutation",
              credentials: true,
              subject: { fromSuccess: (value) => (value === "pending" ? undefined : value) },
            }),
          }),
        });

        const first = yield* Deferred.make<Response>();
        const second = yield* Deferred.make<Response>();
        const enteredFirst = yield* Deferred.make<void>();
        const enteredSecond = yield* Deferred.make<void>();
        let calls = 0;

        const AppClient = Client.make(authContract, {
          baseUrl: "https://example.test",
        });

        const httpClient = HttpClient.make((request) =>
          Effect.gen(function* () {
            calls++;
            if (calls === 1)
              return HttpClientResponse.fromWeb(
                request,
                Response.json({ _tag: "Success", value: "old-member" }),
              );
            if (calls === 2)
              return HttpClientResponse.fromWeb(
                request,
                Response.json({ _tag: "Failure", error: "denied" }),
              );
            const entered = calls === 3 ? enteredFirst : enteredSecond;
            const response = calls === 3 ? first : second;

            yield* Deferred.succeed(entered, undefined);

            return HttpClientResponse.fromWeb(request, yield* Deferred.await(response));
          }),
        );

        const auth = AuthAtom.make(AppClient, {
          httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
        });

        const r = yield* Effect.acquireRelease(
          Effect.sync(() => AtomRegistry.make()),
          (registry) => Effect.sync(() => registry.dispose()),
        );

        const result = <A, E>(
          registry: AtomRegistry.AtomRegistry,
          atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
        ) =>
          AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }).pipe(
            Effect.timeout("1 second"),
          );

        yield* AtomRegistry.mount(r, auth.authenticate);
        r.set(auth.authenticate, "old");
        expect(yield* result(r, auth.authenticate)).toBe("old-member");
        r.set(auth.authenticate, "denied");
        expect(yield* Effect.flip(result(r, auth.authenticate))).toBe("denied");
        expect(AsyncResult.value(r.get(auth.authenticate))._tag).toBe("None");
        r.set(auth.authenticate, "first");
        yield* Deferred.await(enteredFirst);
        r.set(auth.authenticate, "second");
        yield* Deferred.succeed(first, Response.json({ _tag: "Success", value: "pending" }));
        yield* Deferred.await(enteredSecond);
        yield* Deferred.succeed(second, Response.json({ _tag: "Success", value: "new-member" }));
        expect(yield* result(r, auth.authenticate)).toBe("new-member");
      }),
    ),
  ));

test("synchronous account replacement publishes a fresh query value", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contract = AuthContract.make("test/synchronous-replacement", {
          claims: Schema.Struct({}),
        });

        const AppClient = Client.make(contract, { baseUrl: "https://example.test" });
        const auth = AuthAtom.make(AppClient);

        const registry = yield* Effect.acquireRelease(
          Effect.sync(() => AtomRegistry.make()),
          (value) => Effect.sync(() => value.dispose()),
        );

        let reads = 0;

        const query = auth.runtime.atom(
          Effect.gen(function* () {
            reads++;
            if (reads === 1) {
              const lifetime = yield* AuthAtom.AuthAtomLifetime;

              yield* lifetime.replaceSubject(null);

              return "retired";
            }

            return "current";
          }),
        );

        expect(
          yield* AtomRegistry.getResult(registry, query).pipe(Effect.timeout("1 second")),
        ).toBe("current");
        expect(reads).toBe(2);
      }),
    ),
  ));
