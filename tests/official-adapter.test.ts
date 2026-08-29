import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  joinsTestSuite,
  normalTestSuite,
  numberIdTestSuite,
  testAdapter,
  transactionsTestSuite,
  uuidTestSuite,
} from "@better-auth/test-utils/adapter";
import type { AnyEntity, EntityClass, EntitySchema, MikroORM } from "@mikro-orm/core";
import { MikroORM as SqliteMikroORM } from "@mikro-orm/sqlite";
import { MikroORM as PostgreSqlMikroORM } from "@mikro-orm/postgresql";
import type { BetterAuthOptions } from "better-auth";
import { mikroOrmAdapter } from "../src";
import { createAuthEntities } from "./fixtures/create-auth-entities";

const dbType = (process.env.DB_TYPE || "sqlite").toLowerCase();
let orm: MikroORM | undefined;

function getOrm() {
  if (!orm) throw new Error("The official adapter test database has not been initialized.");
  return orm;
}

async function initOrm(options: BetterAuthOptions): Promise<MikroORM> {
  const entities = createAuthEntities(options) as (
    | string
    | EntityClass<AnyEntity>
    | EntitySchema<AnyEntity>
  )[];

  if (dbType === "postgres" || dbType === "postgresql") {
    const postgresOrm = await PostgreSqlMikroORM.init({
      clientUrl:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@127.0.0.1:5432/better_auth_test",
      entities,
      schemaGenerator: {
        disableForeignKeys: true,
      },
    });
    await postgresOrm.schema.drop();
    await postgresOrm.schema.create();
    return postgresOrm;
  }

  const sqliteOrm = await SqliteMikroORM.init({
    dbName: ":memory:",
    entities,
  });
  await sqliteOrm.schema.create();
  return sqliteOrm;
}

const { execute } = await testAdapter({
  adapter: () => mikroOrmAdapter(() => getOrm().em.fork()),
  runMigrations: async (options) => {
    await orm?.close(true);
    orm = await initOrm(options);
  },
  tests: [
    normalTestSuite(),
    caseInsensitiveTestSuite(),
    transactionsTestSuite(),
    joinsTestSuite(),
    authFlowTestSuite(),
    numberIdTestSuite(),
    uuidTestSuite(),
  ],
  onFinish: async () => {
    await orm?.close(true);
    orm = undefined;
  },
});

execute();
