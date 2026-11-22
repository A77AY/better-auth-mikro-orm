import { raw, wrap, type EntityData, type EntityManager, type FilterQuery } from "@mikro-orm/core";
import { BetterAuthError, type BetterAuthOptions } from "better-auth";
import {
  createAdapterFactory,
  type AdapterFactoryCustomizeAdapterCreator,
  type AdapterFactoryOptions,
  type CustomAdapter,
} from "better-auth/adapters";
import { generateMikroOrmSchema } from "../generator";
import { attachJoins, attachJoinsMany, selectFields } from "./joins";
import { attachGeneratorOptions } from "./options";
import type { MikroOrmAdapterOptions } from "./types";
import {
  findOneForMutation,
  findProperty,
  getEntityManager,
  isMongo,
  primaryKeyWhere,
  resolveEntity,
  toFilter,
  toPlainObject,
  type EntityManagerProvider,
  type EntityRecord,
} from "./utils";

export type { MikroOrmAdapterOptions };

type FindOneInput = Parameters<CustomAdapter["findOne"]>[0];
type FindManyInput = Parameters<CustomAdapter["findMany"]>[0];
type ConsumeOneInput = Parameters<NonNullable<CustomAdapter["consumeOne"]>>[0];
type IncrementOneInput = Parameters<NonNullable<CustomAdapter["incrementOne"]>>[0];

function createOrmAdapter(
  provider: EntityManagerProvider,
  adapterOptions?: MikroOrmAdapterOptions,
): AdapterFactoryCustomizeAdapterCreator {
  return ({ getFieldName, options: authOptions }) => {
    const adapter: CustomAdapter = {
      create: async ({ data, model }) => {
        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const instance = em.create(meta.class, data as EntityData<EntityRecord>);
        em.persist(instance);
        await em.flush();
        const stored = (await em.refresh(instance)) ?? instance;
        return toPlainObject(stored) as typeof data;
      },

      update: async ({ model, where, update }) => {
        if (!where.length) return null;

        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const instance = await em.findOne(
          meta.class,
          toFilter(em, meta, where, adapterOptions?.provider),
        );
        if (!instance) return null;

        wrap(instance).assign(update as EntityData<EntityRecord>);
        await em.flush();
        return toPlainObject(instance) as typeof update;
      },

      updateMany: async ({ model, where, update }) => {
        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        return em.nativeUpdate(
          meta.class,
          toFilter(em, meta, where, adapterOptions?.provider),
          update as EntityData<EntityRecord>,
        );
      },

      findOne: async <T>(input: FindOneInput) => {
        const { model, where, select, join } = input;
        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const instance = await em.findOne(
          meta.class,
          toFilter(em, meta, where, adapterOptions?.provider),
          {
            disableIdentityMap: true,
          },
        );
        if (!instance) return null;

        const result = await attachJoins(em, toPlainObject(instance), join);
        return selectFields(result, select, join, (field) => getFieldName({ model, field })) as T;
      },

      findMany: async <T>(input: FindManyInput) => {
        const { model, where, limit, select, sortBy, offset, join } = input;
        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const instances = await em.find(
          meta.class,
          toFilter(em, meta, where, adapterOptions?.provider),
          {
            disableIdentityMap: true,
            limit,
            offset,
            ...(sortBy ? { orderBy: { [sortBy.field]: sortBy.direction } } : {}),
          },
        );

        const plainRows = instances.map((instance) => toPlainObject(instance));
        const joinedRows = await attachJoinsMany(em, plainRows, join);
        return joinedRows.map((result) =>
          selectFields(result, select, join, (field) => getFieldName({ model, field })),
        ) as T[];
      },

      count: async ({ model, where }) => {
        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        return em.count(meta.class, toFilter(em, meta, where, adapterOptions?.provider));
      },

      createSchema: async ({ tables, file }) =>
        generateMikroOrmSchema({
          tables,
          file: file ?? adapterOptions?.schemaFile,
          numericIds:
            adapterOptions?.supportsNumericIds ??
            authOptions.advanced?.database?.generateId === "serial",
          supportsArrays: adapterOptions?.supportsArrays ?? false,
          supportsBooleans: adapterOptions?.supportsBooleans ?? true,
          supportsDates: adapterOptions?.supportsDates ?? true,
          supportsJSON: adapterOptions?.supportsJSON ?? true,
          casing: adapterOptions?.casing,
          entityStyle: adapterOptions?.entityStyle,
        }),

      delete: async ({ model, where }) => {
        if (!where.length) return;

        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const instance = await em.findOne(
          meta.class,
          toFilter(em, meta, where, adapterOptions?.provider),
        );
        if (!instance) return;

        em.remove(instance);
        await em.flush();
      },

      deleteMany: async ({ model, where }) => {
        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        return em.nativeDelete(meta.class, toFilter(em, meta, where, adapterOptions?.provider));
      },

      consumeOne: async <T>(input: ConsumeOneInput) => {
        const { model, where } = input;
        if (!where.length) return null;

        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const executeConsume = async (transaction: EntityManager) => {
          const transformedWhere = toFilter(transaction, meta, where, adapterOptions?.provider);
          const instance = await findOneForMutation(
            transaction,
            meta.class,
            transformedWhere,
            adapterOptions?.provider,
          );
          if (!instance) return null;

          const result = toPlainObject(instance);
          const affected = await transaction.nativeDelete(meta.class, {
            $and: [transformedWhere, primaryKeyWhere(meta, instance)],
          } as FilterQuery<EntityRecord>);
          return affected === 1 ? (result as T) : null;
        };

        if (isMongo(em, adapterOptions?.provider)) {
          return executeConsume(em);
        }

        return em.transactional(executeConsume);
      },

      incrementOne: async <T>(input: IncrementOneInput) => {
        const { model, where, increment, set } = input;
        if (!where.length) return null;

        const em = getEntityManager(provider);
        const meta = resolveEntity(em, model);
        const executeIncrement = async (transaction: EntityManager) => {
          const transformedWhere = toFilter(transaction, meta, where, adapterOptions?.provider);
          const instance = await findOneForMutation(
            transaction,
            meta.class,
            transformedWhere,
            adapterOptions?.provider,
          );
          if (!instance) return null;

          const update: EntityRecord = {};
          if (set) {
            for (const [field, value] of Object.entries(set)) {
              const property = findProperty(meta, field);
              const key = property?.name ?? field;
              update[key] = value;
            }
          }

          for (const [field, delta] of Object.entries(increment)) {
            const property = findProperty(meta, field);
            if (!property) {
              throw new BetterAuthError(
                `No field "${field}" exists on MikroORM entity "${meta.className}".`,
              );
            }

            if (isMongo(transaction, adapterOptions?.provider)) {
              const current = instance[property.name];
              if (typeof current !== "number") {
                throw new TypeError(`Cannot increment non-numeric field "${field}" on "${model}".`);
              }
              if (delta !== 0) {
                update[property.name] = { $inc: delta };
              }
            } else {
              update[property.name] = raw("?? + ?", [
                property.fieldNames[0] ?? property.name,
                delta,
              ]);
            }
          }

          if (Object.keys(update).length === 0) {
            return toPlainObject(instance) as T;
          }

          const primaryWhere = primaryKeyWhere(meta, instance);
          const affected = await transaction.nativeUpdate(
            meta.class,
            {
              $and: [transformedWhere, primaryWhere],
            } as FilterQuery<EntityRecord>,
            update as EntityData<EntityRecord>,
          );
          if (affected === 0) return null;

          const updated = await transaction.findOne(meta.class, primaryWhere, { refresh: true });
          return (updated ? toPlainObject(updated) : null) as T;
        };

        if (isMongo(em, adapterOptions?.provider)) {
          return executeIncrement(em);
        }

        return em.transactional(executeIncrement);
      },
    };

    return adapter;
  };
}

