// The subject registry (openproduct-consumers CS2).
//
// `OPENPRODUCT_PURGE_REGISTRY` (purge.ts) classifies every org-scoped table so
// a workspace purge reaches all of them, and a test with teeth reddens when a
// new one ships unclassified. This is the same thing BY SUBJECT: every column
// in the openproduct schema that can hold a person's subject id, classified,
// so that export (CS3) and deletion (`DELETE /me`) read one list and cannot
// disagree about what is theirs (CS-4).
//
// ─── THE THREE CLASSES ────────────────────────────────────────────────────
//
//   theirs     The row is the subject's own: their presence, their
//              bookmarks, their follows, their votes, their sessions. In an
//              export; DELETED with them.
//
//   anonymise  The row is somebody else's context the subject appears in —
//              the author of a post in a conversation that stands, the
//              moderator who added a maintainer. The row is kept and the
//              subject id is replaced by a tombstone (or nulled where the
//              column allows). Not in an export.
//
//   record     The row is a RECORD — a moderation act, an integrity
//              decision, an appeal, a launch, the provenance of a listing.
//              Kept, the subject id replaced, and the classification says
//              why (CS-5: a record is never exported as somebody else's and
//              never deleted as somebody's own; OS-5: the transparency record
//              is never pruned). Not in an export.
//
// Before this file `deleteContributor` deleted three tables and left about
// thirty columns carrying the subject — WC-K's third consequence, "a class of
// row nothing can delete", observed in the tree rather than decided.
//
// ─── THE TOMBSTONE ────────────────────────────────────────────────────────
//
// `usr_gone`, on every kept row, nullable column or not. A kept row is NEVER
// nulled: a NULL `decided_by` says nobody decided, which is false — somebody
// did, and has left — and the schema agrees, in the coherence CHECKs that
// keep a decided appeal's decider, a retired roster edge's retirer and a
// claimed handle's subject beside their moments. Where the column is part of
// a unique key (`endorsement_integrity`'s primary key is the pair (profile,
// subject); a claimed handle is one-active-per-subject) a fixed value would
// collide the second time a subject left, so the tombstone is derived —
// `usr_gone_` + md5 of the id — a pseudonym, stable per subject, reversible
// by nobody who does not already hold the id, and recognisable by its prefix
// like the fixed one. No CHECK constrains a subject column's format (the test
// asserts that too), and the `usr_` prefix keeps `subjectKindOf` answering
// "user" for the rows that keep one.

export type SubjectClass = "theirs" | "anonymise" | "record";

export interface SubjectColumn {
  /** The table, in the `openproduct` schema. */
  readonly table: string;
  /** The column that holds a subject id. */
  readonly column: string;
  readonly class: SubjectClass;
  /** Whether the schema allows NULL here — asserted against `information_schema`,
   *  and recorded so a reader knows which columns COULD have been nulled and
   *  were deliberately not (see the header). */
  readonly nullable: boolean;
  /** The column is part of a unique key, so the tombstone is derived per subject. */
  readonly keyed?: true;
  /** Derive the tombstone per subject without a key — a claimed handle is
   *  one-active-per-subject by partial index rather than by key. */
  readonly tombstone?: "derived";
  /** This column is a foreign key to another classified column, cascading on
   *  delete and not on update: the two are rewritten in ONE statement (a
   *  data-modifying CTE), so the key check at the statement's end sees both
   *  sides already moved. The parent must be keyed and kept, never deleted —
   *  deleting it would cascade this record away. */
  readonly withParent?: { readonly table: string; readonly column: string };
  /** A polymorphic reference: the column holds a subject id only when the
   *  kind column beside it says so. Rows of other kinds are not touched. */
  readonly when?: { readonly column: string; readonly equals: string };
  /** An extra SET clause applied when the row is kept; `$2` is the moment. */
  readonly alsoSet?: string;
  /**
   * CS3 — whether `GET /me/export` carries the rows this column selects.
   * `rows` for the subject's own rows and their own words and acts (a post
   * they wrote, a vote they cast, the handle they held); `omit` for secrets
   * (a verifier, a session, a one-time token), for an operational queue, and
   * for every column where they are somebody else's context or a record —
   * those rows are not theirs to take (CS-5). Every column says which, so the
   * export and the exit read one list and a new column cannot reach the
   * export by default.
   */
  readonly export: "rows" | "omit";
  readonly reason: string;
}

