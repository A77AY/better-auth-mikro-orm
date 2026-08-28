import type { DBFieldAttribute } from "better-auth/db";
import type { MikroOrmSchemaGeneratorOptions, Table } from "./types";
import {
  createModelNames,
  databasePropertyName,
  findReferencedTable,
  getSortedTableEntries,
  propertyKey,
  quote,
  scalarType,
  stringArray,
} from "./utils";

function renderDecoratorProperty(
  fieldName: string,
  field: DBFieldAttribute,
  entries: [string, Table][],
  modelNames: Map<string, string>,
  options: MikroOrmSchemaGeneratorOptions,
) {
  const propertyName = databasePropertyName(fieldName, field, options);
  const optional = field.required === false ? "?" : "!";
  const reference = field.references;
  const referencedEntry = reference ? findReferencedTable(entries, reference.model) : undefined;

  if (reference && referencedEntry) {
    const [referencedModel, referencedTable] = referencedEntry;
    const referencedField = referencedTable.fields[reference.field];
    const referencedProperty = referencedField
      ? databasePropertyName(reference.field, referencedField, options)
      : reference.field;
    const targetModel = modelNames.get(referencedModel)!;
    const opts: string[] = [
      "mapToPk: true",
      `fieldName: ${quote(propertyName)}`,
      `referenceColumnName: ${quote(referencedProperty)}`,
      `deleteRule: ${quote(reference.onDelete ?? "cascade")}`,
    ];
    if (reference.field !== "id") opts.push(`targetKey: ${quote(referencedProperty)}`);
    if (field.required === false) opts.push("nullable: true");

    return `  @ManyToOne(() => ${targetModel}, { ${opts.join(", ")} })
  ${propertyKey(propertyName)}${optional}: ${options.numericIds ? "number" : "string"};`;
  }

  if (Array.isArray(field.type)) {
    const opts: string[] = [
      `items: () => ${stringArray(field.type)}`,
      `fieldName: ${quote(propertyName)}`,
    ];
    if (field.required === false) opts.push("nullable: true");
    if (typeof field.defaultValue === "string") {
      opts.push(`default: ${quote(field.defaultValue)}`);
    } else if (typeof field.defaultValue === "number" || typeof field.defaultValue === "boolean") {
      opts.push(`default: ${field.defaultValue}`);
    }
    const tsType = field.type.length ? field.type.map(quote).join(" | ") : "string";

    return `  @Enum({ ${opts.join(", ")} })
  ${propertyKey(propertyName)}${optional}: ${tsType};`;
  }

  const type = scalarType(field, options);
  const opts: string[] = [`type: ${quote(type.mikroOrm)}`, `fieldName: ${quote(propertyName)}`];
  if (field.bigint) opts.push('runtimeType: "number"');
  if (field.required === false) opts.push("nullable: true");
  if (field.unique) opts.push("unique: true");
  if (field.index) opts.push("index: true");
  if (
    typeof field.defaultValue === "boolean" ||
    typeof field.defaultValue === "number" ||
    typeof field.defaultValue === "string"
  ) {
    opts.push(
      `default: ${typeof field.defaultValue === "string" ? quote(field.defaultValue) : field.defaultValue}`,
    );
  }

  return `  @Property({ ${opts.join(", ")} })
  ${propertyKey(propertyName)}${optional}: ${type.typescript};`;
}

function renderClassIndexes(table: Table, options: MikroOrmSchemaGeneratorOptions) {
  const indexes = table.indexes?.filter((index) => !index.unique) ?? [];
  const uniques = table.indexes?.filter((index) => index.unique) ?? [];
  const decorators: string[] = [];

  for (const index of indexes) {
    const properties = index.fields.map((fieldName) =>
      databasePropertyName(fieldName, table.fields[fieldName] ?? { type: "string" }, options),
    );
    const opts = [
      index.name ? `name: ${quote(index.name)}` : "",
      `properties: ${stringArray(properties)}`,
    ]
      .filter(Boolean)
      .join(", ");
    decorators.push(`@Index({ ${opts} })`);
  }

  for (const unique of uniques) {
    const properties = unique.fields.map((fieldName) =>
      databasePropertyName(fieldName, table.fields[fieldName] ?? { type: "string" }, options),
    );
    const opts = [
      unique.name ? `name: ${quote(unique.name)}` : "",
      `properties: ${stringArray(properties)}`,
    ]
      .filter(Boolean)
      .join(", ");
    decorators.push(`@Unique({ ${opts} })`);
  }

  return decorators.length ? `${decorators.join("\n")}\n` : "";
}

export function generateDecoratorsSchema(options: MikroOrmSchemaGeneratorOptions): string {
  const entries = getSortedTableEntries(options.tables);
  const modelNames = createModelNames(entries);

  const sections = entries.map(([defaultModel, table]) => {
    const modelName = modelNames.get(defaultModel)!;
    const idType = options.numericIds ? "number" : "string";
    const pkOptions = options.numericIds
      ? '{ autoincrement: true, fieldName: "id" }'
      : '{ fieldName: "id" }';
    const classIndexes = renderClassIndexes(table, options);
    const properties = Object.entries(table.fields).map(([fieldName, field]) =>
      renderDecoratorProperty(fieldName, field, entries, modelNames, options),
    );

    return `${classIndexes}@Entity({ tableName: ${quote(table.modelName)} })
export class ${modelName} {
  @PrimaryKey(${pkOptions})
  id!: ${idType};

${properties.join("\n\n")}
}`;
  });

  const exports = entries.map(([model]) => `  ${modelNames.get(model)},`).join("\n");

  return `// Generated by @a77ay/better-auth-mikro-orm. Do not edit manually.
import { Entity, Enum, Index, ManyToOne, PrimaryKey, Property, Unique } from "@mikro-orm/core";

${sections.join("\n\n")}

export const betterAuthEntities = [
${exports}
] as const;
`;
}
