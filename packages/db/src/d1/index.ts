// @openproduct/db on D1 — barrel (openproduct-standalone OPN, D1 slice proof).
//
// Workers-safe: nothing exported here touches node:*. The test-only schema
// loader (`./schema.ts`) reads the migration from disk and is imported by
// tests directly. A Worker applies the migration from its own bundle: the SQL
// file is exported as `@openproduct/db/d1/slice.sql` (a wrangler Text module)
// and split with `splitSqlStatements`; the corpus loader is
// `@openproduct/db/d1/corpus`.

export type { D1Binding, D1PreparedStatement, D1Result, D1Meta } from "./binding.js";
export type { D1RoundObserver, D1SqlExecutor, D1Statement } from "./executor.js";
export { createD1Executor } from "./executor.js";
export type { TranslatedSql } from "./sql.js";
export { D1_MAX_BOUND_PARAMETERS, toBindValue, toInstant, toInstantOrNull, translatePlaceholders } from "./sql.js";
export { isCheckViolation, isForeignKeyViolation, isTriggerAbort, isUniqueViolation } from "./errors.js";
export type { D1SliceOptions, D1SliceRepository, SliceMethods } from "./slice-repository.js";
export { DEFAULT_MAX_PARAM_BYTES, chunkJsonArrays, createD1SliceRepository } from "./slice-repository.js";
export { SLICE_TABLES_CHILDREN_FIRST, splitSqlStatements } from "./statements.js";
