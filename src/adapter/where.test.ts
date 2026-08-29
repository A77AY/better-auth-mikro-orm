import type { EntityMetadata } from "@mikro-orm/core";
import { describe, expect, test } from "vite-plus/test";
import { transformWhere } from "./where";

const mockMeta: EntityMetadata<Record<string, unknown>> = {
  className: "User",
  tableName: "user",
  properties: {
    id: { name: "id", fieldNames: ["id"] },
    email: { name: "email", fieldNames: ["email"] },
    name: { name: "name", fieldNames: ["name"] },
    role: { name: "role", fieldNames: ["role"] },
    age: { name: "age", fieldNames: ["age"] },
  },
} as unknown as EntityMetadata<Record<string, unknown>>;

describe("transformWhere", () => {
  test("returns empty object for empty or undefined where", () => {
    expect(transformWhere(undefined, { meta: mockMeta, mongo: false })).toEqual({});
    expect(transformWhere([], { meta: mockMeta, mongo: false })).toEqual({});
  });

  test("throws error for non-existent field", () => {
    expect(() =>
      transformWhere([{ field: "unknown", operator: "eq", value: "val" }], {
        meta: mockMeta,
        mongo: false,
      }),
    ).toThrow('No field "unknown" exists on MikroORM entity "User"');
  });

  test("transforms single condition without unnecessary $and wrapper", () => {
    const filter = transformWhere([{ field: "email", operator: "eq", value: "test@example.com" }], {
      meta: mockMeta,
      mongo: false,
    });
    expect(filter).toEqual({ email: { $eq: "test@example.com" } });
  });

  test("transforms standard SQL comparison operators with multiple conditions", () => {
    const filter = transformWhere(
      [
        { field: "email", operator: "eq", value: "test@example.com" },
        { field: "age", operator: "gt", value: 18 },
        { field: "age", operator: "lte", value: 65 },
        { field: "role", operator: "ne", value: "banned" },
      ],
      { meta: mockMeta, mongo: false },
    );

    expect(filter).toEqual({
      $and: [
        { email: { $eq: "test@example.com" } },
        { age: { $gt: 18 } },
        { age: { $lte: 65 } },
        { role: { $ne: "banned" } },
      ],
    });
  });

  test("transforms string patterns (contains, starts_with, ends_with)", () => {
    const filter = transformWhere(
      [
        { field: "name", operator: "contains", value: "ali" },
        { field: "email", operator: "starts_with", value: "admin" },
        { field: "email", operator: "ends_with", value: ".com" },
      ],
      { meta: mockMeta, mongo: false },
    );

    expect(filter).toEqual({
      $and: [
        { name: { $like: "%ali%" } },
        { email: { $like: "admin%" } },
        { email: { $like: "%.com" } },
      ],
    });
  });

  test("throws if pattern operators receive non-string values", () => {
    expect(() =>
      transformWhere([{ field: "age", operator: "contains", value: 123 as never }], {
        meta: mockMeta,
        mongo: false,
      }),
    ).toThrow('The value for "age" must be a string when using "contains"');
  });

  test("transforms in and not_in operators", () => {
    const filter = transformWhere(
      [
        { field: "role", operator: "in", value: ["admin", "editor"] },
        { field: "age", operator: "not_in", value: [1, 2] },
      ],
      { meta: mockMeta, mongo: false },
    );

    expect(filter).toEqual({
      $and: [{ role: { $in: ["admin", "editor"] } }, { age: { $nin: [1, 2] } }],
    });
  });

  test("throws if in/not_in receive non-array values", () => {
    expect(() =>
      transformWhere([{ field: "role", operator: "in", value: "admin" as never }], {
        meta: mockMeta,
        mongo: false,
      }),
    ).toThrow('The value for "role" must be an array when using "in"');
  });

  test("transforms case-insensitive mode on SQL", () => {
    const filter = transformWhere(
      [
        { field: "email", operator: "eq", value: "Test@Example.COM", mode: "insensitive" },
        { field: "name", operator: "contains", value: "ALICE", mode: "insensitive" },
        { field: "role", operator: "in", value: ["Admin", "User"], mode: "insensitive" },
      ],
      { meta: mockMeta, mongo: false },
    );

    expect(filter).toHaveProperty("$and");
    const and = (filter as { $and: unknown[] }).$and;
    expect(and).toHaveLength(3);
  });

  test("transforms case-insensitive mode on MongoDB using RegExp", () => {
    const filter = transformWhere(
      [
        { field: "email", operator: "eq", value: "test@example.com", mode: "insensitive" },
        { field: "name", operator: "contains", value: "alice", mode: "insensitive" },
        { field: "name", operator: "ne", value: "bob", mode: "insensitive" },
        { field: "role", operator: "in", value: ["admin", "user"], mode: "insensitive" },
        { field: "role", operator: "not_in", value: ["banned"], mode: "insensitive" },
      ],
      { meta: mockMeta, mongo: true },
    );

    expect(filter).toHaveProperty("$and");
    const and = (filter as { $and: Record<string, unknown>[] }).$and;
    expect(and[0].email).toEqual({ $re: /^test@example\.com$/i });
    expect(and[1].name).toEqual({ $re: /alice/i });
    expect(and[2]).toEqual({ $not: { name: { $re: /^bob$/i } } });
    expect(and[3]).toHaveProperty("$or");
    expect(and[4]).toHaveProperty("$not");
  });

  test("groups OR conditions without weakening AND conditions", () => {
    const filter = transformWhere(
      [
        { field: "email", operator: "eq", value: "alice@example.com" },
        { field: "role", operator: "eq", value: "admin", connector: "OR" },
        { field: "role", operator: "eq", value: "superuser", connector: "OR" },
      ],
      { meta: mockMeta, mongo: false },
    );

    expect(filter).toEqual({
      $and: [
        { email: { $eq: "alice@example.com" } },
        {
          $or: [{ role: { $eq: "admin" } }, { role: { $eq: "superuser" } }],
        },
      ],
    });
  });

  test("groups conditions into $or when all connectors are OR", () => {
    const filter = transformWhere(
      [
        { field: "role", operator: "eq", value: "admin", connector: "OR" },
        { field: "role", operator: "eq", value: "superuser", connector: "OR" },
      ],
      { meta: mockMeta, mongo: false },
    );

    expect(filter).toEqual({
      $or: [{ role: { $eq: "admin" } }, { role: { $eq: "superuser" } }],
    });
  });
});
