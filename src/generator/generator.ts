import type { DBAdapterSchemaCreation } from "better-auth/adapters";
import { generateDecoratorsSchema } from "./decorators";
import { generateDefineEntitySchema } from "./define-entity";
import type {
  EntityStyle,
  GeneratedSchemaDirectory,
  GeneratedSchemaFile,
  MikroOrmSchemaGeneratorOptions,
  SchemaCasing,
} from "./types";

export type {
  EntityStyle,
  GeneratedSchemaDirectory,
  GeneratedSchemaFile,
  MikroOrmSchemaGeneratorOptions,
  SchemaCasing,
};

/**
 * Generate a deterministic MikroORM entity module for Better Auth and its plugins.
 *
 * Supports two entity styles:
 * - `"define-entity"` (default): Modern MikroORM v7 fluent `defineEntity()` schema API
 * - `"decorators"`: Class-based entities with `@Entity()`, `@Property()`, `@PrimaryKey()`, `@ManyToOne()`
 */
export function generateMikroOrmSchema(
  options: MikroOrmSchemaGeneratorOptions,
): DBAdapterSchemaCreation {
  const style = options.entityStyle ?? "define-entity";
  const code =
    style === "decorators"
      ? generateDecoratorsSchema(options)
      : generateDefineEntitySchema(options);

  return {
    code,
    path: options.file ?? "auth-entities.ts",
    overwrite: true,
  };
}
