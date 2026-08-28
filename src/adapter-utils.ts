import {
  LockMode,
  wrap,
  type EntityManager,
  type EntityMetadata,
  type EntityName,
  type FilterQuery,
} from "@mikro-orm/core";
import { BetterAuthError } from "better-auth";
import { transformWhere } from "./where";

export type EntityRecord = Record<string, unknown>;
export type EntityManagerProvider = EntityManager | (() => EntityManager);
export type DatabaseProvider =
  | "postgresql"
  | "postgres"
  | "sqlite"
  | "mysql"
  | "mariadb"
  | "mongodb"
  | "sqlserver"
  | "libsql"
  | (string & {});

export function getEntityManager(provider: EntityManagerProvider): EntityManager {
  return typeof provider === "function" ? provider() : provider;
}

export function resolveEntity(em: EntityManager, model: string): EntityMetadata<EntityRecord> {
  const metadata = [...em.getMetadata().getAll().values()];
  const lower = model.toLowerCase();

  const entity = metadata.find(
    (item) =>
      item.tableName === model ||
      item.className === model ||
      item.name === model ||
      item.tableName?.toLowerCase() === lower ||
      item.className?.toLowerCase() === lower,
  );

  if (!entity) {
    const registered = metadata
      .map(({ tableName, className, name }) => tableName || className || name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b))
      .join(", ");
    throw new BetterAuthError(
      `No MikroORM entity is registered for Better Auth model "${model}". Registered entities: ${registered || "none"}.`,
    );
  }

  return entity as EntityMetadata<EntityRecord>;
}

export function toPlainObject(entity: EntityRecord): EntityRecord {
  const wrapped = wrap(entity, true);
  return typeof wrapped?.toPOJO === "function" ? (wrapped.toPOJO() as EntityRecord) : { ...entity };
}

export function primaryKeyWhere(
  meta: EntityMetadata<EntityRecord>,
  entity: EntityRecord,
): FilterQuery<EntityRecord> {
  return Object.fromEntries(
    meta.primaryKeys.map((key) => [key, entity[key]]),
  ) as FilterQuery<EntityRecord>;
}

function isNoLockPlatform(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("sqlite") ||
    lower.includes("mongo") ||
    lower.includes("libsql") ||
    lower.includes("turso") ||
    lower.includes("d1")
  );
}

export function supportsPessimisticLock(em: EntityManager, provider?: DatabaseProvider): boolean {
  if (provider) {
    return !isNoLockPlatform(provider);
  }
  return !isNoLockPlatform(em.getPlatform().constructor.name);
}

export function isMongo(em: EntityManager, provider?: DatabaseProvider): boolean {
  if (provider) return provider.toLowerCase().includes("mongo");
  return em.getPlatform().constructor.name.toLowerCase().includes("mongo");
}

export function toFilter(
  em: EntityManager,
  meta: EntityMetadata<EntityRecord>,
  where: Parameters<typeof transformWhere>[0],
  provider?: DatabaseProvider,
): FilterQuery<EntityRecord> {
  return transformWhere(where, { meta, mongo: isMongo(em, provider) });
}

export async function findOneForMutation(
  em: EntityManager,
  entity: EntityName<EntityRecord>,
  where: FilterQuery<EntityRecord>,
  provider?: DatabaseProvider,
) {
  const options = supportsPessimisticLock(em, provider)
    ? { lockMode: LockMode.PESSIMISTIC_WRITE }
    : undefined;
  return em.findOne(entity, where, options);
}
