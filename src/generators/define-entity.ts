import type { DBFieldAttribute } from "better-auth/db";
import type { MikroOrmSchemaGeneratorOptions, Table } from "./types";
import {
  createModelNames,
  databasePropertyName,
  findReferencedTable,
  getSortedTableEntries,
  propertyKey,
  quote,
  stringArray,
} from "./utils";

function renderDefineProperty(
  fieldName: string,
  field: DBFieldAttribute,
  entries: [string, Table][],
  modelNames: Map<string, string>,
  options: MikroOrmSchemaGeneratorOptions,
) {
  const propertyName = databasePropertyName(fieldName, field, options);
  const chains: string[] = [];
  const reference = field.references;
  const referencedEntry = reference ? findReferencedTable(entries, reference.model) : undefined;

  if (reference && referencedEntry) {
    const [referencedModel, referencedTable] = referencedEntry;
    const referencedField = referencedTable.fields[reference.field];
    const referencedProperty = referencedField
      ? databasePropertyName(reference.field, referencedField, options)
      : reference.field;
    const targetModel = modelNames.get(referencedModel)!;

    chains.push(`p.manyToOne(${targetModel})`);
    chains.push("mapToPk()");
    chains.push(`fieldName(${quote(propertyName)})`);
    chains.push(`referenceColumnName(${quote(referencedProperty)})`);
    if (reference.field !== "id") chains.push(`targetKey(${quote(referencedProperty)})`);
    chains.push(`deleteRule(${quote(reference.onDelete ?? "cascade")})`);
  } else if (Array.isArray(field.type)) {
    chains.push(`p.enum(${stringArray(field.type)})`);
    chains.push(`fieldName(${quote(propertyName)})`);
  } else if (field.type === "date") {
    chains.push(options.supportsDates === false ? "p.string()" : "p.datetime()");
    chains.push(`fieldName(${quote(propertyName)})`);
  } else if (field.type === "boolean") {
    chains.push(options.supportsBooleans === false ? "p.integer()" : "p.boolean()");
    chains.push(`fieldName(${quote(propertyName)})`);
  } else if (field.type === "number") {
    chains.push(field.bigint ? 'p.bigint("number")' : "p.integer()");
    chains.push(`fieldName(${quote(propertyName)})`);
  } else if (field.type === "json") {
    chains.push(options.supportsJSON === false ? "p.text()" : "p.json()");
    chains.push(`fieldName(${quote(propertyName)})`);
  } else if (field.type === "string[]" || field.type === "number[]") {
    chains.push(options.supportsArrays ? "p.array()" : "p.text()");
    chains.push(`fieldName(${quote(propertyName)})`);
  } else {
    chains.push(field.sortable || field.index || field.unique ? "p.string()" : "p.text()");
    chains.push(`fieldName(${quote(propertyName)})`);
  }

  if (field.required === false) chains.push("nullable()");
  if (
    typeof field.defaultValue === "boolean" ||
    typeof field.defaultValue === "number" ||
    typeof field.defaultValue === "string"
  ) {
    chains.push(
      `default(${typeof field.defaultValue === "string" ? quote(field.defaultValue) : field.defaultValue})`,
    );
  }
  if (field.unique) chains.push("unique()");
  if (field.index) chains.push("index()");

  return `    ${propertyKey(propertyName)}: ${chains.join(".")},`;
}

function renderDefineIndexes(table: Table, options: MikroOrmSchemaGeneratorOptions) {
  const indexes = table.indexes?.filter((index) => !index.unique) ?? [];
  const uniques = table.indexes?.filter((index) => index.unique) ?? [];
  const render = (items: typeof indexes) => {
    if (!items.length) return "[]";

    const values = items.map((index) => {
      const properties = index.fields.map((fieldName) =>
        databasePropertyName(fieldName, table.fields[fieldName] ?? { type: "string" }, options),
      );
      return `    {
${index.name ? `      name: ${quote(index.name)},\n` : ""}      properties: ${stringArray(properties)},
    },`;
    });
    return `[\n${values.join("\n")}\n  ]`;
  };

  return { indexes: render(indexes), uniques: render(uniques) };
}

export function generateDefineEntitySchema(options: MikroOrmSchemaGeneratorOptions): string {
  const entries = getSortedTableEntries(options.tables);
  const modelNames = createModelNames(entries);

  const sections = entries.map(([defaultModel, table]) => {
    const modelName = modelNames.get(defaultModel)!;
    const idChain = options.numericIds
      ? 'p.integer().primary().fieldName("id").autoincrement()'
      : 'p.string().primary().fieldName("id")';
    const properties = Object.entries(table.fields).map(([fieldName, field]) =>
      renderDefineProperty(fieldName, field, entries, modelNames, options),
    );
    const { indexes, uniques } = renderDefineIndexes(table, options);

    return `export const ${modelName} = defineEntity({
  name: ${quote(modelName)},
  tableName: ${quote(table.modelName)},
  properties: {
    id: ${idChain},
${properties.join("\n")}
  },
  indexes: ${indexes},
  uniques: ${uniques},
});

export type ${modelName} = InferEntity<typeof ${modelName}>;`;
  });

  const exports = entries.map(([model]) => `  ${modelNames.get(model)},`).join("\n");

  return `// Generated by @a77ay/better-auth-mikro-orm. Do not edit manually.
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

${sections.join("\n\n")}

export const betterAuthEntities = [
${exports}
] as const;
`;
}
