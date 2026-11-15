# openproduct-demos

| | |
|---|---|
| Epic | `openproduct-demos` (EP-3) |
| Status | Not started. Waits on the question below |
| Came from | `openproduct-redesign`, where it was milestone OPR4 (task OPR-5). Moved here on 2026-11-15 when that epic closed at OPR3 |
| Boards | `../openproduct-redesign/boards/DemoFlow.dc.html`, `PhoneDemo.dc.html` |

A product's crew records a demo of the running product, reviews it and
posts it as a Demo post. Nothing is public before one of them presses
Post.

## The question this waits on

**How does Orunbase record a demo?** The design below assumes the
platform's agent writes and runs a Playwright script against a product's
stage and hands back a recording over the seam. On 2026-11-15 the
platform had no such capability. Until the owner says how a recording is
produced and delivered, this epic has no design to finish and no task.

## What is already in place

The Demo post kind exists (`openproduct-redesign` OPR2): its template,
its card and its place in the feed. What is missing is everything that
makes a recording.

## The design carried over


A demo is a recorded run of the real product: Orunbase's agent writes a
Playwright script from the product's shipped milestones, runs it against
the product's stage with seed data, and records it. Only a run in which
every step passed is kept. The maker reviews it and presses Post; nothing
is published automatically. Typed secrets are masked in the recording.

- `product_demos`: `profile_id`, `title`, `steps` (JSON: label, passed,
  timestamp), `recording_media_id`, `run_ref` (the Orunbase run),
  `environment` (`stage` or `production`), `state` (`recording`, `failed`,
  `ready`, `posted`, `discarded`).
- The recording arrives over the platform seam (`/seam/v1/*`), signed, the
  way join requests arrive today; it is stored in R2 beside product media.

How the recording is produced on the platform side is the open question
this epic waits on.

## Done when

- a crew member starts a recording for a product from its page, and a run in which a step fails keeps nothing
- a finished recording is visible only to the crew until one of them presses Post
- the posted demo plays in the feed with its steps, and names the environment it ran against
