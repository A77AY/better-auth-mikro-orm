import type { DBFieldAttribute } from "better-auth/db";
import type { GeneratedSchemaFile, MikroOrmSchemaGeneratorOptions, Table } from "./types";
import {
  createFileNames,
  createModelNames,
  databasePropertyName,
  entityPropertyName,
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
  const propertyName = entityPropertyName(fieldName, field);
  const databaseName = databasePropertyName(fieldName, field, options);
  const chains: string[] = [];
  const reference = field.references;
  const referencedEntry = reference ? findReferencedTable(entries, reference.model) : undefined;

  if (reference && referencedEntry) {
    const [referencedModel, referencedTable] = referencedEntry;
    const referencedField = referencedTable.fields[reference.field];
    const referencedProperty = referencedField
      ? entityPropertyName(reference.field, referencedField)
      : reference.field;
    const referencedDatabaseName = referencedField
      ? databasePropertyName(reference.field, referencedField, options)
      : reference.field;
    const targetModel = modelNames.get(referencedModel)!;

    chains.push(`p.manyToOne(${targetModel})`);
    chains.push("mapToPk()");
    chains.push(`fieldName(${quote(databaseName)})`);
    chains.push(`referenceColumnName(${quote(referencedDatabaseName)})`);
    if (reference.field !== "id") chains.push(`targetKey(${quote(referencedProperty)})`);
    chains.push(`deleteRule(${quote(reference.onDelete ?? "cascade")})`);
  } else if (Array.isArray(field.type)) {
    chains.push(`p.enum(${stringArray(field.type)})`);
    chains.push(`fieldName(${quote(databaseName)})`);
  } else if (field.type === "date") {
    chains.push(options.supportsDates === false ? "p.string()" : "p.datetime()");
    chains.push(`fieldName(${quote(databaseName)})`);
  } else if (field.type === "boolean") {
    chains.push(options.supportsBooleans === false ? "p.integer()" : "p.boolean()");
    chains.push(`fieldName(${quote(databaseName)})`);
  } else if (field.type === "number") {
    chains.push(field.bigint ? 'p.bigint("number")' : "p.integer()");
    chains.push(`fieldName(${quote(databaseName)})`);
  } else if (field.type === "json") {
    chains.push(options.supportsJSON === false ? "p.text()" : "p.json()");
    chains.push(`fieldName(${quote(databaseName)})`);
  } else if (field.type === "string[]" || field.type === "number[]") {
    chains.push(options.supportsArrays ? "p.array()" : "p.text()");
    chains.push(`fieldName(${quote(databaseName)})`);
  } else {
    chains.push(field.sortable || field.index || field.unique ? "p.string()" : "p.text()");
    chains.push(`fieldName(${quote(databaseName)})`);
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

function renderDefineIndexes(table: Table) {
  const indexes = table.indexes?.filter((index) => !index.unique) ?? [];
  const uniques = table.indexes?.filter((index) => index.unique) ?? [];
  const render = (items: typeof indexes) => {
    if (!items.length) return "[]";

    const values = items.map((index) => {
      const properties = index.fields.map((fieldName) =>
        entityPropertyName(fieldName, table.fields[fieldName] ?? { type: "string" }),
      );
      return `    {
${index.name ? `      name: ${quote(index.name)},\n` : ""}      properties: ${stringArray(properties)},
    },`;
    });
    return `[\n${values.join("\n")}\n  ]`;
  };

  return { indexes: render(indexes), uniques: render(uniques) };
}

function renderDefineEntity(
  defaultModel: string,
  table: Table,
  entries: [string, Table][],
  modelNames: Map<string, string>,
  options: MikroOrmSchemaGeneratorOptions,
) {
  const modelName = modelNames.get(defaultModel)!;
  const idChain = options.numericIds
    ? 'p.integer().primary().fieldName("id").autoincrement()'
    : 'p.string().primary().fieldName("id")';
  const properties = Object.entries(table.fields).map(([fieldName, field]) =>
    renderDefineProperty(fieldName, field, entries, modelNames, options),
  );
  const { indexes, uniques } = renderDefineIndexes(table);

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
}

function referencedModels(table: Table, entries: [string, Table][]) {
  const models = new Set<string>();
  for (const field of Object.values(table.fields)) {
    if (!field.references) continue;
    const entry = findReferencedTable(entries, field.references.model);
    if (entry) models.add(entry[0]);
  }
  return models;
}

export function generateDefineEntitySchema(options: MikroOrmSchemaGeneratorOptions): string {
  const entries = getSortedTableEntries(options.tables);
  const modelNames = createModelNames(entries);

  const sections = entries.map(([defaultModel, table]) =>
    renderDefineEntity(defaultModel, table, entries, modelNames, options),
  );

  const exports = entries.map(([model]) => `  ${modelNames.get(model)},`).join("\n");

  return `import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

${sections.join("\n\n")}

export const betterAuthEntities = [
${exports}
] as const;
`;
}

export function generateDefineEntityFiles(
  options: MikroOrmSchemaGeneratorOptions,
): GeneratedSchemaFile[] {
  const entries = getSortedTableEntries(options.tables);
  const modelNames = createModelNames(entries);
  const fileNames = createFileNames(entries, modelNames);
  const files = entries.map(([defaultModel, table]) => {
    const imports = [...referencedModels(table, entries)]
      .filter((model) => model !== defaultModel)
      .map((model) => {
        const targetName = modelNames.get(model)!;
        const targetFile = fileNames.get(model)!.replace(/\.ts$/, "");
        return `import { ${targetName} } from "./${targetFile}";`;
      });
    const importBlock = imports.length ? `${imports.join("\n")}\n` : "";

    return {
      path: fileNames.get(defaultModel)!,
      code: `import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
${importBlock}
${renderDefineEntity(defaultModel, table, entries, modelNames, options)}
`,
    };
  });

  const imports = entries
    .map(([model]) => {
      const modelName = modelNames.get(model)!;
      const fileName = fileNames.get(model)!.replace(/\.ts$/, "");
      return `import { ${modelName} } from "./${fileName}";`;
    })
    .join("\n");
  const exports = entries.map(([model]) => `  ${modelNames.get(model)},`).join("\n");
  const namedExports = entries.map(([model]) => `  ${modelNames.get(model)},`).join("\n");

  files.push({
    path: "index.ts",
    code: `${imports}

export {
${namedExports}
};

export const betterAuthEntities = [
${exports}
] as const;
`,
  });

  return files;
}
