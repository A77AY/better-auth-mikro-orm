import { EntitySchema, type MikroORM } from "@mikro-orm/core";
import { MikroORM as SqliteMikroORM } from "@mikro-orm/sqlite";
import { MikroORM as PostgreSqlMikroORM } from "@mikro-orm/postgresql";
import { MikroORM as MongoMikroORM } from "@mikro-orm/mongodb";
import type { BetterAuthOptions } from "better-auth";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { mikroOrmAdapter } from "./index";
import { isMongo } from "./adapter-utils";

class UserRecord {
  id!: string;
  name!: string;
  email!: string;
  emailVerified = false;
  createdAt = new Date();
  updatedAt = new Date();
  role?: string;
  count = 0;
}

class SessionRecord {
  id!: string;
  token!: string;
  userId!: string;
  expiresAt!: Date;
  createdAt = new Date();
  updatedAt = new Date();
}

const dbType = (process.env.DB_TYPE || "sqlite").toLowerCase();
const isMongoDb = dbType === "mongodb" || dbType === "mongo";

const UserSchema = new EntitySchema({
  class: UserRecord,
  tableName: "user",
  properties: {
    id: { type: "string", primary: true, ...(isMongoDb ? { fieldName: "_id" } : {}) },
    name: { type: "string" },
    email: { type: "string", unique: true },
    emailVerified: { type: "boolean" },
    createdAt: { type: "Date" },
    updatedAt: { type: "Date" },
    role: { type: "string", nullable: true },
    count: { type: "number" },
  },
});

const SessionSchema = new EntitySchema({
  class: SessionRecord,
  tableName: "session",
  properties: {
    id: { type: "string", primary: true, ...(isMongoDb ? { fieldName: "_id" } : {}) },
    token: { type: "string", unique: true },
    userId: { type: "string" },
    expiresAt: { type: "Date" },
    createdAt: { type: "Date" },
    updatedAt: { type: "Date" },
  },
});

const betterAuthOptions = {
  user: {
    additionalFields: {
      role: { type: "string", required: false },
      count: { type: "number", defaultValue: 0 },
    },
  },
} as BetterAuthOptions;

