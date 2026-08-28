export const D1_MAX_BOUND_PARAMETERS = 100;
export const D1_SAFE_INSERT_PARAMETER_BUDGET = 80;

/**
 * D1 accepts at most 100 bound values in one statement. Drizzle may also bind
 * schema defaults that are not present in the supplied object, so keep a
 * conservative 20-value reserve when sizing each multi-row insert.
 */
export function d1InsertBatches<T extends Record<string, unknown>>(
  rows: readonly T[],
): T[][] {
  if (!rows.length) return [];

  const valuesPerRow = Math.max(
    1,
    ...rows.map(
      (row) => Object.values(row).filter((value) => value !== undefined).length,
    ),
  );
  const batchSize = Math.max(
    1,
    Math.floor(D1_SAFE_INSERT_PARAMETER_BUDGET / valuesPerRow),
  );

  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }
  return batches;
}
