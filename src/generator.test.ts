import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ReferenceKind } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/sqlite";
import type { BetterAuthOptions } from "better-auth";
import type { BetterAuthDBSchema } from "better-auth/db";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { generateMikroOrmSchema, mikroOrmAdapter } from "./index";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const tables = {
  user: {
    modelName: "member",
    order: 1,
    fields: {
      email: {
        type: "string",
        fieldName: "email_address",
        required: true,
        unique: true,
        sortable: true,
      },
      status: {
        type: ["active", "disabled"],
        required: true,
      },
      verified: {
        type: "boolean",
        defaultValue: false,
        required: true,
      },
      profile: {
        type: "json",
        required: false,
      },
    },
  },
  session: {
    modelName: "login_session",
    order: 2,
    indexes: [{ name: "session_user_token", fields: ["userId", "token"], unique: true }],
    fields: {
      token: { type: "string", required: true },
      userId: {
        type: "string",
        fieldName: "member_id",
        required: true,
        references: { model: "user", field: "id", onDelete: "cascade" },
        index: true,
      },
    },
  },
  ignored: {
    modelName: "ignored",
    disableMigrations: true,
    fields: { value: { type: "string" } },
  },
} satisfies BetterAuthDBSchema;

describe("generateMikroOrmSchema", () => {
  test("generates defineEntity schemas by default (MikroORM v7 style)", async () => {
    const result = generateMikroOrmSchema({ tables, file: "generated/auth.ts" });

    expect(result).toMatchObject({ path: "generated/auth.ts", overwrite: true });
    expect(result.code).toContain(
      'import { defineEntity, p, type InferEntity } from "@mikro-orm/core";',
    );
    expect(result.code).toContain('tableName: "member"');
    expect(result.code).toContain('p.string().fieldName("email_address").unique()');
    expect(result.code).toContain('p.enum(["active", "disabled"]).fieldName("status")');
    expect(result.code).toContain('p.boolean().fieldName("verified").default(false)');
    expect(result.code).toContain("p.manyToOne(User).mapToPk()");
    expect(result.code).toContain('fieldName("member_id")');
    expect(result.code).toContain('name: "session_user_token"');
    expect(result.code).toContain("export type User = InferEntity<typeof User>;");
    expect(result.code).not.toContain('tableName: "ignored"');

    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "define-auth.ts");
    await writeFile(file, result.code);
    const generated = (await import(`${pathToFileURL(file).href}?test=${Date.now()}`)) as {
      betterAuthEntities: any[];
    };
    const orm = await MikroORM.init({
      dbName: ":memory:",
      entities: generated.betterAuthEntities,
    });

    try {
      await orm.schema.create();
      const metadata = [...orm.getMetadata().getAll().values()];
      const member = metadata.find(({ tableName }) => tableName === "member");
      const session = metadata.find(({ tableName }) => tableName === "login_session");

      expect(member?.properties.email_address.fieldNames).toEqual(["email_address"]);
      expect(session?.properties.member_id).toMatchObject({
        kind: ReferenceKind.MANY_TO_ONE,
        mapToPk: true,
        deleteRule: "cascade",
      });
      expect(session?.uniques).toContainEqual(
        expect.objectContaining({ name: "session_user_token" }),
      );
    } finally {
      await orm.close(true);
    }
  });

  test("generates decorator-based class entities when entityStyle is decorators", async () => {
    const result = generateMikroOrmSchema({
      tables,
      file: "generated/decorators.ts",
      entityStyle: "decorators",
    });

    expect(result.code).toContain(
      'import { Entity, Enum, Index, ManyToOne, PrimaryKey, Property, Unique } from "@mikro-orm/core";',
    );
    expect(result.code).toContain('@Entity({ tableName: "member" })');
    expect(result.code).toContain("export class User {");
    expect(result.code).toContain(
      '@Property({ type: "string", fieldName: "email_address", unique: true })',
    );
    expect(result.code).toContain(
      '@Enum({ items: () => ["active", "disabled"], fieldName: "status" })',
    );
    expect(result.code).toContain(
      '@Property({ type: "boolean", fieldName: "verified", default: false })',
    );
    expect(result.code).toContain('@ManyToOne(() => User, { mapToPk: true, fieldName: "member_id"');
    expect(result.code).toContain(
      '@Unique({ name: "session_user_token", properties: ["member_id", "token"] })',
    );

    expect(result.code).toContain("export const betterAuthEntities = [");
    expect(result.code).toContain("  User,\n  Session,");
  });

  test("exposes the generator through Better Auth createSchema with numericIds", async () => {
    const options = {
      advanced: { database: { generateId: "serial" } },
    } satisfies BetterAuthOptions;
    const adapter = mikroOrmAdapter({
      em: null as never,
      schemaFile: "src/entities/auth.ts",
    })(options);

    const generated = await adapter.createSchema?.(options);

    expect(generated).toMatchObject({ path: "src/entities/auth.ts", overwrite: true });
    expect(generated?.code).toContain('id: p.integer().primary().fieldName("id").autoincrement()');

    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "core-auth-entities.ts");
    await writeFile(file, generated!.code);
    const module = (await import(`${pathToFileURL(file).href}?test=${Date.now()}`)) as {
      betterAuthEntities: any[];
    };
    const orm = await MikroORM.init({ dbName: ":memory:", entities: module.betterAuthEntities });

    try {
      await orm.schema.create();
      expect(
        [...orm.getMetadata().getAll().values()].map(({ tableName }) => tableName).sort(),
      ).toEqual(["account", "session", "user", "verification"]);
    } finally {
      await orm.close(true);
    }
  });

  test("supports casing: snake_case for generated field names", () => {
    const customTables = {
      user: {
        modelName: "user",
        fields: {
          emailAddress: { type: "string", required: true },
          emailVerified: { type: "boolean", required: true },
        },
      },
    } satisfies BetterAuthDBSchema;

    const defineResult = generateMikroOrmSchema({
      tables: customTables,
      casing: "snake_case",
    });
    expect(defineResult.code).toContain('email_address: p.text().fieldName("email_address")');
    expect(defineResult.code).toContain('email_verified: p.boolean().fieldName("email_verified")');

    const decoratorResult = generateMikroOrmSchema({
      tables: customTables,
      casing: "snake_case",
      entityStyle: "decorators",
    });
    expect(decoratorResult.code).toContain('fieldName: "email_address"');
    expect(decoratorResult.code).toContain('fieldName: "email_verified"');
  });

  test("sorts tables topologically so forward references do not throw TDZ errors", async () => {
    const forwardRefTables = {
      alpha: {
        modelName: "alphas",
        order: 1,
        fields: {
          betaId: {
            type: "string",
            references: {
              model: "beta",
              field: "id",
            },
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
    } satisfies BetterAuthDBSchema;

    const result = generateMikroOrmSchema({
      tables: forwardRefTables,
      entityStyle: "define-entity",
    });

    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "forward-ref-entities.ts");
    await writeFile(file, result.code);

    const module = (await import(`${pathToFileURL(file).href}?test=${Date.now()}`)) as {
      betterAuthEntities: any[];
    };
    const orm = await MikroORM.init({ dbName: ":memory:", entities: module.betterAuthEntities });

    try {
      await orm.schema.create();
      expect(
        [...orm.getMetadata().getAll().values()].map(({ tableName }) => tableName).sort(),
      ).toEqual(["alphas", "betas"]);
    } finally {
      await orm.close(true);
    }
  });
});
