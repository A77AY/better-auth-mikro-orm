import type { EntityManager, FilterQuery } from "@mikro-orm/core";
import type { JoinConfig } from "better-auth/adapters";
import { resolveEntity, toPlainObject, type EntityRecord } from "./utils";

/**
 * Fetch and attach joined relations (1:1 and 1:M) to a single entity record.
 */
export async function attachJoins(
  em: EntityManager,
  row: EntityRecord,
  join: JoinConfig | undefined,
): Promise<EntityRecord> {
  const [result] = await attachJoinsMany(em, [row], join);
  return result ?? row;
}

/**
 * Fetch and attach joined relations for multiple entity records in batches.
 * Uses a single WHERE ... IN (...) query per relation model when possible.
 */
export async function attachJoinsMany(
  em: EntityManager,
  rows: EntityRecord[],
  join: JoinConfig | undefined,
): Promise<EntityRecord[]> {
  if (!join || rows.length === 0) return rows;

  const results = rows.map((row) => ({ ...row }));

  for (const [joinedModel, config] of Object.entries(join)) {
    const isOneToOne = config.relation === "one-to-one";
    const hasLimit = config.limit != null;

    // When there is a per-parent limit on a 1:M relation, query individually to honor limits per row
    if (!isOneToOne && hasLimit) {
      await Promise.all(
        results.map(async (row) => {
          const sourceValue = row[config.on.from];
          if (sourceValue == null) {
            row[joinedModel] = [];
            return;
          }

          const joinedMeta = resolveEntity(em, joinedModel);
          const matches = await em.find(
            joinedMeta.class,
            { [config.on.to]: sourceValue } as FilterQuery<EntityRecord>,
            {
              disableIdentityMap: true,
              limit: config.limit,
            },
          );
          row[joinedModel] = matches.map((match) => toPlainObject(match));
        }),
      );
      continue;
    }

    // Batched query for 1:1 joins and unlimited 1:M joins
    const sourceValues = Array.from(
      new Set(results.map((row) => row[config.on.from]).filter((value) => value != null)),
    );

    if (sourceValues.length === 0) {
      for (const row of results) {
        row[joinedModel] = isOneToOne ? null : [];
      }
      continue;
    }

    const joinedMeta = resolveEntity(em, joinedModel);
    const filter = (
      sourceValues.length === 1
        ? { [config.on.to]: sourceValues[0] }
        : { [config.on.to]: { $in: sourceValues } }
    ) as FilterQuery<EntityRecord>;

    const matches = await em.find(joinedMeta.class, filter, {
      disableIdentityMap: true,
    });

    const grouped = new Map<unknown, EntityRecord[]>();
    for (const match of matches) {
      const plain = toPlainObject(match);
      const key = plain[config.on.to];
      let list = grouped.get(key);
      if (!list) {
        list = [];
        grouped.set(key, list);
      }
      list.push(plain);
    }

    for (const row of results) {
      const sourceKey = row[config.on.from];
      const items = sourceKey != null ? (grouped.get(sourceKey) ?? []) : [];
      row[joinedModel] = isOneToOne ? (items[0] ?? null) : items;
    }
  }

  return results;
}

/**
 * Filter an entity record to include only selected fields plus joined relations.
 */
export function selectFields(
  row: EntityRecord,
  select: string[] | undefined,
  join: JoinConfig | undefined,
  getSelectedFieldName: (field: string) => string,
): EntityRecord {
  if (!select) return row;

  const selected = Object.fromEntries(
    select.map((field) => {
      const selectedField = getSelectedFieldName(field);
      return [selectedField, row[selectedField]];
    }),
  );
  for (const joinedModel of Object.keys(join ?? {})) {
    selected[joinedModel] = row[joinedModel];
  }
  return selected;
}
