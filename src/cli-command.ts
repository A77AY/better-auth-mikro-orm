import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { BetterAuthOptions } from "better-auth";
import { getAuthTables } from "better-auth/db";
import { createJiti } from "jiti";
import {
  generateMikroOrmSchemaDirectory,
  writeMikroOrmSchemaDirectory,
} from "./directory-generator";
import { readGeneratorOptions } from "./generator-options";
import type { EntityStyle, SchemaCasing } from "./generator";

const help = `better-auth-mikro-orm

Generate one MikroORM entity per file from a Better Auth configuration.

Usage:
  better-auth-mikro-orm generate [options]

Options:
  -c, --config <path>   Better Auth config (default: ./src/auth.ts)
  -o, --output <path>   Output directory (default: src/entities/auth)
      --style <style>   define-entity or decorators
      --casing <casing> camelCase or snake_case
      --file-suffix <s> Custom entity file suffix (e.g. .entity)
  -y, --yes             Overwrite generated files without confirmation
  -h, --help            Show this help
`;

interface AuthLike {
  options: BetterAuthOptions;
}

export interface CliIO {
  cwd?: string;
  stdout?: (message: string) => void;
}

export async function runCli(arguments_: string[], io: CliIO = {}): Promise<number> {
  const { positionals, values } = parseArgs({
    args: arguments_,
    allowPositionals: true,
    options: {
      casing: { type: "string" },
      config: { type: "string", short: "c", default: "./src/auth.ts" },
      "file-suffix": { type: "string" },
      fileSuffix: { type: "string" },
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      style: { type: "string" },
      yes: { type: "boolean", short: "y", default: false },
    },
    strict: true,
  });
  const write = io.stdout ?? ((message: string) => process.stdout.write(message));

  if (values.help) {
    write(help);
    return 0;
  }
  if (positionals[0] !== "generate" || positionals.length !== 1) {
    throw new Error(`Expected the "generate" command.\n\n${help}`);
  }

  const cwd = io.cwd ?? process.cwd();
  const configPath = resolve(cwd, values.config);
  const configModule = await createJiti(import.meta.url).import<Record<string, unknown>>(
    configPath,
  );
  const auth = findAuth(configModule);
  const adapterOptions = readGeneratorOptions(auth.options.database);
  const entityStyle = parseEntityStyle(values.style ?? adapterOptions?.entityStyle);
  const casing = parseCasing(values.casing ?? adapterOptions?.casing);
  const directory = values.output ?? adapterOptions?.directory ?? "src/entities/auth";
  const fileSuffix = values["file-suffix"] ?? values.fileSuffix ?? adapterOptions?.fileSuffix;
  const generatorOptions = {
    tables: getAuthTables(auth.options),
    directory,
    fileSuffix,
    numericIds:
      adapterOptions?.supportsNumericIds ??
      auth.options.advanced?.database?.generateId === "serial",
    supportsArrays: adapterOptions?.supportsArrays ?? false,
    supportsBooleans: adapterOptions?.supportsBooleans ?? true,
    supportsDates: adapterOptions?.supportsDates ?? true,
    supportsJSON: adapterOptions?.supportsJSON ?? true,
    casing,
    entityStyle,
  };

  if (!values.yes) {
    const generated = generateMikroOrmSchemaDirectory(generatorOptions);
    const existing = await findExistingFile(cwd, generated.directory, generated.files);
    if (existing) {
      throw new Error(
        `Refusing to overwrite ${existing}. Pass --yes to overwrite generated files.`,
      );
    }
  }

  const generated = await writeMikroOrmSchemaDirectory({ ...generatorOptions, directory });
  write(
    `Generated ${generated.files.length - 1} entities and index.ts in ${generated.directory}\n`,
  );
  return 0;
}

function findAuth(module: Record<string, unknown>): AuthLike {
  const candidates = [module.auth, module.default, ...Object.values(module)];
  const auth = candidates.find(isAuthLike);
  if (!auth) {
    throw new Error(
      "The config must export a Better Auth instance, for example `export const auth = betterAuth(...)`.",
    );
  }
  return auth;
}

function isAuthLike(value: unknown): value is AuthLike {
  return typeof value === "object" && value !== null && "options" in value;
}

function parseEntityStyle(value: string | undefined): EntityStyle {
  if (value === undefined || value === "define-entity" || value === "decorators") {
    return value ?? "define-entity";
  }
  throw new Error(`Invalid --style value "${value}". Use define-entity or decorators.`);
}

function parseCasing(value: string | undefined): SchemaCasing {
  if (value === undefined || value === "camelCase" || value === "snake_case") {
    return value ?? "camelCase";
  }
  throw new Error(`Invalid --casing value "${value}". Use camelCase or snake_case.`);
}

async function findExistingFile(
  cwd: string,
  directory: string,
  files: Array<{ path: string }>,
): Promise<string | undefined> {
  for (const file of files) {
    const path = resolve(cwd, directory, file.path);
    try {
      await access(path);
      return path;
    } catch {
      // The file does not exist and can be generated safely.
    }
  }
  return undefined;
}
