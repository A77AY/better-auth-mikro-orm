import type { DBFieldAttribute } from "better-auth/db";
import { describe, expect, test } from "vite-plus/test";
import {
  createModelNames,
  databasePropertyName,
  findReferencedTable,
  getSortedTableEntries,
  propertyKey,
  quote,
  scalarType,
  stringArray,
  toPascalCase,
  toSnakeCase,
} from "./utils";
import type { Table } from "./types";

describe("generator utils", () => {
  describe("toPascalCase", () => {
    test("converts standard names to PascalCase", () => {
      expect(toPascalCase("user")).toBe("User");
      expect(toPascalCase("two_factor")).toBe("TwoFactor");
      expect(toPascalCase("oauth-account")).toBe("OauthAccount");
      expect(toPascalCase("passkey_credential")).toBe("PasskeyCredential");
    });

    test("handles leading numbers safely for identifiers", () => {
      expect(toPascalCase("2fa")).toBe("Model2fa");
      expect(toPascalCase("3d_secure")).toBe("Model3dSecure");
    });

    test("handles empty string", () => {
      expect(toPascalCase("")).toBe("Model");
    });
  });

  describe("toSnakeCase", () => {
    test("converts camelCase and PascalCase to snake_case", () => {
      expect(toSnakeCase("emailAddress")).toBe("email_address");
      expect(toSnakeCase("userId")).toBe("user_id");
      expect(toSnakeCase("OAuthAccount")).toBe("oauth_account");
      expect(toSnakeCase("UserRole")).toBe("user_role");
      expect(toSnakeCase("already_snake_case")).toBe("already_snake_case");
      expect(toSnakeCase("kebab-case-name")).toBe("kebab_case_name");
      expect(toSnakeCase("spaced name")).toBe("spaced_name");
    });
  });

  describe("quote and stringArray", () => {
    test("quote serializes values safely", () => {
      expect(quote("hello")).toBe('"hello"');
      expect(quote('hello "world"')).toBe('"hello \\"world\\""');
    });

    test("stringArray renders formatted arrays", () => {
      expect(stringArray(["admin", "user"])).toBe('["admin", "user"]');
      expect(stringArray([])).toBe("[]");
    });
  });

  describe("propertyKey", () => {
    test("returns raw identifier for valid JS keys", () => {
      expect(propertyKey("userId")).toBe("userId");
      expect(propertyKey("email_address")).toBe("email_address");
      expect(propertyKey("$meta")).toBe("$meta");
      expect(propertyKey("_private")).toBe("_private");
    });

    test("quotes keys with spaces or invalid identifier characters", () => {
      expect(propertyKey("my field")).toBe('"my field"');
      expect(propertyKey("field-with-dash")).toBe('"field-with-dash"');
    });
  });

  describe("createModelNames", () => {
    test("creates map of model names and resolves duplicate collisions", () => {
      const entries: [string, Table][] = [
        ["user", { modelName: "user", fields: {} }],
        ["User", { modelName: "User", fields: {} }],
        ["session", { modelName: "session", fields: {} }],
      ];

      const modelNames = createModelNames(entries);
      expect(modelNames.get("user")).toBe("User");
      expect(modelNames.get("User")).toBe("User2");
      expect(modelNames.get("session")).toBe("Session");
    });
  });

  describe("databasePropertyName", () => {
    const defaultField: DBFieldAttribute = { type: "string" };
    const customField: DBFieldAttribute = { type: "string", fieldName: "custom_col" };

    test("returns fieldName when explicitly specified", () => {
      expect(databasePropertyName("emailAddress", customField)).toBe("custom_col");
      expect(
        databasePropertyName("emailAddress", customField, { casing: "snake_case", tables: {} }),
      ).toBe("custom_col");
    });

    test("returns camelCase by default", () => {
      expect(databasePropertyName("emailAddress", defaultField)).toBe("emailAddress");
    });

    test("converts to snake_case when casing option is snake_case", () => {
      expect(
        databasePropertyName("emailAddress", defaultField, { casing: "snake_case", tables: {} }),
      ).toBe("email_address");
    });
  });

  describe("findReferencedTable", () => {
    const entries: [string, Table][] = [
      ["user", { modelName: "custom_user_table", fields: {} }],
      ["session", { modelName: "session", fields: {} }],
    ];

    test("finds by default model key or tableName", () => {
      expect(findReferencedTable(entries, "user")).toBe(entries[0]);
      expect(findReferencedTable(entries, "custom_user_table")).toBe(entries[0]);
      expect(findReferencedTable(entries, "session")).toBe(entries[1]);
      expect(findReferencedTable(entries, "non_existent")).toBeUndefined();
    });
  });

  describe("getSortedTableEntries", () => {
    test("filters out disableMigrations and sorts by order and name", () => {
      const tables: Record<string, Table> = {
        session: { modelName: "session", order: 2, fields: {} },
        user: { modelName: "user", order: 1, fields: {} },
        account: { modelName: "account", fields: {} },
        ignored: { modelName: "ignored", disableMigrations: true, fields: {} },
      };

      const sorted = getSortedTableEntries(tables);
      expect(sorted.map(([name]) => name)).toEqual(["user", "session", "account"]);
    });

    test("sorts forward references so referenced table is placed first", () => {
      const tables: Record<string, Table> = {
        alpha: {
          modelName: "alphas",
          order: 1,
          fields: {
            betaId: {
              type: "string",
              references: { model: "beta", field: "id" },
            },
          },
        },
        beta: {
          modelName: "betas",
          order: 2,
          fields: {
            name: { type: "string" },
          },
        },
      };

      const sorted = getSortedTableEntries(tables);
      expect(sorted.map(([name]) => name)).toEqual(["beta", "alpha"]);
    });

    test("resolves references pointing to custom modelName", () => {
      const tables: Record<string, Table> = {
        session: {
          modelName: "auth_sessions",
          order: 1,
          fields: {
            userId: {
              type: "string",
              references: { model: "custom_users_table", field: "id" },
            },
          },
        },
        user: {
          modelName: "custom_users_table",
          order: 2,
          fields: {
            name: { type: "string" },
          },
        },
      };

      const sorted = getSortedTableEntries(tables);
      expect(sorted.map(([name]) => name)).toEqual(["user", "session"]);
    });

    test("handles deep dependency chains (A -> B -> C -> D)", () => {
      const tables: Record<string, Table> = {
        post: {
          modelName: "post",
          order: 1,
          fields: {
            threadId: { type: "string", references: { model: "thread", field: "id" } },
          },
        },
        thread: {
          modelName: "thread",
          order: 2,
          fields: {
            channelId: { type: "string", references: { model: "channel", field: "id" } },
          },
        },
        channel: {
          modelName: "channel",
          order: 3,
          fields: {
            workspaceId: { type: "string", references: { model: "workspace", field: "id" } },
          },
        },
        workspace: {
          modelName: "workspace",
          order: 4,
          fields: {
            name: { type: "string" },
          },
        },
      };

      const sorted = getSortedTableEntries(tables);
      expect(sorted.map(([name]) => name)).toEqual(["workspace", "channel", "thread", "post"]);
    });

    test("handles diamond dependencies with multiple parent tables", () => {
      const tables: Record<string, Table> = {
        auditLog: {
          modelName: "audit_log",
          order: 1,
          fields: {
            userId: { type: "string", references: { model: "user", field: "id" } },
            orgId: { type: "string", references: { model: "organization", field: "id" } },
          },
        },
        user: {
          modelName: "user",
          order: 2,
          fields: { name: { type: "string" } },
        },
        organization: {
          modelName: "organization",
          order: 3,
          fields: { title: { type: "string" } },
        },
      };

      const sorted = getSortedTableEntries(tables);
      const names = sorted.map(([name]) => name);

      expect(names.indexOf("user")).toBeLessThan(names.indexOf("auditLog"));
      expect(names.indexOf("organization")).toBeLessThan(names.indexOf("auditLog"));
      expect(names).toEqual(["user", "organization", "auditLog"]);
    });

    test("handles self-referencing entities without circular lock", () => {
      const tables: Record<string, Table> = {
        user: {
          modelName: "user",
          order: 1,
          fields: {
            managerId: { type: "string", references: { model: "user", field: "id" } },
          },
        },
        session: {
          modelName: "session",
          order: 2,
          fields: {
            userId: { type: "string", references: { model: "user", field: "id" } },
          },
        },
      };

      const sorted = getSortedTableEntries(tables);
      expect(sorted.map(([name]) => name)).toEqual(["user", "session"]);
    });

    test("handles circular references gracefully without dropping tables", () => {
      const tables: Record<string, Table> = {
        user: {
          modelName: "user",
          order: 1,
          fields: {
            activeSessionId: { type: "string", references: { model: "session", field: "id" } },
          },
        },
        session: {
          modelName: "session",
          order: 2,
          fields: {
            userId: { type: "string", references: { model: "user", field: "id" } },
          },
        },
      };

      const sorted = getSortedTableEntries(tables);
      expect(sorted).toHaveLength(2);
      expect(sorted.map(([name]) => name).sort()).toEqual(["session", "user"]);
    });
  });

  describe("scalarType", () => {
    test("handles enums", () => {
      expect(scalarType({ type: ["active", "disabled"] }, { tables: {} })).toEqual({
        mikroOrm: "string",
        typescript: '"active" | "disabled"',
        enum: ["active", "disabled"],
      });
      expect(scalarType({ type: [] }, { tables: {} })).toEqual({
        mikroOrm: "string",
        typescript: "string",
        enum: [],
      });
    });

    test("handles dates", () => {
      expect(scalarType({ type: "date" }, { tables: {} })).toEqual({
        mikroOrm: "Date",
        typescript: "Date",
      });
      expect(scalarType({ type: "date" }, { tables: {}, supportsDates: false })).toEqual({
        mikroOrm: "string",
        typescript: "string",
      });
    });

    test("handles booleans", () => {
      expect(scalarType({ type: "boolean" }, { tables: {} })).toEqual({
        mikroOrm: "boolean",
        typescript: "boolean",
      });
      expect(scalarType({ type: "boolean" }, { tables: {}, supportsBooleans: false })).toEqual({
        mikroOrm: "number",
        typescript: "number",
      });
    });

    test("handles numbers and bigint", () => {
      expect(scalarType({ type: "number" }, { tables: {} })).toEqual({
        mikroOrm: "number",
        typescript: "number",
      });
      expect(scalarType({ type: "number", bigint: true }, { tables: {} })).toEqual({
        mikroOrm: "bigint",
        typescript: "number",
      });
    });

    test("handles json", () => {
      expect(scalarType({ type: "json" }, { tables: {} })).toEqual({
        mikroOrm: "json",
        typescript: "Record<string, unknown> | unknown[]",
      });
      expect(scalarType({ type: "json" }, { tables: {}, supportsJSON: false })).toEqual({
        mikroOrm: "text",
        typescript: "string",
      });
    });

    test("handles arrays", () => {
      expect(scalarType({ type: "string[]" }, { tables: {}, supportsArrays: true })).toEqual({
        mikroOrm: "array",
        typescript: "string[]",
      });
      expect(scalarType({ type: "string[]" }, { tables: {}, supportsArrays: false })).toEqual({
        mikroOrm: "text",
        typescript: "string",
      });
    });

    test("handles indexed and plain strings", () => {
      expect(scalarType({ type: "string" }, { tables: {} })).toEqual({
        mikroOrm: "text",
        typescript: "string",
      });
      expect(scalarType({ type: "string", index: true }, { tables: {} })).toEqual({
        mikroOrm: "string",
        typescript: "string",
      });
      expect(scalarType({ type: "string", unique: true }, { tables: {} })).toEqual({
        mikroOrm: "string",
        typescript: "string",
      });
    });
  });
});