export function mikroOrmAdapter(em: EntityManagerProvider, options?: MikroOrmAdapterOptions) {
  let betterAuthOptions: BetterAuthOptions | undefined;
  const baseConfig: AdapterFactoryOptions["config"] = {
    adapterId: "mikro-orm",
    adapterName: "MikroORM Adapter",
    debugLogs: options?.debugLogs ?? false,
    usePlural: options?.usePlural ?? false,
    supportsJSON: options?.supportsJSON ?? true,
    supportsDates: options?.supportsDates ?? true,
    supportsBooleans: options?.supportsBooleans ?? true,
    supportsArrays: options?.supportsArrays ?? false,
    supportsNumericIds: options?.supportsNumericIds ?? true,
    transaction:
      options?.transactions === false
        ? false
        : async (callback) => {
            if (!betterAuthOptions) {
              throw new BetterAuthError(
                "The MikroORM adapter has not been initialized by Better Auth.",
              );
            }
            const authOptions = betterAuthOptions;

            return getEntityManager(em).transactional(async (transaction) => {
              const transactionFactory = createAdapterFactory({
                config: { ...baseConfig, transaction: false },
                adapter: createOrmAdapter(transaction, options),
              });
              return callback(transactionFactory(authOptions));
            });
          },
  };

  const factory = createAdapterFactory({
    config: baseConfig,
    adapter: createOrmAdapter(em, options),
  });

  return attachGeneratorOptions((authOptions: BetterAuthOptions) => {
    betterAuthOptions = authOptions;
    return factory(authOptions);
  }, options);
}
