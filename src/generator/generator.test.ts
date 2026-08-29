import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ReferenceKind, wrap } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/sqlite";
import type { BetterAuthOptions } from "better-auth";
import type { BetterAuthDBSchema } from "better-auth/db";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { mikroOrmAdapter } from "../adapter";
import { generateMikroOrmSchema } from "./generator";
import { writeMikroOrmSchemaDirectory } from "./directory";

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
    expect(result.code).toContain("p.string().unique()");
    expect(result.code).toContain('p.enum(["active", "disabled"])');
    expect(result.code).toContain("p.boolean().default(false)");
    expect(result.code).toContain("p.manyToOne(User).mapToPk()");
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
    expect(result.code).toContain('@Property({ type: "string", unique: true })');
    expect(result.code).toContain('@Enum({ items: () => ["active", "disabled"] })');
    expect(result.code).toContain('@Property({ type: "boolean", default: false })');
    expect(result.code).toContain(
      '@ManyToOne(() => User, { mapToPk: true, deleteRule: "cascade" })',
    );
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
    const adapter = mikroOrmAdapter(null as never, {
      schemaFile: "src/entities/auth.ts",
    })(options);

    const generated = await adapter.createSchema?.(options);

    expect(generated?.code).toContain("id: p.integer().primary().autoincrement()");

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

  test("supports snake_case columns without changing entity property names", async () => {
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
    expect(defineResult.code).toContain('emailAddress: p.text().fieldName("email_address")');
    expect(defineResult.code).toContain('emailVerified: p.boolean().fieldName("email_verified")');

    const decoratorResult = generateMikroOrmSchema({
      tables: customTables,
      casing: "snake_case",
      entityStyle: "decorators",
    });
    expect(decoratorResult.code).toContain('fieldName: "email_address"');
    expect(decoratorResult.code).toContain('fieldName: "email_verified"');
    expect(decoratorResult.code).toContain("emailAddress!: string;");
    expect(decoratorResult.code).toContain("emailVerified!: boolean;");

    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "snake-case-auth.ts");
    await writeFile(file, defineResult.code);
    const generated = (await import(`${pathToFileURL(file).href}?test=${Date.now()}`)) as {
      betterAuthEntities: any[];
    };
    const orm = await MikroORM.init({
      dbName: ":memory:",
      entities: generated.betterAuthEntities,
    });

    try {
      await orm.schema.create();
      const userMeta = [...orm.getMetadata().getAll().values()].find(
        ({ tableName }) => tableName === "user",
      )!;
      expect(userMeta.properties.emailAddress.fieldNames).toEqual(["email_address"]);
      expect(userMeta.properties.emailVerified.fieldNames).toEqual(["email_verified"]);

      const em = orm.em.fork();
      const user = em.create(userMeta.class, {
        id: "user-1",
        emailAddress: "user@example.com",
        emailVerified: true,
      });
      em.persist(user);
      await em.flush();
      const stored = await em.findOneOrFail(userMeta.class, { id: "user-1" });
      expect(wrap(stored).toPOJO()).toMatchObject({
        emailAddress: "user@example.com",
        emailVerified: true,
      });
    } finally {
      await orm.close(true);
    }
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

  test("supports legacy compatibility flags (no native json, dates, or booleans)", () => {
    const legacyTables = {
      user: {
        modelName: "user",
        indexes: [
          { name: "user_role_idx", fields: ["role"] },
          { name: "user_status_idx", fields: ["status"] },
        ],
        fields: {
          role: { type: ["admin", "user"], required: false, defaultValue: "user" },
          status: { type: "string", index: true },
          active: { type: "boolean", defaultValue: 1, fieldName: "active_custom" },
          metadata: { type: "json", fieldName: "meta_col" },
          tags: { type: "string[]" },
          bigNumber: { type: "number", bigint: true },
          createdAt: { type: "date" },
        },
      },
    } satisfies BetterAuthDBSchema;

    const defineResult = generateMikroOrmSchema({
      tables: legacyTables,
      supportsBooleans: false,
      supportsJSON: false,
      supportsDates: false,
      supportsArrays: true,
      entityStyle: "define-entity",
    });

    expect(defineResult.code).toContain("active_custom: p.integer().default(1)");
    expect(defineResult.code).toContain("meta_col: p.text()");
    expect(defineResult.code).toContain("p.string()");
    expect(defineResult.code).toContain("p.array()");
    expect(defineResult.code).toContain('p.bigint("number")');

    const decoratorResult = generateMikroOrmSchema({
      tables: legacyTables,
      supportsBooleans: false,
      supportsJSON: false,
      supportsDates: false,
      supportsArrays: true,
      entityStyle: "decorators",
    });

    expect(decoratorResult.code).toContain('@Index({ name: "user_role_idx"');
    expect(decoratorResult.code).toContain(
      '@Enum({ items: () => ["admin", "user"], nullable: true, default: "user" })',
    );
    expect(decoratorResult.code).toContain('@Property({ type: "number", default: 1 })');
    expect(decoratorResult.code).toContain('@Property({ type: "text" })');
    expect(decoratorResult.code).toContain('@Property({ type: "array" })');
  });
});