/** A text column the census matches by name that does NOT hold a subject id, with the reason. */
export interface NotASubjectColumn {
  readonly table: string;
  readonly column: string;
  readonly reason: string;
}

/** The fixed tombstone, for NOT NULL columns outside any unique key. */
export const SUBJECT_TOMBSTONE = "usr_gone";
/** Every tombstone — fixed or derived — starts with this. */
export const SUBJECT_TOMBSTONE_PREFIX = "usr_gone";

export function isSubjectTombstone(value: string | null): boolean {
  return value !== null && value.startsWith(SUBJECT_TOMBSTONE_PREFIX);
}

/** The SQL expression for the value a kept row's column takes, with `$1` the subject id. Never NULL. */
export function tombstoneSql(entry: SubjectColumn): string {
  if (entry.keyed || entry.tombstone === "derived") return `'${SUBJECT_TOMBSTONE}_' || md5($1)`;
  return `'${SUBJECT_TOMBSTONE}'`;
}

/** The SQL predicate that finds the rows `tombstoneSql` produced for `$1` — the test's read of the write. */
export function tombstonePredicateSql(entry: SubjectColumn): string {
  return `${entry.column} = ${tombstoneSql(entry)}`;
}

export function subjectEntryKey(entry: Pick<SubjectColumn, "table" | "column">): string {
  return `${entry.table}.${entry.column}`;
}

/**
 * Which columns the census looks at: text columns named for a subject, for
 * an actor, or ending in `_by`. A column that matches and is neither here
 * nor in `NOT_SUBJECT_COLUMNS` fails the test with its name.
 */
export const SUBJECT_COLUMN_NAME_PATTERN = /(subject|^actor|_by$)/;

