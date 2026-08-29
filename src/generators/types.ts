import type { BetterAuthDBSchema } from "better-auth/db";

export type EntityStyle = "define-entity" | "decorators";
export type SchemaCasing = "snake_case" | "camelCase";

export interface MikroOrmSchemaGeneratorOptions {
  tables: BetterAuthDBSchema;
  file?: string;
  directory?: string;
  numericIds?: boolean;
  supportsArrays?: boolean;
  supportsBooleans?: boolean;
  supportsDates?: boolean;
  supportsJSON?: boolean;
  /**
   * Field and column naming convention:
   * - "snake_case": Convert field names to snake_case (e.g. `user_id`, `created_at`)
   * - "camelCase" (default): Keep default Better Auth field names (e.g. `userId`, `createdAt`)
   *
   * @default "camelCase"
   */
  casing?: SchemaCasing;
  /**
   * Entity definition style:
   * - "define-entity" (default): Modern MikroORM v7 fluent `defineEntity()` schema API
   * - "decorators": Class-based entities with `@Entity()`, `@Property()`, `@PrimaryKey()`, `@ManyToOne()`
   *
   * @default "define-entity"
   */
  entityStyle?: EntityStyle;
}

export type Table = BetterAuthDBSchema[string];

export interface GeneratedSchemaFile {
  path: string;
  code: string;
}

export interface GeneratedSchemaDirectory {
  directory: string;
  files: GeneratedSchemaFile[];
}
