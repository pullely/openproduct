// The public plane's data access (saas-openproduct OD0) — barrel.
//
// Imported only by apps/openproduct-worker and tests/openproduct-worker. The
// OD1 import-boundary guard (teardown.md §4) fails CI if anything else reaches
// for these symbols, which is what keeps teardown row 9 a pure delete.

export { SNAPSHOT_BASELINE_LOOKBACK_DAYS, createOpenproductRepository } from "./repository.js";
export {
  NOT_SUBJECT_COLUMNS,
  OPENPRODUCT_SUBJECT_REGISTRY,
  SUBJECT_COLUMN_NAME_PATTERN,
  SUBJECT_TOMBSTONE,
  SUBJECT_TOMBSTONE_PREFIX,
  exportColumns,
  exportTables,
  isSubjectTombstone,
  redactedColumnsOf,
  subjectColumnsOf,
  subjectEntryKey,
  tombstonePredicateSql,
  tombstoneSql,
  unclassifiedSubjectColumns,
} from "./subject-registry.js";
export type { NotASubjectColumn, SubjectClass, SubjectColumn } from "./subject-registry.js";
export type {
  // openproduct-commons TS0 + SN1
  ActivityEventRecord,
  // openproduct-consumers CS2 — the subject's exit, CS3 — their export
  SubjectErasure,
  SubjectExport,
  // openproduct-scale OS5 — the materialised catalogue
  CataloguePage,
  CataloguePageInput,
  CatalogueRebuildInput,
  CatalogueRebuildReport,
  PublishedWindows,
  AppendActivityInput,
  AppendModerationActInput,
  CreateReportInput,
  DueSourceRecord,
  EndorsementRecord,
  MetricRecord,
  ModerationActRecord,
  QueuedReportRecord,
  // openproduct-commons TS5 — the appeal, and the ledger read behind it
  AppealRecord,
  CreateAppealInput,
  ResolveAppealInput,
  // openproduct-commons TS4 — the flag queue and what the defence sweep reads
  FlagRecord,
  RaiseFlagInput,
  PitchRecord,
  CohortObservationRecord,
  LaunchEndorsementRecord,
  // openproduct-commons LC3 — the launch board
  BoardLaunchRecord,
  BoardRankRecord,
  FeedLaunchRecord,
  WriteBoardRanksInput,
  // openproduct-commons CG3 — one confirmed, published roster member
  RosterMemberRecord,
  // openproduct-launch FL0 — what a follow points at
  FollowKindName,
  // openproduct-launch FL1 — one open role, across listings
  OpenRoleRecord,
  // openproduct-launch MP0 — what a maker's three tabs read
  MakerActivityCounts,
  MakerCommentRecord,
  MakerLaunchRecord,
  MakerUpvoteRecord,
  // openproduct-commons CB4/LC5 — the outbox and the digest
  QueueNotificationInput,
  ReportRecord,
  SignalSourceName,
  MediaKindName,
  ProductMediaRecord,
  SignalSourceRecord,
  PostRecord,
  ThreadRecord,
  CreatePostInput,
  CreateThreadInput,
  ModerationStateName,
  SetModerationStateInput,
  TrustLevelName,
  TrustLevelRecord,
  WriteMetricInput,
  AppendAuditInput,
  ApplicationRecord,
  AuditEntryRecord,
  ListingMaintainerRecord,
  ListingRole,
  ApplicationStatus,
  ContributorRecord,
  PublicContributorRecord,
  CreateProfileInput,
  MaintainerInput,
  OpenproductRepository,
  ProfileCardRecord,
  ProfileComponent,
  ProfileRecord,
  ProfileVisibility,
  LaunchEligibility,
  LaunchRecord,
  PublicMaintainerRecord,
  PublishedMaintainerRecord,
  RecordApplicationInput,
  ScheduleLaunchInput,
  RepoObservation,
  RepoVisibility,
  RoleOpeningRecord,
  RoleOpeningStatus,
  StoredLinkGrant,
  UpdateProfileInput,
  UpsertContributorInput,
  UpsertRoleOpeningInput,
} from "./types.js";
