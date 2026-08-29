import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { runCli } from "./cli-command";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("better-auth-mikro-orm CLI", () => {
  test("loads a TypeScript auth config and generates one entity per file", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-cli-"));
    temporaryDirectories.push(directory);
    const config = join(directory, "auth.ts");
    const output = join(directory, "entities");
    await writeFile(
      config,
      `export const auth = {
  options: {
    user: {
      additionalFields: {
        displayName: { type: "string", required: false },
      },
    },
  },
};
`,
    );
    const messages: string[] = [];

    const exitCode = await runCli(
      ["generate", "--config", config, "--output", output, "--casing", "snake_case"],
      { stdout: (message) => messages.push(message) },
    );

    expect(exitCode).toBe(0);
    expect(messages.join("")).toContain("Generated 4 entities and index.ts");
    expect(await readFile(join(output, "user.ts"), "utf8")).toContain(
      'displayName: p.text().fieldName("display_name")',
    );
    const index = await readFile(join(output, "index.ts"), "utf8");
    expect(index).toContain("export const betterAuthEntities = [");
    expect(index).toContain("  User,");
    expect(index).toContain("  Verification,");
  });

  test("does not overwrite generated files unless --yes is passed", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-cli-overwrite-"));
    temporaryDirectories.push(directory);
    const config = join(directory, "auth.ts");
    const output = join(directory, "entities");
    await writeFile(config, "export default { options: {} };\n");

    await runCli(["generate", "--config", config, "--output", output]);

    await expect(runCli(["generate", "--config", config, "--output", output])).rejects.toThrow(
      "Pass --yes",
    );
    await expect(
      runCli(["generate", "--config", config, "--output", output, "--yes"]),
    ).resolves.toBe(0);
  });

  test("supports --file-suffix to customize entity file names", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-cli-suffix-"));
    temporaryDirectories.push(directory);
    const config = join(directory, "auth.ts");
    const output = join(directory, "entities");
    await writeFile(config, "export default { options: {} };\n");

    const exitCode = await runCli([
      "generate",
      "--config",
      config,
      "--output",
      output,
      "--file-suffix",
      ".entity",
      "--yes",
    ]);

    expect(exitCode).toBe(0);
    expect(await readFile(join(output, "user.entity.ts"), "utf8")).toContain("export const User");
    const index = await readFile(join(output, "index.ts"), "utf8");
    expect(index).toContain('import { User } from "./user.entity";');
  });

  test("prints help without loading a config", async () => {
    const messages: string[] = [];
    await expect(runCli(["--help"], { stdout: (message) => messages.push(message) })).resolves.toBe(
      0,
    );
    expect(messages.join("")).toContain("better-auth-mikro-orm generate");
  });
});
