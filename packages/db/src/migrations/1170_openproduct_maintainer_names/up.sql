-- 1170_openproduct_maintainer_names (saas-openproduct OD3)
--
-- Context: openproduct
--
-- WHY THIS COLUMN EXISTS, AND WHY IT IS NOT WHAT THE DESIGN FIRST SAID.
--
-- design.md §2.3 called for display names "resolved at read time through PP's
-- directory read". OD3 discovered that cannot be built without breaking the
-- epic's central property. Names live in `identity.users`; membership does not
-- hold them (JR3's precedent — membership never reads identity.users), and PP
-- composes the two IN api-edge, authorized by the caller's own
-- `organization.member.list`.
--
-- The public read has no caller and no authority, and `openproduct-worker`
-- holds no IDENTITY_WORKER binding — by design, so that it "must not be able
-- to resolve a token or read a user" (design.md §3). Giving it a
-- subject-id → name endpoint would hand the public plane exactly the kind of
-- question this epic exists to make unreachable: a way to deanonymize an
-- arbitrary subject id.
--
-- So the name is MAINTAINER-AUTHORED, and stored here beside `role_label`,
-- which already is. Both are the same class of thing: what a maintainer wrote
-- about their own team, visibly in their voice — not a platform assertion
-- about who someone is. A maintainer could already write a colleague's name
-- into the pitch body; this changes nothing about what is possible and
-- removes a capability from the isolate that serves the public.
--
-- `subject_id` remains the key and remains required: it is what OD4's apply
-- door and any future re-resolution bind to. Still no email, ever.
--
-- Additive and idempotent.

ALTER TABLE openproduct.published_maintainers
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN openproduct.published_maintainers.display_name IS
  'Maintainer-authored display name (saas-openproduct OD3) — the same trust class as '
  'role_label, NOT a platform identity claim. Read-time resolution was rejected: it would '
  'require a subject-id-to-name capability in the isolate that serves the public plane.';
