# @a77ay/better-auth-mikro-orm

MikroORM database adapter and entity generator for [Better Auth](https://www.better-auth.com).

[![npm version](https://img.shields.io/npm/v/@a77ay/better-auth-mikro-orm.svg?color=blue)](https://www.npmjs.com/package/@a77ay/better-auth-mikro-orm)
[![npm downloads](https://img.shields.io/npm/dm/@a77ay/better-auth-mikro-orm.svg?color=blue)](https://www.npmjs.com/package/@a77ay/better-auth-mikro-orm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@a77ay/better-auth-mikro-orm.svg)](https://bundlephobia.com/package/@a77ay/better-auth-mikro-orm)
[![license](https://img.shields.io/npm/l/@a77ay/better-auth-mikro-orm.svg)](https://github.com/A77AY/better-auth-mikro-orm/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## Features

- 🔌 **Native MikroORM Adapter**: Seamlessly integrates with MikroORM's `EntityManager`, Identity Map, and Unit of Work.
- ⚡ **Entity & Schema Generator**: Generate MikroORM entities compatible with Better Auth core and all active plugins.
- 🗄️ **Multi-Database Support**: Full support for PostgreSQL, MySQL, MariaDB, SQLite, LibSQL, MongoDB, and custom drivers.
- 🚀 **Optimized Relations**: Batched queries for joined relations to prevent N+1 issues.
- 🔒 **Type-Safe**: Complete TypeScript support with automatic type inference.

## Installation

```bash
# Using npm
npm install @a77ay/better-auth-mikro-orm @mikro-orm/core

# Using pnpm
pnpm add @a77ay/better-auth-mikro-orm @mikro-orm/core

# Using yarn
yarn add @a77ay/better-auth-mikro-orm @mikro-orm/core

# Using bun
bun add @a77ay/better-auth-mikro-orm @mikro-orm/core
```

## Compatibility

| `@a77ay/better-auth-mikro-orm` | `better-auth` | `@mikro-orm/core` |
| ------------------------------ | ------------- | ----------------- |
| `0.x` (latest)                 | `^1.7.0`      | `^7.0.0`          |

## Quick Start

### 1. Adapter Setup

```typescript
import { betterAuth } from "better-auth";
import { mikroOrmAdapter } from "@a77ay/better-auth-mikro-orm";
import { orm } from "./mikro-orm.config";

export const auth = betterAuth({
  database: mikroOrmAdapter(orm),
});
```

Pass your `MikroORM` instance, `EntityManager`, or a getter function. When passing `orm`, the adapter automatically uses `RequestContext.getEntityManager()` per HTTP request and falls back to `orm.em` for CLI commands and background scripts.

Every Better Auth model must be registered as a MikroORM entity. Its `tableName` must match the
corresponding Better Auth model name (including configured model renames or pluralization). The
adapter handles data access and transactions; MikroORM migrations remain responsible for creating
and updating the database schema.

### 2. Schema / Entity Generation

> [!NOTE]
> Ensure `@a77ay/better-auth-mikro-orm` and `@mikro-orm/core` are installed in your project before generating, as the Better Auth CLI dynamically imports your auth configuration file.

#### Configuring Generator Options

Options such as `entityStyle`, `casing`, and the default output directory are configured directly in `mikroOrmAdapter`:

```typescript
export const auth = betterAuth({
  database: mikroOrmAdapter(orm, {
    entityStyle: "define-entity", // "define-entity" (default) | "decorators"
    casing: "snake_case", // "snake_case" | "camelCase" (default)
    directory: "src/entities/auth", // Default CLI output directory
  }),
});
```

#### Running the Generator

Run the package CLI to generate one file per entity and an `index.ts` barrel:

```bash
pnpm exec better-auth-mikro-orm generate \
  --config ./src/auth.ts \
  --output ./src/entities/auth \
  --yes
```

CLI flags:

- `--config <path>`: Better Auth config (default: `./src/auth.ts`).
- `--output <path>`: Output directory (default: `src/entities/auth`).
- `--style <style>`: `define-entity` or `decorators`; overrides the adapter option.
- `--casing <casing>`: `camelCase` or `snake_case`; overrides the adapter option.
- `--yes`: Overwrite generated files. Without it, existing generated files are protected.

The generated `index.ts` exports each entity and a `betterAuthEntities` array. Register that array
in your MikroORM configuration:

```typescript
import { betterAuthEntities } from "./src/entities/auth";

export default {
  entities: [...betterAuthEntities],
};
```

After generating, use MikroORM's migration tooling to create and apply the database migration.

The generated structure is:

```text
src/entities/auth/
├── user.ts
├── session.ts
├── account.ts
├── verification.ts
└── index.ts
```

`index.ts` exports every entity and the `betterAuthEntities` array. Existing unrelated files in the
directory are left untouched.

The adapter also keeps the official Better Auth `createSchema` hook for consumers that need its
single-file generator contract.

## Configuration Options

The `mikroOrmAdapter` accepts the database instance or getter as its first argument and an optional `options` object as its second argument:

```typescript
mikroOrmAdapter(em, options?)
```

| Parameter / Option | Type                                                 | Default                  | Description                                                                             |
| ------------------ | ---------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `em` (1st arg)     | `MikroORM \| EntityManager \| (() => EntityManager)` | **Required**             | MikroORM instance, `EntityManager`, or getter returning the request-scoped instance.    |
| `provider`         | `DatabaseProvider`                                   | Auto-detected            | Database provider (`"postgresql"`, `"sqlite"`, `"mysql"`, `"mongodb"`, or custom).      |
| `casing`           | `"snake_case" \| "camelCase"`                        | `"camelCase"`            | Naming convention for generated database columns.                                       |
| `entityStyle`      | `"define-entity" \| "decorators"`                    | `"define-entity"`        | Entity definition style (`defineEntity` fluent schema or `@Entity()` class decorators). |
| `directory`        | `string`                                             | `"src/entities/auth"`    | Default output directory used by the package CLI.                                       |
| `schemaFile`       | `string`                                             | `"src/entities/auth.ts"` | Default output file path for CLI schema generation.                                     |
| `debugLogs`        | `boolean \| DBAdapterDebugLogOption`                 | `false`                  | Enable Better Auth adapter debug logging.                                               |
| `usePlural`        | `boolean`                                            | `false`                  | Use plural table names for generated entities.                                          |
| `transactions`     | `boolean`                                            | `true`                   | Whether to execute multi-operation callbacks in a transaction.                          |

### Entity Styles

The generator supports two entity definition styles:

- **`define-entity` (default)**: Modern MikroORM v7 fluent `defineEntity()` schema API with automatic TypeScript type inference (`InferEntity`).
- **`decorators`**: Class-based entities with `@Entity()`, `@Property()`, `@PrimaryKey()`, and `@ManyToOne()`.

```typescript
export const auth = betterAuth({
  database: mikroOrmAdapter(orm, {
    entityStyle: "define-entity", // "define-entity" | "decorators"
    casing: "snake_case", // "snake_case" | "camelCase"
  }),
});
```

## Development

This project uses [Vite+](https://viteplus.dev) for tooling:

- Install dependencies:

  ```bash
  vp install
  ```

- Run tests (SQLite in-memory):

  ```bash
  vp test
  ```

- Type check, lint and format:

  ```bash
  vp check
  ```

- Build library:
  ```bash
  vp pack
  ```

## License

[MIT](LICENSE) © [A77AY](https://github.com/A77AY)
