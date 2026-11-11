// Constraint-violation detection for D1 (openproduct-standalone OPN).
//
// VERBATIM FROM the cirrus baseline's `packages/db/src/d1/errors.ts` in
// pullely/ackstack (read at 20c7e1cd). SQLite reports a violated constraint as
// an error message, not a SQLSTATE: D1 surfaces `D1_ERROR: UNIQUE constraint
// failed: <table>.<column>` and so on, so the message is the signal.
// `isTriggerAbort` is added for this schema's one trigger (the gallery
// ceiling), which D1 reports as `SQLITE_CONSTRAINT_TRIGGER`.

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message ?? "");
  }
  return "";
}

/** True when the error is SQLite refusing a duplicate key. */
export function isUniqueViolation(err: unknown): boolean {
  return /(UNIQUE|PRIMARY KEY) constraint failed/i.test(messageOf(err));
}

/** True when the error is SQLite refusing a write that breaks a foreign key. */
export function isForeignKeyViolation(err: unknown): boolean {
  return /FOREIGN KEY constraint failed/i.test(messageOf(err));
}

/** True when the error is SQLite refusing a write that breaks a CHECK or
 *  NOT NULL constraint — a caller-supplied value the schema rejects. */
export function isCheckViolation(err: unknown): boolean {
  return /(CHECK|NOT NULL) constraint failed/i.test(messageOf(err));
}

/** True when a `RAISE(ABORT, …)` in a trigger refused the write. */
export function isTriggerAbort(err: unknown): boolean {
  return /SQLITE_CONSTRAINT_TRIGGER/i.test(messageOf(err));
}
