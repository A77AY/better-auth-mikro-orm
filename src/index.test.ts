import { describe, expect, test } from "vite-plus/test";
import * as BetterAuthMikroOrm from "./index";

describe("public exports", () => {
  test("exports adapter, generators, and cli utilities", () => {
    expect(BetterAuthMikroOrm.mikroOrmAdapter).toBeDefined();
    expect(BetterAuthMikroOrm.generateMikroOrmSchema).toBeDefined();
    expect(BetterAuthMikroOrm.generateMikroOrmSchemaDirectory).toBeDefined();
    expect(BetterAuthMikroOrm.writeMikroOrmSchemaDirectory).toBeDefined();
    expect(BetterAuthMikroOrm.runCli).toBeDefined();
    expect(BetterAuthMikroOrm.getEntityManager).toBeDefined();
    expect(BetterAuthMikroOrm.resolveEntity).toBeDefined();
    expect(BetterAuthMikroOrm.attachGeneratorOptions).toBeDefined();
    expect(BetterAuthMikroOrm.readGeneratorOptions).toBeDefined();
  });
});
