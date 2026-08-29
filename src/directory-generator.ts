import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateDecoratorFiles } from "./generators/decorators";
import { generateDefineEntityFiles } from "./generators/define-entity";
import type { GeneratedSchemaDirectory, MikroOrmSchemaGeneratorOptions } from "./generators/types";

export function generateMikroOrmSchemaDirectory(
  options: MikroOrmSchemaGeneratorOptions,
): GeneratedSchemaDirectory {
  const style = options.entityStyle ?? "define-entity";
  const files =
    style === "decorators" ? generateDecoratorFiles(options) : generateDefineEntityFiles(options);

  return {
    directory: options.directory ?? "src/entities/auth",
    files,
  };
}

export async function writeMikroOrmSchemaDirectory(
  options: MikroOrmSchemaGeneratorOptions,
): Promise<GeneratedSchemaDirectory> {
  const generated = generateMikroOrmSchemaDirectory(options);
  const directory = resolve(process.cwd(), generated.directory);
  await mkdir(directory, { recursive: true });
  await Promise.all(
    generated.files.map(async (file) => {
      const output = resolve(directory, file.path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, file.code);
    }),
  );
  return generated;
}
