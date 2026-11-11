"use client";

import * as React from "react";

import { OPEN_BUILD_REPO_CARRIED } from "@openproduct/contracts";

import { clearRepoStash, readRepoStash } from "../../../../submit/handoff";

import { FIELD } from "../../../../ui/design";

/**
 * The Details step's repository field, which can offer the repo typed on
 * Open a build (openproduct-open-builds OB6).
 *
 * THE ONE CLIENT PART OF THIS STEP, and it holds one fact: what is in this
 * tab's session storage. The repo did not cross to the console with the
 * draft (S10 carries name, tagline and pitch), so it waited here; this field
 * offers it — prefilled, with a note — only while the listing has no saved
 * repository. NOTHING IS SAVED until the maker presses the step's save: the
 * field is the same form input it always was, so the save path, its
 * validation and its audit are unchanged.
 *
 * Once a repository is saved, the stash is spent and is cleared, so a second
 * listing opened in the same tab is not offered the first one's repo.
 */
export function RepoUrlField({ saved }: { saved: string | null }) {
  const [value, setValue] = React.useState(saved ?? "");
  const [carried, setCarried] = React.useState(false);

  React.useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      return;
    }
    if (saved) {
      clearRepoStash(storage);
      return;
    }
    const stashed = readRepoStash(storage);
    if (stashed) {
      setValue(stashed);
      setCarried(true);
    }
  }, [saved]);

  return (
    <>
      <input
        id="repoUrl"
        name="repoUrl"
        type="url"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setCarried(false);
        }}
        placeholder="https://github.com/…"
        aria-describedby={carried ? "repoUrl-carried" : undefined}
        className={FIELD}
      />
      {carried ? (
        <span id="repoUrl-carried" className="mt-1.5 block text-[12.5px] text-muted-foreground" role="status">
          {OPEN_BUILD_REPO_CARRIED}
        </span>
      ) : null}
    </>
  );
}
