import type { DBFieldAttribute } from "better-auth/db";
import type { MikroOrmSchemaGeneratorOptions, Table } from "./types";

export function quote(value: string) {
  return JSON.stringify(value);
}

export function propertyKey(value: string) {
  return /^[A-Z_$][\w$]*$/i.test(value) ? value : quote(value);
}

export function stringArray(values: readonly string[]) {
  return `[${values.map(quote).join(", ")}]`;
}

export function toPascalCase(value: string) {
  const result = value
    .replaceAll(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z\d]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join("");
  if (!result) return "Model";
  return /^\d/.test(result) ? `Model${result}` : result;
}

export function toSnakeCase(value: string) {
  return value
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export function createModelNames(entries: [string, Table][]) {
  const usedNames = new Set<string>();
  return new Map(
    entries.map(([model]) => {
      const baseName = toPascalCase(model);
      let name = baseName;
      let suffix = 2;
      while (usedNames.has(name)) name = `${baseName}${suffix++}`;
      usedNames.add(name);
      return [model, name];
    }),
  );
}

export function databasePropertyName(
  fieldName: string,
  field: DBFieldAttribute,
  options?: MikroOrmSchemaGeneratorOptions,
) {
  if (field.fieldName) return field.fieldName;
  if (options?.casing === "snake_case") {
    return toSnakeCase(fieldName);
  }
  return fieldName;
}

export function entityPropertyName(fieldName: string, field: DBFieldAttribute) {
  return field.fieldName ?? fieldName;
}

export function findReferencedTable(entries: [string, Table][], model: string) {
  return entries.find(
    ([defaultModel, table]) => defaultModel === model || table.modelName === model,
  );
}

export function getSortedTableEntries(tables: Record<string, Table>): [string, Table][] {
  const filtered = Object.entries(tables).filter(([, table]) => !table.disableMigrations);
  const modelToEntry = new Map<string, [string, Table]>(filtered.map((entry) => [entry[0], entry]));
  const tableNameToKey = new Map<string, string>();
  for (const [key, table] of filtered) {
    tableNameToKey.set(key, key);
    if (table.modelName) tableNameToKey.set(table.modelName, key);
  }

  const compareBase = (a: [string, Table], b: [string, Table]) => {
    const orderA = a[1].order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b[1].order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  };

  const dependencies = new Map<string, Set<string>>();
  for (const [key, table] of filtered) {
    const deps = new Set<string>();
    for (const field of Object.values(table.fields ?? {})) {
      if (field.references?.model) {
        const depKey = tableNameToKey.get(field.references.model);
        if (depKey && depKey !== key) {
          deps.add(depKey);
        }
      }
    }
    dependencies.set(key, deps);
  }

  const inDegree = new Map<string, number>();
  const reverseGraph = new Map<string, Set<string>>();
  for (const [key] of filtered) {
    inDegree.set(key, dependencies.get(key)?.size ?? 0);
    reverseGraph.set(key, new Set());
  }

  for (const [key, deps] of dependencies) {
    for (const dep of deps) {
      reverseGraph.get(dep)?.add(key);
    }
  }

  const available = filtered.filter(([key]) => (inDegree.get(key) ?? 0) === 0).sort(compareBase);

  const sorted: [string, Table][] = [];
  const visited = new Set<string>();

  while (available.length > 0) {
    available.sort(compareBase);
    const [key, table] = available.shift()!;
    visited.add(key);
    sorted.push([key, table]);

    for (const dependent of reverseGraph.get(key) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) {
        const depEntry = modelToEntry.get(dependent);
        if (depEntry) {
          available.push(depEntry);
        }
      }
    }
  }

  if (sorted.length < filtered.length) {
    const remaining = filtered.filter(([key]) => !visited.has(key)).sort(compareBase);
    sorted.push(...remaining);
  }

  return sorted;
}

export function scalarType(
  field: DBFieldAttribute,
  options: MikroOrmSchemaGeneratorOptions,
  indexed = false,
): { mikroOrm: string; typescript: string; enum?: readonly string[] } {
  if (Array.isArray(field.type)) {
    return {
      mikroOrm: "string",
      typescript: field.type.length ? field.type.map(quote).join(" | ") : "string",
      enum: field.type,
    };
  }
  if (field.type === "date") {
    return options.supportsDates === false
      ? { mikroOrm: "string", typescript: "string" }
      : { mikroOrm: "Date", typescript: "Date" };
  }
  if (field.type === "boolean") {
    return options.supportsBooleans === false
      ? { mikroOrm: "number", typescript: "number" }
      : { mikroOrm: "boolean", typescript: "boolean" };
  }
  if (field.type === "number") {
    return {
      mikroOrm: field.bigint ? "bigint" : "number",
      typescript: "number",
    };
  }
  if (field.type === "json") {
    return options.supportsJSON === false
      ? { mikroOrm: "text", typescript: "string" }
      : { mikroOrm: "json", typescript: "Record<string, unknown> | unknown[]" };
  }
  if (field.type === "string[]" || field.type === "number[]") {
    return options.supportsArrays
      ? {
          mikroOrm: "array",
          typescript: field.type === "string[]" ? "string[]" : "number[]",
        }
      : { mikroOrm: "text", typescript: "string" };
  }
  return {
    mikroOrm: field.sortable || field.index || field.unique || indexed ? "string" : "text",
    typescript: "string",
  };
}