describe("generateMikroOrmSchemaDirectory", () => {
  test("writes defineEntity models to separate files with an index", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-directory-"));
    temporaryDirectories.push(directory);
    const directoryTables = {
      ...tables,
      twoFactor: {
        modelName: "two_factor",
        fields: {
          secret: { type: "string", required: true },
        },
      },
    } satisfies BetterAuthDBSchema;

    const generated = await writeMikroOrmSchemaDirectory({ tables: directoryTables, directory });

    expect(generated.files.map(({ path }) => path)).toEqual([
      "user.ts",
      "session.ts",
      "two-factor.ts",
      "index.ts",
    ]);
    expect((await readdir(directory)).sort()).toEqual([
      "index.ts",
      "session.ts",
      "two-factor.ts",
      "user.ts",
    ]);
    expect(generated.files.find(({ path }) => path === "session.ts")?.code).toContain(
      'import { User } from "./user";',
    );

    const module = (await import(
      `${pathToFileURL(join(directory, "index.ts")).href}?test=${Date.now()}`
    )) as { betterAuthEntities: any[] };
    const orm = await MikroORM.init({ dbName: ":memory:", entities: module.betterAuthEntities });

    try {
      await orm.schema.create();
      expect(
        [...orm.getMetadata().getAll().values()].map(({ tableName }) => tableName).sort(),
      ).toEqual(["login_session", "member", "two_factor"]);
    } finally {
      await orm.close(true);
    }
  });

  test("writes decorator models as separate files", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-decorators-"));
    temporaryDirectories.push(directory);
    const generated = await writeMikroOrmSchemaDirectory({
      tables,
      directory,
      entityStyle: "decorators",
    });

    expect(generated.directory).toBe(directory);
    expect(generated.files.map(({ path }) => path)).toEqual(["user.ts", "session.ts", "index.ts"]);
    expect(generated.files.find(({ path }) => path === "user.ts")?.code).toContain(
      "export class User",
    );
    expect(generated.files.find(({ path }) => path === "session.ts")?.code).toContain(
      'import { User } from "./user";',
    );
    expect(generated.files.find(({ path }) => path === "index.ts")?.code).toContain(
      "export const betterAuthEntities",
    );

    expect((await readdir(directory)).sort()).toEqual(["index.ts", "session.ts", "user.ts"]);
  });

  test("supports custom fileSuffix for generated entity files", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-generator-suffix-"));
    temporaryDirectories.push(directory);
    const generated = await writeMikroOrmSchemaDirectory({
      tables,
      directory,
      fileSuffix: ".entity",
    });

    expect(generated.files.map(({ path }) => path)).toEqual([
      "user.entity.ts",
      "session.entity.ts",
      "index.ts",
    ]);
    expect(generated.files.find(({ path }) => path === "session.entity.ts")?.code).toContain(
      'import { User } from "./user.entity";',
    );
    expect(generated.files.find(({ path }) => path === "index.ts")?.code).toContain(
      'import { User } from "./user.entity";',
    );
    expect(generated.files.find(({ path }) => path === "index.ts")?.code).toContain(
      'import { Session } from "./session.entity";',
    );

    const module = (await import(
      `${pathToFileURL(join(directory, "index.ts")).href}?test=${Date.now()}`
    )) as { betterAuthEntities: any[] };
    const orm = await MikroORM.init({ dbName: ":memory:", entities: module.betterAuthEntities });

    try {
      await orm.schema.create();
      expect(
        [...orm.getMetadata().getAll().values()].map(({ tableName }) => tableName).sort(),
      ).toEqual(["login_session", "member"]);
    } finally {
      await orm.close(true);
    }
  });
});
