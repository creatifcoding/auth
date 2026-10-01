import { Schema, SchemaGetter } from "effect";

/** Opaque application subject. The consumer maps it to its own account id. */
export const SubjectId = Schema.NonEmptyString.pipe(Schema.brand("effect-auth/SubjectId"));
export type SubjectId = typeof SubjectId.Type;

/** Digest of a high-entropy opaque credential. Never the raw credential. */
export const TokenDigest = Schema.NonEmptyString.pipe(Schema.brand("effect-auth/TokenDigest"));
export type TokenDigest = typeof TokenDigest.Type;

/**
 * Ordinary ASCII addresses only; internationalized email is deferred. The
 * normalized (trimmed, fully lowercased) value is the identity key.
 */
const asciiEmailPattern =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const Email = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(Schema.isPattern(asciiEmailPattern)).pipe(
      Schema.brand("effect-auth/Email"),
    ),
    {
      decode: SchemaGetter.transform((value: string) => value.trim().toLowerCase()),
      encode: SchemaGetter.transform((value: string) => value),
    },
  ),
);

export type Email = typeof Email.Type;
