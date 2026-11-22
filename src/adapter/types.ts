import type { DBAdapterDebugLogOption } from "better-auth/adapters";
import type { EntityStyle, SchemaCasing } from "../generator";
import type { DatabaseProvider } from "./utils";

export interface MikroOrmAdapterOptions {
  /**
   * Database provider (e.g. "postgresql", "sqlite", "mysql", "mongodb").
   * Automatically detected from the EntityManager platform if omitted.
   */
  provider?: DatabaseProvider;

  /**
   * Enable debug logs for the adapter.
   *
   * @default false
   */
  debugLogs?: DBAdapterDebugLogOption;

  /**
   * Use plural table names for generated entities and queries.
   *
   * @default false
   */
  usePlural?: boolean;

  /**
   * Whether the database platform supports native JSON fields.
   *
   * @default true
   */
  supportsJSON?: boolean;

  /**
   * Whether the database platform supports Date types.
   *
   * @default true
   */
  supportsDates?: boolean;

  /**
   * Whether the database platform supports native boolean types.
   *
   * @default true
   */
  supportsBooleans?: boolean;

  /**
   * Whether the database platform supports array types.
   *
   * @default false
   */
  supportsArrays?: boolean;

  /**
   * Whether the database platform supports numeric/serial IDs.
   *
   * @default true
   */
  supportsNumericIds?: boolean;

  /**
   * Whether to execute multiple operations in a transaction.
   *
   * If the database doesn't support transactions, set this to `false`.
   * @default true
   */
  transactions?: boolean;

  /**
   * Default output file path used by the Better Auth CLI schema generator.
   *
   * @default "auth-entities.ts"
   */
  schemaFile?: string;

  /**
   * Default output directory used by the package CLI.
   *
   * @default "src/entities/auth"
   */
  directory?: string;

  /**
   * Field and column naming convention for the schema generator:
   * - `"snake_case"`: Convert column field names to snake_case (e.g. `user_id`, `created_at`)
   * - `"camelCase"` (default): Keep default Better Auth field names (e.g. `userId`, `createdAt`)
   *
   * @default "camelCase"
   */
  casing?: SchemaCasing;

  /**
   * Entity definition style for the schema generator:
   * - `"define-entity"` (default): Modern MikroORM v7 fluent `defineEntity()` schema API with `InferEntity`
   * - `"decorators"`: Class-based entities with `@Entity()`, `@Property()`, `@PrimaryKey()`, `@ManyToOne()`
   *
   * @default "define-entity"
   */
  entityStyle?: EntityStyle;

  /**
   * Optional suffix for generated entity file names (e.g. `".entity"` or `".model"`).
   * When set to `".entity"`, generates `user.entity.ts`, `session.entity.ts`, etc.
   *
   * @default ""
   */
  fileSuffix?: string;
}
