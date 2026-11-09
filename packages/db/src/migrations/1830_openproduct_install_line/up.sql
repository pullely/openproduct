-- 1830_openproduct_install_line (openproduct-worldclass PV2)
--
-- ONE COPYABLE COMMAND, AND IT IS AUTHORED.
--
-- Context: openproduct
--
-- `npx create-kettle`. `docker run ghcr.io/acme/kettle`. `uvx kettle`. The
-- audit's own list, and the first thing a reader of a developer tool wants
-- after the tagline.
--
-- ─── WHY THIS COLUMN IS NOT `repo_install_line` ──────────────────────────
--
-- Every other fact this schema has added since 1780 is OBSERVED — repo name,
-- description, topics, language, last push, open issues — read by the gateway
-- and written down. This one is the maintainer's own words, and it must stay
-- that way.
--
-- The estate could infer it: read `package.json` from a linked repository,
-- find a `bin` entry, emit `npx <name>`. It would be right most of the time.
-- THE ASYMMETRY IS WHY NOT. A wrong observed licence is a wrong label beside
-- a value, and a wrong derived SHELL COMMAND is something a person pastes
-- into a terminal because this page presented it. Those two failures are not
-- comparable, and "right most of the time" is not a sentence to attach to a
-- command somebody is about to run.
--
-- So it sits with `tagline` and `pitch_body` rather than with the `repo_*`
-- family, and the page says a maintainer wrote it.
--
-- ─── ONE COMMAND, ENFORCED HERE AS WELL AS IN THE CONTRACT ───────────────
--
-- `install.ts` refuses pipes, chaining, substitution, redirection, newlines
-- and invisible characters, and gives a maintainer one reason at a time. The
-- CHECK below refuses the same shapes at the column, for the reason DQ1's
-- trigger comment gives: a future write path that forgets is still a write
-- path — and this is a string this product hands somebody to run.
--
-- THE PIPE IS THE ONE WORTH NAMING. A piped installer is a real and common
-- way to ship software and it is refused deliberately rather than sanitised:
-- this estate does not ask a reader to trust what they cannot check, and a
-- piped installer is exactly the command whose contents they cannot see
-- before it runs. A maintainer may still distribute that way, on their own
-- site, under their own name. What this page will not do is hand it over as
-- though somebody had checked it.
--
-- THE INVISIBLE CHARACTERS ARE THE HALF A REVIEWER CANNOT CATCH. A zero-width
-- space between `npm` and `i` reads as an ordinary command in the studio, in
-- the box and in review, and copies into a terminal as something else. A
-- bidirectional override can make a line read backwards from what it runs.
-- Written as `\u` escapes in an E-string rather than as literal characters,
-- so this constraint is reviewable in a diff.
--
-- NOT NULLABLE-BLANK: absent is NULL. An empty string would be a maintainer
-- who answered with nothing, which is a different sentence from not answering
-- and would render an empty box.
--
-- Additive, idempotent.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS install_line TEXT;

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_install_line_check;
ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_install_line_check
    CHECK (
      install_line IS NULL
      OR (
        -- Present means non-blank and bounded. `install.ts` holds the same
        -- 160, and a contract test keeps the two in step.
        length(btrim(install_line)) > 0
        AND length(install_line) <= 160
        -- One command: no pipe, semicolon, ampersand, backtick or
        -- redirection, and no command substitution.
        AND install_line !~ '[|;&`<>]'
        AND install_line !~ E'\\$\\('
        -- No control characters (this covers the newline that would make it a
        -- script), and none of the invisible ranges that make a line read as
        -- one thing and copy as another.
        AND install_line !~ '[[:cntrl:]]'
        AND install_line !~ E'[\\u00a0\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]'
      )
    );

COMMENT ON COLUMN openproduct.profiles.install_line IS
  'PV2 (openproduct-worldclass) — one copyable install command, AUTHORED by '
  'the maintainer and never derived. The estate could infer it from a '
  'repository and would be right most of the time; a wrong observed licence '
  'is a wrong label, and a wrong derived shell command is something a person '
  'pastes into a terminal because this page presented it. The CHECK refuses '
  'pipes, chaining, substitution, redirection, control characters and the '
  'invisible ranges at the column as well as in install.ts, for DQ1''s '
  'reason: a future write path that forgets is still a write path. The piped '
  'installer is refused deliberately rather than sanitised — this estate does '
  'not ask a reader to trust what they cannot check.';
