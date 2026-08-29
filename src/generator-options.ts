import type { MikroOrmAdapterOptions } from "./mikro-orm-adapter";

const generatorOptions = Symbol.for("@a77ay/better-auth-mikro-orm/generator-options");

type AdapterFactory = (...arguments_: any[]) => unknown;

export function attachGeneratorOptions<T extends AdapterFactory>(
  factory: T,
  options: MikroOrmAdapterOptions | undefined,
): T {
  Object.defineProperty(factory, generatorOptions, {
    value: options ?? {},
  });
  return factory;
}

export function readGeneratorOptions(value: unknown): MikroOrmAdapterOptions | undefined {
  if (typeof value !== "function") return undefined;
  return (value as TAdapterFactory)[generatorOptions];
}

type TAdapterFactory = AdapterFactory & {
  [generatorOptions]?: MikroOrmAdapterOptions;
};
