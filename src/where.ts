import type { Where } from "better-auth/adapters";
import { raw, type EntityMetadata, type FilterQuery } from "@mikro-orm/core";

type EntityRecord = Record<string, unknown>;

export type WhereInput =
  | Where
  | {
      field: string;
      value: unknown;
      operator?:
        | "eq"
        | "ne"
        | "lt"
        | "lte"
        | "gt"
        | "gte"
        | "in"
        | "not_in"
        | "contains"
        | "starts_with"
        | "ends_with"
        | (string & {});
      connector?: "AND" | "OR";
      mode?: "insensitive" | "default";
    };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insensitivePattern(operator: WhereInput["operator"], value: string) {
  const escaped = escapeRegExp(value);

  switch (operator) {
    case "contains":
      return new RegExp(escaped, "i");
    case "starts_with":
      return new RegExp(`^${escaped}`, "i");
    case "ends_with":
      return new RegExp(`${escaped}$`, "i");
    default:
      return new RegExp(`^${escaped}$`, "i");
  }
}

interface TransformWhereContext {
  meta: EntityMetadata<EntityRecord>;
  mongo: boolean;
}

export function findProperty(meta: EntityMetadata<EntityRecord>, field: string) {
  return (
    meta.properties[field] ??
    Object.values(meta.properties).find(
      (item) =>
        item.name === field ||
        item.name.toLowerCase() === field.toLowerCase() ||
        item.fieldNames?.includes(field) ||
        item.fieldNames?.some((fn) => fn.toLowerCase() === field.toLowerCase()),
    )
  );
}

function transformCondition(
  { field, mode, operator = "eq", value }: WhereInput,
  context: TransformWhereContext,
): EntityRecord {
  const insensitive = mode === "insensitive";
  const property = findProperty(context.meta, field);

  if (!property) {
    throw new TypeError(
      `No field "${field}" exists on MikroORM entity "${context.meta.className}".`,
    );
  }

  const propName = property.name;

  if (operator === "in" || operator === "not_in") {
    if (!Array.isArray(value)) {
      throw new TypeError(`The value for "${field}" must be an array when using "${operator}".`);
    }

    if (insensitive && value.every((item) => typeof item === "string") && context.mongo) {
      const conditions = value.map((item) => ({
        [propName]: { $re: insensitivePattern("eq", item) },
      }));
      return operator === "in" ? { $or: conditions } : { $not: { $or: conditions } };
    }

    if (insensitive && value.every((item) => typeof item === "string")) {
      const column = property.fieldNames[0] ?? propName;
      return {
        [raw<string>("lower(??)", [column])]: {
          [operator === "in" ? "$in" : "$nin"]: value.map((item) => item.toLowerCase()),
        },
      };
    }

    return { [propName]: { [operator === "in" ? "$in" : "$nin"]: value } };
  }

  if (
    insensitive &&
    typeof value === "string" &&
    ["eq", "ne", "contains", "starts_with", "ends_with"].includes(operator) &&
    context.mongo
  ) {
    const condition = { [propName]: { $re: insensitivePattern(operator, value) } };
    return operator === "ne" ? { $not: condition } : condition;
  }

  if (
    insensitive &&
    typeof value === "string" &&
    ["eq", "ne", "contains", "starts_with", "ends_with"].includes(operator)
  ) {
    const column = property.fieldNames[0] ?? propName;
    const normalized = value.toLowerCase();
    const transformedValue =
      operator === "contains"
        ? `%${normalized}%`
        : operator === "starts_with"
          ? `${normalized}%`
          : operator === "ends_with"
            ? `%${normalized}`
            : normalized;
    return {
      [raw<string>("lower(??)", [column])]: {
        [operator === "ne" ? "$ne" : operator === "eq" ? "$eq" : "$like"]: transformedValue,
      },
    };
  }

  if (["contains", "starts_with", "ends_with"].includes(operator)) {
    if (typeof value !== "string") {
      throw new TypeError(`The value for "${field}" must be a string when using "${operator}".`);
    }

    if (context.mongo) {
      const escaped = escapeRegExp(value);
      const pattern =
        operator === "contains"
          ? new RegExp(escaped)
          : operator === "starts_with"
            ? new RegExp(`^${escaped}`)
            : new RegExp(`${escaped}$`);
      return { [propName]: { $re: pattern } };
    }

    if (operator === "contains") return { [propName]: { $like: `%${value}%` } };
    if (operator === "starts_with") return { [propName]: { $like: `${value}%` } };
    return { [propName]: { $like: `%${value}` } };
  }

  const mikroOperator = operator === "eq" ? "$eq" : `$${operator}`;
  return { [propName]: { [mikroOperator]: value } };
}

export function transformWhere(
  where: WhereInput[] | undefined,
  context: TransformWhereContext,
): FilterQuery<EntityRecord> {
  if (!where?.length) return {};

  const conditions = where.map((condition) => transformCondition(condition, context));
  if (conditions.length === 1) return conditions[0] as FilterQuery<EntityRecord>;

  const isOr = where.some(({ connector }) => connector === "OR");
  return (isOr ? { $or: conditions } : { $and: conditions }) as FilterQuery<EntityRecord>;
}
