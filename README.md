# @a77ay/better-auth-mikro-orm

MikroORM database adapter and entity generator for [Better Auth](https://www.better-auth.com).

[**🔌 Database Adapter**](#1-adapter-setup) &nbsp;•&nbsp; [**⚡ CLI Entity Generator**](#2-schema--entity-generation)

[![npm version](https://img.shields.io/npm/v/@a77ay/better-auth-mikro-orm.svg?color=blue&logo=npm&logoColor=white)](https://www.npmjs.com/package/@a77ay/better-auth-mikro-orm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@a77ay/better-auth-mikro-orm.svg?logo=vite&logoColor=white)](https://bundlephobia.com/package/@a77ay/better-auth-mikro-orm)
[![Tests](https://img.shields.io/github/actions/workflow/status/A77AY/better-auth-mikro-orm/ci.yml?branch=main&label=540%2B%20tests%20%28full%20official%20coverage%29&logo=github&logoColor=white)](https://github.com/A77AY/better-auth-mikro-orm/actions/workflows/ci.yml)

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

### 2. Schema / Entity Generation

#### Running the Generator

Use the package CLI to generate individual entity files and an `index.ts` barrel export:

```bash
# Using npx
npx @a77ay/better-auth-mikro-orm generate \
  --config ./src/auth.ts \
  --output ./src/entities/auth \
  --yes

# Using pnpm
pnpm exec @a77ay/better-auth-mikro-orm generate \
  --config ./src/auth.ts \
  --output ./src/entities/auth \
  --yes
```

#### Register in MikroORM

The generated `index.ts` exports each entity and a `betterAuthEntities` array. Register that array in your MikroORM configuration:

```typescript
import { betterAuthEntities } from "./src/entities/auth";

export default {
  entities: [...betterAuthEntities],
};
```

Every Better Auth model must be registered as a MikroORM entity. Its `tableName` must match the
corresponding Better Auth model name (including configured model renames or pluralization).

The adapter handles data access and transactions; MikroORM migrations remain responsible for creating
and updating the database schema. After generating entities, use MikroORM's migration tooling to create
and apply the database migration.

#### CLI Flags

- `--config <path>`: Better Auth config (default: `./src/auth.ts`).
- `--output <path>`: Output directory (default: `src/entities/auth`).
- `--style <style>`: `define-entity` or `decorators`; overrides the adapter option.
- `--casing <casing>`: `camelCase` or `snake_case`; overrides the adapter option.
- `--file-suffix <suffix>`: Custom entity file suffix (e.g. `.entity` for `user.entity.ts`); overrides the adapter option.
- `--yes`: Overwrite generated files. Without it, existing generated files are protected.

#### Configuring Defaults in `auth.ts`

Instead of passing CLI flags every time, generator options such as `entityStyle`, `casing`, `fileSuffix`, and the default output `directory` can be configured directly in `mikroOrmAdapter`:

```typescript
export const auth = betterAuth({
  database: mikroOrmAdapter(orm, {
    entityStyle: "define-entity", // "define-entity" (default) | "decorators"
    casing: "snake_case", // "snake_case" | "camelCase" (default)
    directory: "src/entities/auth", // Default CLI output directory
    fileSuffix: ".entity", // Optional file suffix: user.entity.ts (default: "")
  }),
});
```

#### Single-File Generation (Official Better Auth CLI)

If you prefer generating a single schema file instead of a modular directory, you can use the official Better Auth CLI:

```bash
# Using npx
npx auth@latest generate \
  --config ./src/auth.ts \
  --output ./src/entities/auth.ts \
  --yes

# Using pnpm
pnpm dlx auth@latest generate \
  --config ./src/auth.ts \
  --output ./src/entities/auth.ts \
  --yes
```

The adapter exposes the official Better Auth `createSchema` hook used by this command.

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
| `fileSuffix`       | `string`                                             | `""`                     | Custom file suffix for entity files (e.g. `".entity"` generates `user.entity.ts`).      |
| `directory`        | `string`                                             | `"src/entities/auth"`    | Default output directory used by the package CLI.                                       |
| `schemaFile`       | `string`                                             | `"src/entities/auth.ts"` | Default output file path for CLI schema generation.                                     |
| `debugLogs`        | `boolean \| DBAdapterDebugLogOption`                 | `false`                  | Enable Better Auth adapter debug logging.                                               |
| `usePlural`        | `boolean`                                            | `false`                  | Use plural table names for generated entities.                                          |
| `transactions`     | `boolean`                                            | `true`                   | Whether to execute multi-operation callbacks in a transaction.                          |

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