describe("mikroOrmAdapter", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (isMongoDb) {
      const uri =
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        "mongodb://127.0.0.1:27017/better_auth_test";
      orm = (await MongoMikroORM.init({
        clientUrl: uri,
        dbName: "better_auth_test",
        entities: [UserSchema, SessionSchema],
      })) as unknown as MikroORM;
      return;
    }

    if (dbType === "postgres" || dbType === "postgresql") {
      orm = await PostgreSqlMikroORM.init({
        clientUrl:
          process.env.DATABASE_URL ||
          "postgresql://postgres:postgres@127.0.0.1:5432/better_auth_test",
        entities: [UserSchema, SessionSchema],
        schemaGenerator: {
          disableForeignKeys: true,
        },
      });
      await orm.schema.drop();
      await orm.schema.create();
      return;
    }

    orm = await SqliteMikroORM.init({
      dbName: ":memory:",
      entities: [UserSchema, SessionSchema],
    });
    await orm.schema.create();
  });

  beforeEach(async () => {
    if (isMongo(orm.em)) {
      await orm.em.fork().nativeDelete(UserSchema, {});
      await orm.em.fork().nativeDelete(SessionSchema, {});
    } else {
      await orm.schema.clear();
    }
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  function createAdapter() {
    return mikroOrmAdapter({ em: () => orm.em.fork() })(betterAuthOptions);
  }

  async function createUser(
    adapter: Pick<ReturnType<typeof createAdapter>, "create">,
    id: string,
    overrides: Partial<UserRecord> = {},
  ) {
    return adapter.create<UserRecord>({
      model: "user",
      data: {
        id,
        name: `User ${id}`,
        email: `${id}@example.com`,
        emailVerified: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        role: "member",
        count: 0,
        ...overrides,
      },
      forceAllowId: true,
    });
  }

  test("creates, queries, updates, counts and deletes records", async () => {
    const adapter = createAdapter();
    await createUser(adapter, "a", { name: "Alice", role: "admin" });
    await createUser(adapter, "b", { name: "Bob" });
    await createUser(adapter, "c", { name: "Caroline" });

    await expect(
      adapter.findOne<UserRecord>({
        model: "user",
        where: [{ field: "email", value: "a@example.com" }],
      }),
    ).resolves.toMatchObject({ id: "a", name: "Alice" });

    const matches = await adapter.findMany<UserRecord>({
      model: "user",
      where: [{ field: "name", operator: "contains", value: "o" }],
      sortBy: { field: "name", direction: "asc" },
      limit: 10,
    });
    expect(matches.map(({ id }) => id)).toEqual(["b", "c"]);

    await expect(
      adapter.findOne<UserRecord>({
        model: "user",
        where: [
          { field: "email", value: "missing@example.com", connector: "OR" },
          { field: "role", value: "admin", connector: "OR" },
        ],
      }),
    ).resolves.toMatchObject({ id: "a" });

    await expect(
      adapter.findOne<UserRecord>({
        model: "user",
        where: [{ field: "email", value: "A@EXAMPLE.COM", mode: "insensitive" }],
      }),
    ).resolves.toMatchObject({ id: "a" });

    await expect(
      adapter.update<UserRecord>({
        model: "user",
        where: [{ field: "id", value: "b" }],
        update: { role: "editor" },
      }),
    ).resolves.toMatchObject({ id: "b", role: "editor" });

    await expect(
      adapter.updateMany({
        model: "user",
        where: [{ field: "role", value: "member" }],
        update: { emailVerified: true },
      }),
    ).resolves.toBe(1);

    await expect(
      adapter.count({ model: "user", where: [{ field: "emailVerified", value: true }] }),
    ).resolves.toBe(1);

    await adapter.delete({ model: "user", where: [{ field: "emailVerified", value: false }] });
    await expect(adapter.count({ model: "user" })).resolves.toBe(2);

    await expect(
      adapter.deleteMany({ model: "user", where: [{ field: "emailVerified", value: true }] }),
    ).resolves.toBe(1);
  });

  test("consumes a matching row only once", async () => {
    const adapter = createAdapter();
    await createUser(adapter, "once");

    const results = await Promise.all([
      adapter.consumeOne<UserRecord>({
        model: "user",
        where: [{ field: "id", value: "once" }],
      }),
      adapter.consumeOne<UserRecord>({
        model: "user",
        where: [{ field: "id", value: "once" }],
      }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ id: "once" });
  });

  test("increments one guarded row atomically", async () => {
    const adapter = createAdapter();
    await createUser(adapter, "counter", { count: 1 });

    await expect(
      adapter.incrementOne<UserRecord>({
        model: "user",
        where: [
          { field: "id", value: "counter" },
          { field: "count", operator: "lt", value: 2 },
        ],
        increment: { count: 1 },
        set: { role: "limited" },
      }),
    ).resolves.toMatchObject({ id: "counter", count: 2, role: "limited" });

    await expect(
      adapter.incrementOne<UserRecord>({
        model: "user",
        where: [
          { field: "id", value: "counter" },
          { field: "count", operator: "lt", value: 2 },
        ],
        increment: { count: 1 },
      }),
    ).resolves.toBeNull();

    await createUser(adapter, "race-counter");
    const increments = await Promise.all([
      adapter.incrementOne<UserRecord>({
        model: "user",
        where: [
          { field: "id", value: "race-counter" },
          { field: "count", operator: "lt", value: 1 },
        ],
        increment: { count: 1 },
      }),
      adapter.incrementOne<UserRecord>({
        model: "user",
        where: [
          { field: "id", value: "race-counter" },
          { field: "count", operator: "lt", value: 1 },
        ],
        increment: { count: 1 },
      }),
    ]);
    expect(increments.filter(Boolean)).toHaveLength(1);
    await expect(
      adapter.findOne<UserRecord>({
        model: "user",
        where: [{ field: "id", value: "race-counter" }],
      }),
    ).resolves.toMatchObject({ count: 1 });
  });

  test("returns Better Auth join shapes", async () => {
    const adapter = createAdapter();
    await createUser(adapter, "joined");
    await adapter.create<Record<string, unknown>>({
      model: "session",
      data: {
        id: "session-1",
        token: "token-1",
        userId: "joined",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      forceAllowId: true,
    });

    const user = await adapter.findOne<UserRecord & { session: SessionRecord[] }>({
      model: "user",
      where: [{ field: "id", value: "joined" }],
      join: { session: true },
    });
    expect(user?.session).toHaveLength(1);
    expect(user?.session[0]).toMatchObject({ token: "token-1" });
  });

  test("returns null when update finds no matching record", async () => {
    const adapter = createAdapter();
    const result = await adapter.update<UserRecord>({
      model: "user",
      where: [{ field: "id", value: "non-existent" }],
      update: { name: "Updated" },
    });
    expect(result).toBeNull();
  });

  test("returns null when update receives empty where clause", async () => {
    const adapter = createAdapter();
    const result = await adapter.update<UserRecord>({
      model: "user",
      where: [],
      update: { name: "Updated" },
    });
    expect(result).toBeNull();
  });

  test("throws error when incrementing a non-existent field", async () => {
    const adapter = createAdapter();
    await createUser(adapter, "inc-err");

    await expect(
      adapter.incrementOne<UserRecord>({
        model: "user",
        where: [{ field: "id", value: "inc-err" }],
        increment: { nonExistentField: 1 },
      }),
    ).rejects.toThrow("Field nonExistentField not found in model user");
  });

  test("supports dynamic EntityManager getter function", async () => {
    let callCount = 0;
    const dynamicAdapter = mikroOrmAdapter({
      em: () => {
        callCount++;
        return orm.em.fork();
      },
    })(betterAuthOptions);

    await createUser(dynamicAdapter, "dynamic-user");
    expect(callCount).toBeGreaterThan(0);
  });

  test("supports explicit provider config option", async () => {
    const customAdapter = mikroOrmAdapter({
      em: () => orm.em.fork(),
      provider: "sqlite",
    })(betterAuthOptions);

    await createUser(customAdapter, "provider-user");
    const user = await customAdapter.findOne<UserRecord>({
      model: "user",
      where: [{ field: "id", value: "provider-user" }],
    });
    expect(user).toMatchObject({ id: "provider-user" });
  });

  test.skipIf(isMongoDb)("rolls back Better Auth transaction callbacks", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.transaction(async (transaction) => {
        await createUser(transaction, "rolled-back");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    await expect(adapter.count({ model: "user" })).resolves.toBe(0);
  });

  test("reports missing entity registration", async () => {
    const adapter = createAdapter();
    await expect(adapter.count({ model: "verification" })).rejects.toThrow(
      'No MikroORM entity is registered for Better Auth model "verification"',
    );
  });
});
