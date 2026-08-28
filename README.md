# @a77ay/better-auth-mikro-orm

MikroORM community adapter and entity/schema generator for [Better Auth](https://www.better-auth.com).

[![npm version](https://img.shields.io/npm/v/@a77ay/better-auth-mikro-orm.svg)](https://www.npmjs.com/package/@a77ay/better-auth-mikro-orm)
[![license](https://img.shields.io/npm/l/@a77ay/better-auth-mikro-orm.svg)](https://github.com/A77AY/better-auth-mikro-orm/blob/main/LICENSE)

## Features

- 🔌 **MikroORM Adapter**: Community database adapter for Better Auth.
- ⚡ **Entity & Schema Generator**: Generate MikroORM entities and schemas compatible with Better Auth core and plugins.
- 🗄️ **Multi-Driver Support**: Compatible with PostgreSQL, MySQL, SQLite, MongoDB and other databases supported by MikroORM.
- 🔒 **Type-Safe**: Full TypeScript support with end-to-end type safety.

## Installation

```bash
# Using pnpm
pnpm add @a77ay/better-auth-mikro-orm @mikro-orm/core

# Using npm
npm install @a77ay/better-auth-mikro-orm @mikro-orm/core

# Using yarn
yarn add @a77ay/better-auth-mikro-orm @mikro-orm/core

# Using bun
bun add @a77ay/better-auth-mikro-orm @mikro-orm/core
```

## Quick Start

### 1. Adapter Setup

```typescript
import { betterAuth } from "better-auth";
import { mikroOrmAdapter } from "@a77ay/better-auth-mikro-orm";
import { em } from "./mikro-orm.config";

export const auth = betterAuth({
  database: mikroOrmAdapter({
    em,
  }),
});
```

### 2. Schema / Entity Generation

Generate MikroORM entities based on your Better Auth configuration and active plugins:

```bash
npx @a77ay/better-auth-mikro-orm generate
```

## Development

This project uses [Vite+](https://viteplus.dev) for tooling:

- Install dependencies:

  ```bash
  vp install
  ```

- Run tests:

  ```bash
  vp test
  ```

- Type check, lint and format:

  ```bash
  vp check
  ```

- Build:
  ```bash
  vp pack
  ```

## License

[MIT](LICENSE) © [A77AY](https://github.com/A77AY)