export const OPENPRODUCT_SUBJECT_REGISTRY: readonly SubjectColumn[] = [
  // ── theirs: the subject's own rows ──────────────────────────────────────
  { table: "contributors", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "The presence itself: name, bio, whether to be found (CG1)." },
  { table: "applications", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their applications to open roles, the snapshot the console's join door left here (OX5c)." },
  { table: "saved_products", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their bookmarks — a private act, never counted (OH2)." },
  { table: "follows", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "What they follow (FL0). The count a listing shows drops by one, which is the truth." },
  { table: "post_votes", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their upvotes on posts — the same rule as endorsements." },
  { table: "thread_mutes", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their own notification settings, per thread (NF0)." },
  { table: "notification_prefs", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their own notification settings (NF0)." },
  { table: "notification_reads", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their read cursor (NF0)." },
  { table: "notifications", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their inbox (NF0). The `actor` column beside it is a handle, not a subject — see NOT_SUBJECT_COLUMNS." },
  { table: "notification_outbox", column: "subject_id", class: "theirs", export: "omit", nullable: false, reason: "Mail queued for them and not yet sent; nobody else's to keep." },
  { table: "digest_subscriptions", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their digest subscription (LC1)." },
  { table: "auth_sessions", column: "subject_id", class: "theirs", export: "omit", nullable: false, reason: "Their sessions — deleting them signs them out everywhere (AC2b)." },
  { table: "credentials", column: "subject_id", class: "theirs", export: "omit", nullable: false, reason: "Their password verifier (AC1). The platform still owns the subject; this is openproduct's own door, and it closes." },
  { table: "credential_tokens", column: "subject_id", class: "theirs", export: "omit", nullable: true, reason: "Their pending reset and verification tokens (AC1). Nullable because a sign-up token has no subject yet; those rows carry no id to match." },
  { table: "trust_levels", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "The ladder's assessment of them (TS1). Goes with them: CS-5 pseudonymises every record of them, so a returning subject starts where a new one does, and a level kept under a tombstone would apply to nobody." },
  { table: "listing_maintainers", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their membership of a listing's roster. The listing belongs to its workspace and stays (OX5c)." },
  { table: "product_people", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their consented place on a listing's public roster (CG3). Consent leaves with them." },
  { table: "published_maintainers", column: "subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their credit line on a listing's page (CG3 reconciles it with consent; no consent, no line)." },
  { table: "collections", column: "curator_subject_id", class: "theirs", export: "rows", nullable: false, reason: "Their curation (XP3). Its items cascade with it." },

  // ── anonymise: somebody else's context they appear in ──────────────────
  { table: "endorsements", column: "subject_id", class: "anonymise", export: "rows", nullable: false, keyed: true, reason: "A vote, cast. It STANDS with the voter pseudonymised rather than going with them, for the schema's own reason: the integrity decision about it (a record, CS-5) is keyed to it and cascades on delete, so deleting the vote would delete the record. EN3 restates totals and never erases what it restated (`withdrawEndorsement` sets `withdrawn_at`); this is the same rule. Keyed with the listing, so the tombstone is derived." },
  { table: "handles", column: "subject_id", class: "anonymise", export: "rows", nullable: true, tombstone: "derived", alsoSet: "released_at = COALESCE(released_at, $2::timestamptz)", reason: "A handle is a tombstone by design: released, never re-issued, so accumulated trust is not handed to a stranger (CG4). The row stays, released at the moment of the exit, with the subject replaced by a DERIVED tombstone: `handles_claim_coherent` keeps a claimed handle's subject and claim together, and the one-active-per-subject index is partial on unreleased rows." },
  { table: "threads", column: "author_subject_id", class: "anonymise", export: "rows", nullable: false, reason: "A thread they opened holds other people's posts (replies cascade with the thread). The conversation stands; the author reads as nobody." },
  { table: "posts", column: "author_subject_id", class: "anonymise", export: "rows", nullable: false, reason: "Their posts in other people's conversations. The words stay, the name goes — what every forum does, and what CS3 exports before it does." },
  { table: "activity_events", column: "actor_subject_id", class: "anonymise", export: "omit", nullable: true, reason: "Who did a thing to a listing, in the listing's own log. The event is the listing's; the actor is nulled." },
  { table: "listing_maintainers", column: "added_by", class: "anonymise", export: "omit", nullable: false, reason: "Who added a maintainer — another maintainer's edge, carrying the adder." },
  { table: "product_people", column: "invited_by", class: "anonymise", export: "omit", nullable: false, reason: "Who invited a roster member — the edge is theirs, the inviter is context." },
  { table: "product_people", column: "retired_by", class: "anonymise", export: "omit", nullable: true, reason: "Who retired a roster member." },
  { table: "trust_levels", column: "set_by", class: "anonymise", export: "omit", nullable: false, reason: "Who set somebody else's level ('automatic' is not a subject and is untouched)." },

  // ── record: kept, pseudonymised, and the reason says why (CS-5, OS-5) ──
  { table: "profiles", column: "created_by", class: "record", export: "omit", nullable: false, reason: "The listing's provenance: who created it under the workspace's authority. The listing is the workspace's (OX5c); the creator's id becomes the tombstone." },
  { table: "profiles", column: "updated_by", class: "record", export: "omit", nullable: true, reason: "The listing's provenance, last editor." },
  { table: "profiles", column: "reviewed_by", class: "record", export: "omit", nullable: true, reason: "Who reviewed the listing before publication (TS1). The review happened; the reviewer is nulled." },
  { table: "launches", column: "scheduled_by", class: "record", export: "omit", nullable: false, reason: "A launch is the listing's record of a day (LC0). Who scheduled it becomes the tombstone." },
  { table: "launches", column: "cancelled_by", class: "record", export: "omit", nullable: true, reason: "Who cancelled a launch." },
  { table: "audit_log", column: "actor_id", class: "record", export: "omit", nullable: false, reason: "The studio's audit trail is a record of acts under the workspace's authority; the actor becomes the tombstone, the act stays." },
  { table: "moderation_acts", column: "actor_id", class: "record", export: "omit", nullable: false, reason: "Who moderated. The act is the transparency record (TS5) and is never pruned (OS-5); 'automatic' is not a subject and is untouched." },
  { table: "reports", column: "reporter_subject_id", class: "record", export: "omit", nullable: false, reason: "Who reported (TS0). The report is a record the queue and the transparency counts read; the reporter becomes the tombstone." },
  { table: "reports", column: "resolved_by", class: "record", export: "omit", nullable: true, reason: "Who resolved a report." },
  { table: "appeals", column: "appellant_subject_id", class: "record", export: "omit", nullable: false, reason: "Who appealed (TS5). The appeal and its decision are the record; the appellant becomes the tombstone." },
  { table: "appeals", column: "decided_by", class: "record", export: "omit", nullable: true, reason: "Who decided an appeal." },
  { table: "appeals", column: "subject_ref", class: "record", export: "omit", nullable: false, when: { column: "subject_kind", equals: "subject" }, reason: "An appeal about a person — the one polymorphic reference whose CHECK admits a 'subject' kind, under which the ref is a subject id and becomes the tombstone; under every other kind it is a public identifier and is left alone." },
  { table: "flags", column: "resolved_by", class: "record", export: "omit", nullable: true, reason: "Who resolved a flag the defence sweep raised (TS4)." },
  { table: "endorsement_integrity", column: "subject_id", class: "record", export: "omit", nullable: false, keyed: true, withParent: { table: "endorsements", column: "subject_id" }, reason: "The integrity model's decision to discount a vote (EN3) — what /transparency counts by reason, never pruned (OS-5). Keyed with the listing and a foreign key to the vote, so it moves to the same derived tombstone in the vote's own statement." },
  { table: "endorsement_integrity", column: "decided_by", class: "record", export: "omit", nullable: false, reason: "Who decided a discount ('system' is not a subject and is untouched)." },
  { table: "endorsement_integrity", column: "reversed_by", class: "record", export: "omit", nullable: true, reason: "Who reversed a discount." },
  { table: "digest_notes", column: "author_subject_id", class: "record", export: "omit", nullable: false, reason: "The week's editorial note (LC1) is published prose; the author becomes the tombstone." },
];

/** Census matches that hold no subject id, each with its reason. */
export const NOT_SUBJECT_COLUMNS: readonly NotASubjectColumn[] = [
  { table: "moderation_acts", column: "subject_kind", reason: "The KIND of the thing an act is about, beside `subject_ref`." },
  { table: "moderation_acts", column: "subject_ref", reason: "The PUBLIC identifier of what an act is about — a slug, a handle, a thread id (1330: 'opaque, no FK'). The CHECK on `subject_kind` allows no 'subject' kind here, so this column never holds a subject id; an act about a PERSON names their handle, and the handle stops resolving to anybody when the registry releases it." },
  { table: "reports", column: "subject_kind", reason: "The KIND of the thing reported, beside `subject_ref`." },
  { table: "reports", column: "subject_ref", reason: "The PUBLIC identifier of what was reported (TS0: 'a slug, a handle, a thread id — opaque, no FK'). The CHECK on `subject_kind` allows listing, profile, thread, post and collection — never 'subject' — so this column never holds a subject id. A report about a PERSON names their handle, which stops resolving when the registry releases it." },
  { table: "appeals", column: "subject_kind", reason: "The KIND of the thing appealed, beside `subject_ref` — classified for the 'subject' kind." },
  { table: "flags", column: "subject_kind", reason: "The KIND of the thing flagged, beside `subject_ref`." },
  { table: "flags", column: "subject_ref", reason: "The PUBLIC identifier of what the defence sweep flagged (TS4). The CHECK on `subject_kind` allows listing, profile, thread, post, collection and launch — never 'subject' — so this column never holds a subject id." },
  { table: "notifications", column: "actor", reason: "A HANDLE, not a subject id (NF0: 'an internal identifier in a row a page reads is an internal identifier one bad projection away from a browser'). The handle row is released by the registry's `handles` entry, so the address stops resolving to anybody." },
  { table: "audit_log", column: "actor_type", reason: "The KIND of actor ('user' or 'service_principal'), beside `actor_id`, which is classified." },
];

export function subjectColumnsOf(cls: SubjectClass): readonly SubjectColumn[] {
  return OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.class === cls);
}

/** The columns an export walks (CS3): every entry that says `rows`, in registry order. */
export function exportColumns(): readonly SubjectColumn[] {
  return OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.export === "rows");
}

/** The tables an export walks, once each. */
export function exportTables(): readonly string[] {
  return [...new Set(exportColumns().map((e) => e.table))];
}

/**
 * CS3 — the columns an exported row is stripped of: every OTHER classified
 * column on the same table. They hold somebody else's subject id (who added
 * the maintainer, who invited the roster member) and the export is the
 * subject's own, not a directory of everyone they met.
 */
export function redactedColumnsOf(entry: SubjectColumn): readonly string[] {
  return OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.table === entry.table && e.column !== entry.column).map((e) => e.column);
}

/**
 * Given the live census (every text column matching the name pattern), the
 * `table.column` keys that are neither classified nor excused. The test
 * reddens on a non-empty answer, naming them.
 */
export function unclassifiedSubjectColumns(
  census: ReadonlyArray<Pick<SubjectColumn, "table" | "column">>,
): string[] {
  const known = new Set([
    ...OPENPRODUCT_SUBJECT_REGISTRY.map(subjectEntryKey),
    ...NOT_SUBJECT_COLUMNS.map(subjectEntryKey),
  ]);
  return census.map(subjectEntryKey).filter((key) => !known.has(key)).sort();
}
