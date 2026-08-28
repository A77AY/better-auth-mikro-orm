import { EntitySchema } from "@mikro-orm/core";
import type { BetterAuthOptions } from "better-auth";
import { getAuthTables } from "better-auth/db";

type EntityRecord = Record<string, unknown>;

function propertyType(type: string | readonly string[]) {
  if (Array.isArray(type)) return "string";
  if (type === "date") return "Date";
  if (type === "boolean") return "boolean";
  if (type === "number") return "number";
  if (type === "json") return "json";
  return "string";
}

export function createAuthEntities(options: BetterAuthOptions) {
  const tables = getAuthTables(options);
  const isNumericIds = options.advanced?.database?.generateId === "serial";

  return Object.entries(tables).map(([defaultModelName, table], index) => {
    const properties: Record<string, unknown> = {
      id: {
        type: isNumericIds ? "number" : "string",
        primary: true,
        autoincrement: isNumericIds,
      },
    };

    for (const [fieldName, field] of Object.entries(table.fields)) {
      const propertyName = field.fieldName ?? fieldName;
      let type = propertyType(field.type);

      if (field.references) {
        if (field.references.field === "id" && isNumericIds) {
          type = "number";
        } else {
          const targetTable = tables[field.references.model];
          const targetField = targetTable?.fields[field.references.field];
          if (targetField) {
            type = propertyType(targetField.type);
          }
        }
      }

      properties[propertyName] = {
        type,
        nullable: field.required === false,
        unique: field.unique,
        index: field.index,
      };
    }

    const indexes = table.indexes
      ?.filter(({ unique }) => !unique)
      .map(({ fields, name }) => ({
        name,
        properties: fields.map((field) => table.fields[field]?.fieldName ?? field),
      }));
    const uniques = table.indexes
      ?.filter(({ unique }) => unique)
      .map(({ fields, name }) => ({
        name,
        properties: fields.map((field) => table.fields[field]?.fieldName ?? field),
      }));

    return new EntitySchema<EntityRecord>({
      name: `BetterAuthTestEntity${index}_${defaultModelName}`,
      tableName: table.modelName,
      properties,
      indexes: indexes ?? [],
      uniques: uniques ?? [],
    } as never);
  });
}
