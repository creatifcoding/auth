import type { AnyRelations } from "drizzle-orm";
import type { EffectSQLiteDoDatabase } from "drizzle-orm/effect-sqlite-do";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";

import type {
  ExternalIdentityTables,
  IdentityTables,
  SubjectProvisioningTables,
} from "./drizzle/model";
import { makeSqliteEmailTarget, sqliteEmailConfiguration } from "./drizzle/sqlite-emails";
import {
  makeSqliteExternalIdentityServices,
  makeSqliteIdentityServices,
  makeSqliteSubjectProvisioningServices,
} from "./drizzle/sqlite-identity";
import { makeSqlitePasswordTarget, sqlitePasswordConfiguration } from "./drizzle/sqlite-passwords";
import { makeSqliteProofTarget, sqliteProofConfiguration } from "./drizzle/sqlite-proofs";
import { makeSqliteSessionTarget, sqliteSessionConfiguration } from "./drizzle/sqlite-sessions";

const sessionTarget = makeSqliteSessionTarget<EffectSQLiteDoDatabase<AnyRelations>, true>(
  sqliteSessionConfiguration("synchronous", Effect.void),
);

const proofTarget = makeSqliteProofTarget<EffectSQLiteDoDatabase<AnyRelations>, true>(
  sqliteProofConfiguration("synchronous", Effect.void),
);

const passwordTarget = makeSqlitePasswordTarget<EffectSQLiteDoDatabase<AnyRelations>, true>(
  sqlitePasswordConfiguration("synchronous", Effect.void, Effect.void),
);

const emailTarget = makeSqliteEmailTarget<EffectSQLiteDoDatabase<AnyRelations>, true>(
  sqliteEmailConfiguration("synchronous", Effect.void, Effect.void),
);

/**
 * Email mutations must own their outer transactionSync. Arbitrary raw Drizzle
 * nesting is not detectable; owner bodies and mapping allocators stay runSync-compatible.
 */
export const {
  coordinateEmailAddress,
  coordinateEmailRegistration,
  makeEmailAddressServices,
  makeEmailRegistrationServices,
  makeEmailSignInServices,
} = emailTarget;

/**
 * Password mutations and registration must own their outer transactionSync.
 * Arbitrary raw Drizzle nesting is not detectable; owner bodies must remain
 * runSync-compatible. Detectable Effect commit scopes are rejected pre-write.
 */
export const {
  coordinatePasswordPersistence,
  coordinatePasswordRegistration,
  makePasswordPersistenceServices,
  makePasswordRegistrationServices,
} = passwordTarget;

/**
 * Proof mutations and coordinateProofPersistence must own their outermost
 * transactionSync call. The installed driver cannot detect an arbitrary raw
 * Drizzle outer transaction; calling either boundary from one is unsupported.
 * The owner body must remain runSync-compatible.
 */
export const { coordinateProofPersistence, makeProofPersistenceServices } = proofTarget;

/**
 * Session mutation methods and coordinate* functions must own their outermost
 * transactionSync call. The installed Drizzle driver exposes no context marker
 * for an arbitrary raw outer database.transaction call, so invoking either
 * boundary from one is unsupported and cannot be detected. Detectable Effect
 * commit scopes are rejected before writes.
 */
export const {
  coordinateAuthenticationAuthority,
  coordinatePendingAuthentication,
  coordinateSignedSessionValidity,
  coordinateStatefulSessions,
  makeAuthenticationAuthorityServices,
  makePendingAuthenticationServices,
  makeSessionStepUpServices,
  coordinateSessionStepUp,
  makeSignedSessionValidityServices,
  makeStatefulSessionServices,
} = sessionTarget;

export const commitMode = "synchronous" as const;

export const makeIdentityServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  External extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  database: EffectSQLiteDoDatabase<AnyRelations>,
  mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>,
) => makeSqliteIdentityServices(database, mapping, "synchronous");

export const makeSubjectProvisioningServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  database: EffectSQLiteDoDatabase<AnyRelations>,
  mapping: SubjectProvisioningTables<Subject, Identifier, Request, NativeId>,
) => makeSqliteSubjectProvisioningServices(database, mapping, "synchronous");

export const makeExternalIdentityServices = <
  Subject extends AnySQLiteTable,
  External extends AnySQLiteTable,
  NativeId,
>(
  database: EffectSQLiteDoDatabase<AnyRelations>,
  mapping: ExternalIdentityTables<Subject, External, NativeId>,
) => makeSqliteExternalIdentityServices(database, mapping);

import { makeSqlitePasswordPreparedTarget } from "./drizzle/sqlite-password-prepared";

const passwordPreparedTarget = makeSqlitePasswordPreparedTarget<
  EffectSQLiteDoDatabase<AnyRelations>,
  true
>(sqlitePasswordConfiguration("synchronous", Effect.void, Effect.void));

export const { makePasswordPreparedPersistenceServices, coordinatePasswordPreparedPersistence } =
  passwordPreparedTarget;

export { passwordPreparedPersistenceLayer } from "./drizzle/password-prepared-target";

import { makeOAuthTarget } from "./drizzle/oauth-drivers";

const oauthTarget = makeOAuthTarget<
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  true
>({
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const {
  makeOAuthAccountsServices,
  makeOAuthSignInServices,
  makeOAuthRegistrationIntentServices,
  makeOAuthRegistrationServices,
  coordinateOAuthRegistration,
  coordinateOAuthSignIn,
  coordinateOAuthRegistrationIntents,
  coordinateOAuthAccounts,
  makeOAuthConnectedServices,
  makeOAuthConnectedRevocationServices,
  coordinateOAuthConnected,
  coordinateOAuthConnectedRevocations,
} = oauthTarget;

import { makePasskeyTarget } from "./drizzle/passkey-drivers";

const passkeyTarget = makePasskeyTarget<
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  unknown,
  true
>({
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const {
  makePasskeyCredentialServices,
  makePasskeyPersistenceServices,
  makePasskeyEnrollmentContextServices,
  makePasskeyRegistrationCeremonyServices,
  coordinatePasskeyPersistence,
  coordinatePasskeyRegistrationCeremony,
  makePasskeyManagementServices,
  makePasskeyRegistrationServices,
  coordinatePasskeyManagement,
  coordinatePasskeyRegistration,
} = passkeyTarget;

import { makeTotpTarget } from "./drizzle/totp-target";

const totpTarget = makeTotpTarget<
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  unknown,
  true
>({
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = totpTarget;

import { makePhoneTarget } from "./drizzle/phone-target";

const phoneTarget = makePhoneTarget<
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  unknown,
  true
>({
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const { makePhonePersistenceServices, coordinatePhonePersistence } = phoneTarget;
