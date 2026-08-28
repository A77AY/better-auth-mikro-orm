import type { EntityManager, EntityMetadata } from "@mikro-orm/core";
import { describe, expect, test, vi } from "vite-plus/test";
import { attachJoins, attachJoinsMany, selectFields } from "./joins";
import type { EntityRecord } from "./adapter-utils";

describe("joins", () => {
  describe("selectFields", () => {
    test("returns full row when select is undefined", () => {
      const row = { id: "1", name: "Alice", email: "alice@example.com" };
      expect(selectFields(row, undefined, undefined, (f) => f)).toBe(row);
    });

    test("filters to selected fields while preserving joined relation properties", () => {
      const row = {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
        session: [{ id: "s-1" }],
      };

      const result = selectFields(
        row,
        ["id", "name"],
        { session: { on: { from: "id", to: "userId" }, relation: "one-to-many" } },
        (f) => f,
      );

      expect(result).toEqual({
        id: "1",
        name: "Alice",
        session: [{ id: "s-1" }],
      });
      expect(result).not.toHaveProperty("email");
    });
  });

  describe("attachJoins and attachJoinsMany", () => {
    test("returns empty array / row when input is empty or join is undefined", async () => {
      const mockEm = {} as EntityManager;
      expect(
        await attachJoinsMany(mockEm, [], {
          user: { on: { from: "userId", to: "id" }, relation: "one-to-one" },
        }),
      ).toEqual([]);
      expect(await attachJoinsMany(mockEm, [{ id: "1" }], undefined)).toEqual([{ id: "1" }]);

      const single = await attachJoins(mockEm, { id: "1" }, undefined);
      expect(single).toEqual({ id: "1" });
    });

    test("performs batched query for 1:1 and 1:M relations", async () => {
      const sessionMeta = {
        tableName: "session",
        className: "Session",
        class: class Session {},
      } as unknown as EntityMetadata<EntityRecord>;

      const sessionsInDb = [
        { id: "s-1", userId: "u-1", token: "tok-1" },
        { id: "s-2", userId: "u-1", token: "tok-2" },
        { id: "s-3", userId: "u-2", token: "tok-3" },
      ];

      const find = vi.fn().mockImplementation(async (_cls, filter) => {
        const allowedIds = filter.userId?.$in ?? [filter.userId];
        return sessionsInDb.filter((s) => allowedIds.includes(s.userId));
      });

      const mockEm = {
        getMetadata: () => ({
          getAll: () => new Map([["session", sessionMeta]]),
        }),
        find,
      } as unknown as EntityManager;

      const users = [
        { id: "u-1", name: "Alice" },
        { id: "u-2", name: "Bob" },
        { id: "u-3", name: "Charlie" },
      ];

      const joined = await attachJoinsMany(mockEm, users, {
        session: { on: { from: "id", to: "userId" }, relation: "one-to-many" },
      });

      expect(find).toHaveBeenCalledTimes(1);
      expect(joined[0].session).toHaveLength(2);
      expect(joined[1].session).toHaveLength(1);
      expect(joined[2].session).toEqual([]);
    });

    test("performs per-row queries when 1:M join has a limit", async () => {
      const sessionMeta = {
        tableName: "session",
        className: "Session",
        class: class Session {},
      } as unknown as EntityMetadata<EntityRecord>;

      const find = vi.fn().mockResolvedValue([{ id: "s-1", userId: "u-1" }]);

      const mockEm = {
        getMetadata: () => ({
          getAll: () => new Map([["session", sessionMeta]]),
        }),
        find,
      } as unknown as EntityManager;

      const users = [{ id: "u-1" }, { id: "u-2" }];

      await attachJoinsMany(mockEm, users, {
        session: { on: { from: "id", to: "userId" }, relation: "one-to-many", limit: 1 },
      });

      expect(find).toHaveBeenCalledTimes(2);
    });
  });
});
