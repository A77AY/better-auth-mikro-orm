---
"@a77ay/better-auth-mikro-orm": patch
---

Fix Better Auth 1.7.3+ type compatibility, generator edge cases, CLI working directory handling, and SQL/MongoDB query safety:

- Support optional `consumeOne` and `incrementOne` methods on `CustomAdapter` in Better Auth 1.7.3+ and align `peerDependencies` to `better-auth@^1.7.0`.
- Escape literal SQL `LIKE` wildcards (`%`, `_`, `\`) in `contains`, `starts_with`, and `ends_with` filters.
- Use atomic MongoDB `$inc` updates in `incrementOne`.
- Use lazy relation thunks in `defineEntity` output so self-referencing and circular foreign keys initialize without TDZ errors.
- Emit only used decorator imports and resolve non-`id` foreign key types accurately in the decorators generator.
- Honor `io.cwd` when writing generated schema directories via `runCli` and `writeMikroOrmSchemaDirectory`.
