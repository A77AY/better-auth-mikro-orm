import type { EntityManager, EntityMetadata, MikroORM } from "@mikro-orm/core";
import { LockMode, RequestContext } from "@mikro-orm/core";
import { describe, expect, test, vi } from "vite-plus/test";
import {
  findOneForMutation,
  getEntityManager,
  isMongo,
  primaryKeyWhere,
  resolveEntity,
  supportsPessimisticLock,
  toFilter,
  type EntityRecord,
} from "./utils";

describe("adapter-utils", () => {
  describe("getEntityManager", () => {
    test("returns EntityManager instance when passed directly", () => {
      const mockEm = {} as EntityManager;
      expect(getEntityManager(mockEm)).toBe(mockEm);
    });

    test("returns forked orm.em when passed a MikroORM instance", () => {
      const forkedEm = {} as EntityManager;
      const fork = vi.fn(() => forkedEm);
      const mockOrm = { em: { fork } } as unknown as MikroORM;
      expect(getEntityManager(mockOrm)).toBe(forkedEm);
      expect(fork).toHaveBeenCalledTimes(1);
    });

    test("invokes getter function to return EntityManager", () => {
      const mockEm = {} as EntityManager;
      const getter = vi.fn(() => mockEm);
      expect(getEntityManager(getter)).toBe(mockEm);
      expect(getter).toHaveBeenCalledTimes(1);
    });

    test("prefers active RequestContext for MikroORM instance but preserves explicit EntityManager", async () => {
      const scopedEm = {
        name: "default",
        fork: () => scopedEm,
        getContext: () => scopedEm,
      } as unknown as EntityManager;
      const explicitEm = {} as EntityManager;
      const mockOrm = { em: { fork: () => ({}) as EntityManager } } as unknown as MikroORM;

      await RequestContext.create(scopedEm, async () => {
        expect(getEntityManager(mockOrm)).toBe(scopedEm);
        expect(getEntityManager(explicitEm)).toBe(explicitEm);
        expect(getEntityManager(() => explicitEm)).toBe(explicitEm);
      });
    });
  });

  describe("resolveEntity", () => {
    test("resolves entity by tableName, className, or name", () => {
      const userMeta = {
        tableName: "users_table",
        className: "UserClass",
        name: "User",
      } as EntityMetadata<EntityRecord>;
      const sessionMeta = {
        tableName: "session",
        className: "Session",
        name: "Session",
      } as EntityMetadata<EntityRecord>;

      const mockEm = {
        getMetadata: () => ({
          getAll: () =>
            new Map([
              ["user", userMeta],
              ["session", sessionMeta],
            ]),
        }),
      } as unknown as EntityManager;

      expect(resolveEntity(mockEm, "users_table")).toBe(userMeta);
      expect(resolveEntity(mockEm, "UserClass")).toBe(userMeta);
      expect(resolveEntity(mockEm, "User")).toBe(userMeta);
      expect(resolveEntity(mockEm, "session")).toBe(sessionMeta);
    });

    test("resolves entity with case-insensitivity", () => {
      const userMeta = {
        tableName: "user",
        className: "User",
        name: "User",
      } as EntityMetadata<EntityRecord>;

      const mockEm = {
        getMetadata: () => ({
          getAll: () => new Map([["user", userMeta]]),
        }),
      } as unknown as EntityManager;

      expect(resolveEntity(mockEm, "user")).toBe(userMeta);
      expect(resolveEntity(mockEm, "USER")).toBe(userMeta);
      expect(resolveEntity(mockEm, "User")).toBe(userMeta);
    });

    test("throws BetterAuthError with registered models when entity not found", () => {
      const userMeta = { tableName: "user" } as EntityMetadata<EntityRecord>;
      const mockEm = {
        getMetadata: () => ({
          getAll: () => new Map([["user", userMeta]]),
        }),
      } as unknown as EntityManager;

      expect(() => resolveEntity(mockEm, "account")).toThrow(
        'No MikroORM entity is registered for Better Auth model "account". Registered entities: user.',
      );
    });
  });

  describe("primaryKeyWhere", () => {
    test("constructs primary key filter query", () => {
      const meta = { primaryKeys: ["id"] } as unknown as EntityMetadata<EntityRecord>;
      expect(primaryKeyWhere(meta, { id: "u-1", name: "Alice" })).toEqual({ id: "u-1" });

      const compositeMeta = {
        primaryKeys: ["userId", "roleId"],
      } as unknown as EntityMetadata<EntityRecord>;
      expect(
        primaryKeyWhere(compositeMeta, { userId: "u-1", roleId: "r-1", active: true }),
      ).toEqual({
        userId: "u-1",
        roleId: "r-1",
      });
    });
  });

  describe("supportsPessimisticLock and isMongo", () => {
    test("detects platform support without provider override", () => {
      const postgresEm = {
        getPlatform: () => ({ constructor: { name: "PostgreSqlPlatform" } }),
      } as unknown as EntityManager;
      const sqliteEm = {
        getPlatform: () => ({ constructor: { name: "SqlitePlatform" } }),
      } as unknown as EntityManager;
      const mongoEm = {
        getPlatform: () => ({ constructor: { name: "MongoPlatform" } }),
      } as unknown as EntityManager;

      expect(supportsPessimisticLock(postgresEm)).toBe(true);
      expect(supportsPessimisticLock(sqliteEm)).toBe(false);
      expect(supportsPessimisticLock(mongoEm)).toBe(false);

      expect(isMongo(postgresEm)).toBe(false);
      expect(isMongo(sqliteEm)).toBe(false);
      expect(isMongo(mongoEm)).toBe(true);
    });

    test("respects explicit provider config overrides and variants", () => {
      const mockEm = {
        getPlatform: () => ({ constructor: { name: "SqlitePlatform" } }),
      } as unknown as EntityManager;

      expect(supportsPessimisticLock(mockEm, "postgresql")).toBe(true);
      expect(supportsPessimisticLock(mockEm, "sqlite")).toBe(false);
      expect(supportsPessimisticLock(mockEm, "better-sqlite3")).toBe(false);
      expect(supportsPessimisticLock(mockEm, "sqlite3")).toBe(false);
      expect(supportsPessimisticLock(mockEm, "libsql")).toBe(false);
      expect(supportsPessimisticLock(mockEm, "turso")).toBe(false);
      expect(supportsPessimisticLock(mockEm, "cloudflare-d1")).toBe(false);
      expect(supportsPessimisticLock(mockEm, "mongodb")).toBe(false);

      expect(isMongo(mockEm, "mongodb")).toBe(true);
      expect(isMongo(mockEm, "mongo")).toBe(true);
      expect(isMongo(mockEm, "postgresql")).toBe(false);
    });
  });

  describe("findOneForMutation", () => {
    class User {
      [key: string]: unknown;
    }

    test("applies pessimistic write lock on supported platforms", async () => {
      const findOne = vi.fn().mockResolvedValue({ id: "1" });
      const postgresEm = {
        getPlatform: () => ({ constructor: { name: "PostgreSqlPlatform" } }),
        findOne,
      } as unknown as EntityManager;

      await findOneForMutation(postgresEm, User, { id: "1" });
      expect(findOne).toHaveBeenCalledWith(
        User,
        { id: "1" },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
    });

    test("omits lock mode on platforms not supporting pessimistic locks", async () => {
      const findOne = vi.fn().mockResolvedValue({ id: "1" });
      const sqliteEm = {
        getPlatform: () => ({ constructor: { name: "SqlitePlatform" } }),
        findOne,
      } as unknown as EntityManager;

      await findOneForMutation(sqliteEm, User, { id: "1" });
      expect(findOne).toHaveBeenCalledWith(User, { id: "1" }, undefined);
    });
  });

  describe("toFilter", () => {
    test("delegates to transformWhere", () => {
      const meta = {
        className: "User",
        properties: { id: { name: "id" } },
      } as unknown as EntityMetadata<EntityRecord>;
      const mockEm = {
        getPlatform: () => ({ constructor: { name: "SqlitePlatform" } }),
      } as unknown as EntityManager;

      const filter = toFilter(mockEm, meta, [{ field: "id", operator: "eq", value: "123" }]);
      expect(filter).toEqual({ id: { $eq: "123" } });
    });
  });
});
