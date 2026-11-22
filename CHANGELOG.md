# @a77ay/better-auth-mikro-orm

## 0.2.0

### Minor Changes

- [#12](https://github.com/A77AY/better-auth-mikro-orm/pull/12) [`f8dc283`](https://github.com/A77AY/better-auth-mikro-orm/commit/f8dc283d5688fe3537241a4d5cd27be71ce3eccc) Thanks [@A77AY](https://github.com/A77AY)! - Fix Better Auth 1.7.3+ type compatibility, generator edge cases, CLI working directory handling, and SQL/MongoDB query safety:
  
  - Support optional `consumeOne` and `incrementOne` methods on `CustomAdapter` in Better Auth 1.7.3+ and align `peerDependencies` to `better-auth@^1.7.0`.
  - Escape literal SQL `LIKE` wildcards (`%`, `_`, `\`) in `contains`, `starts_with`, and `ends_with` filters.
  - Use atomic MongoDB `$inc` updates in `incrementOne`.
  - Use lazy relation thunks in `defineEntity` output so self-referencing and circular foreign keys initialize without TDZ errors.
  - Emit only used decorator imports and resolve non-`id` foreign key types accurately in the decorators generator.
  - Honor `io.cwd` when writing generated schema directories via `runCli` and `writeMikroOrmSchemaDirectory`.

## 0.1.1

### Patch Changes

- [#5](https://github.com/A77AY/better-auth-mikro-orm/pull/5) [`5392d6d`](https://github.com/A77AY/better-auth-mikro-orm/commit/5392d6d24c138f0adcb99b58fc70630fc224d1d6) Thanks [@A77AY](https://github.com/A77AY)! - Update release workflow and CI publishing configuration

## 0.1.0

### Minor Changes

- [#1](https://github.com/A77AY/better-auth-mikro-orm/pull/1) [`4dd12f4`](https://github.com/A77AY/better-auth-mikro-orm/commit/4dd12f4282b065d5b46ba97b15fb7f73da6a2ceb) Thanks [@A77AY](https://github.com/A77AY)! - Initial release: Native MikroORM v7 database adapter, entity generator CLI, joined relations batching, and multi-database support for Better Auth.
