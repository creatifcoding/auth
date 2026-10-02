import type {
  TransactionNativeDatabase,
  SessionSqlDatabase,
  PasswordSqlDatabase,
  EmailSqlDatabase,
  ProofSqlDatabase,
} from "@yielded/auth-persistence/Adapter";
import { type Context, Effect } from "effect";

/** Drizzle omits its captured $client from database class types, and only D1
 * exposes batch. Its generic query builders implement the SQL kernel contracts
 * through drizzleQueryOperations. The selected driver mode controls native calls. */
export const nativeDatabase = <Id, Database>(databaseService: Context.Key<Id, Database>) =>
  Effect.map(
    Effect.service(databaseService),
    (database) =>
      database as unknown as TransactionNativeDatabase &
        SessionSqlDatabase &
        PasswordSqlDatabase &
        EmailSqlDatabase &
        ProofSqlDatabase,
  );
