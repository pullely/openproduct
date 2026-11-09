// IN1 — the studio's steps, walked in a real browser (openproduct-worldclass).
//
// THE FIRST LANE THAT SIGNS IN. Every other walk here is anonymous, and the
// epic has carried "the studio's authenticated routes are still not walked"
// as a known gap since FR3. IN1 is the milestone that made that gap expensive:
// its whole claim is about what a SAVE does — which step it returns to, and
// which fields it leaves alone — and neither is visible from outside a
// session.
//
// THE SESSION IS A COOKIE THIS FILE WRITES, and that is sound rather than a
// shortcut: `op_session` is unsigned base64url JSON by design, because the
// cookie is not the authority — the gateway is, and `cookie-is-not-authority`
// pins that. Minting one here grants nothing the fixture would not have
// answered anyway.

import { chromium } from "playwright";

import { STUDIO_ORG, STUDIO_PROFILE, pngBytes, sessionCookie } from "./fixture.mjs";

// EVERY STEP IS `force-dynamic`, so a 303 lands on `loading.tsx` and the
// server component streams in behind it. `waitForURL` resolves at the
// navigation, which is the skeleton — reading there gets "Loading your
// studio" and calls a working save a failure. The strip is the first thing
// the real page paints, so it is what a walk waits for.
const settled = async (page) => {
  try {
    await page.waitForSelector('nav[aria-label="Listing steps"]', { timeout: 15000 });
  } catch {
    const seen = await page.evaluate(() => ({
      url: location.href,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      text: (document.querySelector("main")?.textContent ?? document.body.textContent ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 300),
    }));
    console.log("[studio] the page never settled:", JSON.stringify(seen));
  }
};

/**
 * AN ACT, HOWEVER IT TRAVELS (openproduct-performance OPP15).
 *
 * A studio act used to be a form post and a `303`, so a walk waited for the
 * address to change. It no longer does: the same form posts in the background
 * and the surface says what happened where it stands. So this waits for the
 * ACT — the POST to the surface's own `…/actions` route, which is the one
 * thing both transports have — and then for the background re-render that
 * catches the derived half of the page up, because the checks below read
 * server-rendered content (the import panel's `yours`, a new media row).
 *
 * With JavaScript off the POST is the document request itself and there is no
 * re-render to wait for, which is why that wait is best-effort.
 */
const acted = async (page, click) => {
  const posted = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/actions"),
    { timeout: 20000 },
  );
  // THE REFRESH, NOT A PREFETCH. The strip's links re-arm themselves after a
  // re-render and their payloads carry `RSC: 1` too; waiting for the first
  // one of those resolves before the act's own re-render has been asked for,
  // and every read after it is a read of the page as it was. The refresh is
  // the one for the address we are standing on, without the prefetch header.
  const here = new URL(page.url()).pathname;
  const refreshed = page
    .waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.request().headers()["rsc"] === "1" &&
        !r.request().headers()["next-router-prefetch"] &&
        new URL(r.url()).pathname === here,
      { timeout: 8000 },
    )
    .catch(() => null);
  await click();
  await posted;
  await refreshed;
  await quiet(page);
  await settled(page);
};

/**
 * WAIT FOR THE DOCUMENT, NOT FOR THE NETWORK.
 *
 * The re-render's RESPONSE is not the re-render: React commits it a beat
 * later, and on a loaded runner a read taken in between sees the page as it
 * was before the act. Two lanes lost that race before this existed — an
 * upload whose row had not been drawn yet, and an import panel whose badge
 * had not flipped — and both looked exactly like the feature being broken.
 *
 * So this waits until the document has stopped changing for a quarter of a
 * second, capped so a page that never settles fails its own check rather
 * than hanging the walk.
 */
const quiet = (page, still = 250, cap = 8000) =>
  page.evaluate(
    ([stillMs, capMs]) =>
      new Promise((resolve) => {
        let timer = setTimeout(finish, stillMs);
        const capTimer = setTimeout(finish, capMs);
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(finish, stillMs);
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        function finish() {
          clearTimeout(timer);
          clearTimeout(capTimer);
          observer.disconnect();
          resolve(null);
        }
      }),
    [still, cap],
  );

// THE STRIP'S STEPS, as `STRIP_STEPS` in @openproduct/contracts draws them.
// OB6 (#1873) took Launches out of the strip — its page stays, below — and
// renamed People to "People and roles", and this list said otherwise until a
// full verify ran the lane (sourceplane/orun-cloud#1882).
const STEPS = [
  { id: "details", segment: "details", label: "Details" },
  // MD2 — the step that used to be a span with a title.
  { id: "media", segment: "media", label: "Media" },
  { id: "topics", segment: "topics", label: "Topics and stack" },
  { id: "people", segment: "people", label: "People and roles" },
];

/**
 * BOTH HOSTS, and the reason is worth writing down so nobody "fixes" it.
 *
 * The lane serves on `127.0.0.1`, but `next start` normalises the Host it
 * sees, so the 303 the actions route builds from `request.url` comes back
 * pointing at `localhost`. The browser follows it to a DIFFERENT COOKIE
 * ORIGIN, arrives without a session, and lands on `/signin` — which reads
 * exactly like a broken save and is nothing of the kind. In production the
 * two are one host and this never arises.
 */

export async function runStudio(base) {
  const failures = [];
  const check = (name, ok, detail) => {
    console.log(`[studio] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures.push(name);
  };

  const listing = `${base}/studio/${STUDIO_ORG}/${STUDIO_PROFILE}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(sessionCookie(base));
    const page = await context.newPage();
    // NO BROWSER HTTP CACHE IN THIS WALK (openproduct-performance OPP13).
    //
    // Every `goto` here waits for `networkidle`, and OPP13 gave Chromium a way
    // to make that unreachable. The shell now prefetches its five sections on
    // every page load, and the payloads come back `s-maxage=60,
    // stale-while-revalidate=240` — no `max-age`, so to the BROWSER they are
    // stale the moment they land, and the next page load in the same context
    // that prefetches the same URLs (a save's 303 lands on the page it left)
    // is served from that stale copy while Chromium revalidates in the
    // background. Those revalidations are reported to Playwright as started
    // and never as finished, so `networkidle` waits on them forever and the
    // walk dies at the first `goto` after a save, 30 s later.
    //
    // Measured, not inferred: with the cache on, five `type=other` requests
    // for the section payloads stayed open indefinitely after the save; with
    // it off, the same page reached idle in 845 ms and the walk completed.
    //
    // This lane verifies what a SAVE does; it measures nothing about caching
    // (the budget lane does, in one fresh context per route, which is why it
    // never meets this). So the cache is off here and nowhere else. Real
    // visitors are unaffected: their background revalidations complete, and
    // Playwright's accounting is not the browser's.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    // ── the overview ──
    const overview = await page.goto(listing, { waitUntil: "networkidle" });
    check("the overview loads for a signed-in maintainer", overview?.status() === 200, `status ${overview?.status()}`);
    // d8b10168 cut the sentence ("Draft — nobody can reach this page but
    // you") to the design's status pill; what says nobody else can reach it
    // now is what the head OFFERS: a Publish act, and no way to the public
    // page, because a draft does not have one.
    const head = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        draft: [...(main?.querySelectorAll("span") ?? [])].some((el) => el.textContent?.trim() === "Draft"),
        publish: main?.querySelector('form input[name="intent"][value="publish"]') !== null,
        publicPage: [...(main?.querySelectorAll("a") ?? [])].some((a) => a.textContent?.trim() === "View public page"),
      };
    });
    check(
      "it says the listing is a draft, and that nobody else can reach it",
      head.draft && head.publish && !head.publicPage,
      JSON.stringify(head),
    );

    // ── the strip ──
    const stripLinks = await page
      .locator('nav[aria-label="Listing steps"] a')
      .evaluateAll((els) => els.map((e) => ({ text: e.textContent?.trim(), href: e.getAttribute("href") })));
    // OVERVIEW, THE STEPS, THEN DISCUSSIONS. 3d54dc12 put CB1's surface at
    // the end of the strip where the design draws it — a section of the
    // editor, not a step of the listing (`listing-shell.tsx` says so) — and
    // OSD5 (#1649) made the editor's own front page a tab of its own, first
    // (`step-strip.tsx`). So the strip holds the steps between those two, in
    // order.
    const stripText = stripLinks.map((l) => l.text);
    check(
      "the strip links every step — the media step has a page since MD2 — between Overview and Discussions",
      stripLinks.length === STEPS.length + 2 &&
        stripText[0] === "Overview" &&
        STEPS.every((step, i) => stripText[i + 1] === step.label) &&
        stripText[STEPS.length + 1] === "Discussions" &&
        /\/discussions$/.test(stripLinks[STEPS.length + 1]?.href ?? ""),
      JSON.stringify(stripText),
    );
    // MD2 — THE SPAN IS GONE. This lane used to assert the media step rendered
    // as a titled span naming a build rather than a decision (and found, late,
    // that the sentence had gone stale once). The step is a link now; the
    // assertion moved to the page it links, below, where an upload actually
    // round-trips through the actions route to the gateway and back.
    const mediaSpan = await page.locator('nav[aria-label="Listing steps"] span[title]').count();
    check("no step is an unbuilt span any more", mediaSpan === 0, `${mediaSpan} span(s) with a title`);

    // ── each step is an address ──
    for (const step of STEPS) {
      const res = await page.goto(`${listing}/${step.segment}`, { waitUntil: "networkidle" });
      const current = await page
        .locator('nav[aria-label="Listing steps"] [aria-current="page"]')
        .textContent();
      check(
        `/${step.segment} is its own address and knows which step it is`,
        res?.status() === 200 && current?.trim() === step.label,
        `status ${res?.status()} current ${JSON.stringify(current?.trim())}`,
      );
    }
    // OB6 — LAUNCHES LEFT THE STRIP AND KEPT ITS PAGE. Still an address, with
    // the strip drawn above it and no step claiming to be current.
    {
      const res = await page.goto(`${listing}/launches`, { waitUntil: "networkidle" });
      await settled(page);
      const current = await page.locator('nav[aria-label="Listing steps"] [aria-current="page"]').count();
      check(
        "/launches keeps its page, outside the strip (OB6)",
        res?.status() === 200 && current === 0,
        `status ${res?.status()} ${current} step(s) marked current`,
      );
    }

    // ── MD2 → OSD6 — the media step, round-tripped, without a reload ──
    //
    // The first lane here that posts a FILE. Since openproduct-studio OSD6 a
    // scripted browser meets the upload island, not the form: the file is
    // chosen, previewed, described and uploaded in the background to the same
    // actions route, and the saved row is listed from the route's answer. The
    // walk asserts the ADDRESS NEVER CHANGES — no reload is the point — then
    // edits the words in place and removes the row, so a walk leaves the
    // fixture as it found it.
    {
      await page.goto(`${listing}/media`, { waitUntil: "networkidle" });
      await settled(page);
      const zone = page.locator('#media button:has-text("Drop images here")');
      await zone.waitFor({ timeout: 15000 });
      const address = page.url();
      check("the media step renders the upload island once it hydrates", (await zone.count()) === 1);
      check(
        "and says the listing has no images yet",
        /no images yet/i.test((await page.locator("#media").textContent()) ?? ""),
      );
      await page.locator('#media input[type="file"][multiple]').setInputFiles({
        name: "hero.png",
        mimeType: "image/png",
        buffer: pngBytes(1200, 630),
      });
      const alt = page.locator('input[aria-label="What hero.png shows"]');
      await alt.waitFor({ timeout: 10000 });
      check(
        "the chosen file is previewed and offered as the hero",
        (await page.locator('select[aria-label="Where hero.png goes"]').inputValue()) === "hero",
      );
      await alt.fill("The dashboard");
      await page.locator('#media button:has-text("Upload image")').click();
      await page.waitForSelector('ul[aria-label="Your images"] li', { timeout: 20000 });
      check(
        "the upload is listed from the route's answer, and the page did not reload",
        page.url() === address &&
          (await page.locator('ul[aria-label="Your images"] li').count()) === 1 &&
          /Hero · The dashboard/.test((await page.locator("#media").textContent()) ?? ""),
        `${page.url()} — ${await page.locator('ul[aria-label="Your images"] li').count()} row(s)`,
      );
      check(
        "the listed row shows the image with its alt text and its dimensions",
        (await page.locator('ul[aria-label="Your images"] img[alt="The dashboard"][width="1200"][height="630"]').count()) === 1,
      );
      await page.locator('button[aria-label="Edit what the hero shows"]').click();
      await page.locator('input[aria-label="What the hero shows"]').fill("The dashboard, at a glance");
      await page.locator('ul[aria-label="Your images"] button[type="submit"]:has-text("Save")').click();
      await page.waitForSelector('text=Hero · The dashboard, at a glance', { timeout: 15000 });
      check("the words under a picture change in place", page.url() === address);
      await page.locator('button[aria-label="Remove the hero"]').click();
      await page.waitForSelector('#media >> text=No images yet', { timeout: 15000 });
      check(
        "removing it empties the list, still without a reload",
        page.url() === address && (await page.locator('ul[aria-label="Your images"] li').count()) === 0,
        page.url(),
      );
    }

    // ── THE ONE THAT MATTERS: a save touches its own fields only ──
    // ── IN2: import, and watch the class flip ──
    await page.goto(`${listing}/details`, { waitUntil: "networkidle" });
    const beforeCheck = (await page.locator("main").textContent()) ?? "";
    check(
      "before any check, the panel says so rather than showing an empty table",
      beforeCheck.includes("Not checked yet"),
    );
    check("and the tagline field is empty", (await page.locator("#tagline").inputValue()) === "");

    // OPP15 — the ONE act that still lands a whole document, because its
    // point is to put the repository's words into the fields (see
    // `studio/live-save.tsx`). So this waits for the navigation, as it always
    // did, rather than for a re-render.
    await Promise.all([
      page.waitForURL(/\/details\?notice=checked/, { timeout: 20000 }),
      page.locator('button[type="submit"]:has-text("Check repository")').click(),
    ]);
    await settled(page);

    // The strip is in the frame ABOVE `<main>`, so it can paint while the
    // step's own children are still streaming — `settled` is not enough for
    // something this far down the page. Wait for the panel itself.
    await page.waitForSelector("text=From the repository", { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("section ul > li")]
        .map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim())
        // No `\b` after the label: the badge follows it with no space, so
        // "Nameyourskettleworks" is what the row's text content actually is.
        .filter((t) => /^(Name|Description|Licence|Stack)/.test(t));
      return rows;
    });
    check("the import fills four fields", panel.length === 4, JSON.stringify(panel));
    check(
      "each says where its value came from",
      // `every` over an empty array is `true`, which is how the first draft
      // of this check passed while reading nothing at all.
      //
      // "observed only" IS a provenance: 3d54dc12 put it IN the badge, in
      // place of "from the repository", for the one field no maintainer can
      // type (the licence) — the badge used to say "from the repository" with
      // "— observed only" after it.
      panel.length === 4 && panel.every((r) => /from the repository|yours|observed only/.test(r)),
      JSON.stringify(panel),
    );
    check(
      "the name is YOURS — a listing cannot exist without an address",
      panel.some((r) => r.startsWith("Name") && r.includes("yours")),
      panel.find((r) => r.startsWith("Name")),
    );
    check(
      "the description is FROM THE REPOSITORY, because nothing was written",
      panel.some((r) => r.startsWith("Description") && r.includes("from the repository")),
      panel.find((r) => r.startsWith("Description")),
    );
    check(
      "the licence is observed and has no field to type into",
      panel.some((r) => r.startsWith("Licence") && r.includes("observed only")),
      panel.find((r) => r.startsWith("Licence")),
    );
    check(
      "the observation reached the field it had a gap in",
      (await page.locator("#tagline").inputValue()) === "Boils water, carefully",
      await page.locator("#tagline").inputValue(),
    );

    // THE FLIP. Editing is the one way a value becomes authored.
    await page.fill("#tagline", "Boils water, deliberately");
    await acted(page, () =>
      page.locator('button[type="submit"]:has-text("Save listing")').click(),
    );
    // OPP15 — THE PANEL IS A FACT ABOUT THE LISTING, READ ON A FRESH RENDER.
    //
    // A save posts in the background now and asks for a re-render behind it,
    // and that re-render is best effort by design (see `live-save.tsx`: it is
    // dropped about one time in four, which is why only forms whose page
    // cannot be WRONG post this way). What this check is about is whether the
    // save STORED the value, so it reads the panel on a render that is not
    // racing anything.
    await page.reload({ waitUntil: "networkidle" });
    await settled(page);
    const afterEdit = await page.evaluate(() =>
      [...document.querySelectorAll("section ul > li")]
        .map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim())
        .find((t) => t.startsWith("Description")),
    );
    check(
      "EDITING FLIPPED THE DESCRIPTION TO `yours`",
      (afterEdit ?? "").includes("yours"),
      afterEdit,
    );
    check(
      "and the repository's own words are still shown, so it can be undone",
      (afterEdit ?? "").includes("The repository says Boils water, carefully"),
      afterEdit,
    );

    await page.goto(`${listing}/topics`, { waitUntil: "networkidle" });
    const stackBefore = await page.locator("#stack").inputValue();
    // The field's own hint carries the provenance label; the sentence around
    // it ("This list is from the repository.") was cut to the label by
    // d8b10168's "stop explaining" pass, so this reads the hint under the field rather than
    // searching the page for the old sentence.
    const stackHint = ((await page.locator("#stack ~ p").first().textContent()) ?? "").replace(/\s+/g, " ").trim();
    check(
      "the stack took the repository's topics, and says so",
      stackBefore === "rust, wasm" && stackHint.includes("from the repository"),
      `${stackBefore} — ${JSON.stringify(stackHint)}`,
    );

    await page.goto(`${listing}/details`, { waitUntil: "networkidle" });
    await page.fill("#tagline", "Boils water, deliberately");
    await acted(page, () =>
      page.locator('button[type="submit"]:has-text("Save listing")').click(),
    );
    check(
      "saving Details leaves the maintainer on Details, not on the overview",
      new URL(page.url()).pathname.endsWith("/details"),
      new URL(page.url()).pathname,
    );
    // OPP15 — and it does that by not navigating at all. The address is the
    // step's own, with no `?notice=` on it: the banner is live now.
    check(
      "a save does not reload the step, and leaves no notice in the address",
      !page.url().includes("notice="),
      page.url(),
    );
    const afterSave = (await page.locator("main").textContent())?.replace(/\s+/g, " ") ?? "";
    check("and says it saved", afterSave.includes("Saved."), afterSave.slice(0, 90));
    check(
      "the edit took",
      (await page.locator("#tagline").inputValue()) === "Boils water, deliberately",
    );

    await page.goto(`${listing}/topics`, { waitUntil: "networkidle" });
    const stackAfter = await page.locator("#stack").inputValue();
    check(
      "THE STACK SURVIVED a save made on another step",
      stackAfter === stackBefore,
      `before ${JSON.stringify(stackBefore)} after ${JSON.stringify(stackAfter)}`,
    );

    // ── and the reverse: topics does not clear the tagline ──
    await page.fill("#stack", "typescript, cloudflare, postgres");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/actions")),
      page.locator('button[type="submit"]:has-text("Save topics and stack")').click(),
    ]);
    await settled(page);
    check(
      "saving Topics comes back to Topics",
      new URL(page.url()).pathname.endsWith("/topics"),
      new URL(page.url()).pathname,
    );
    await page.goto(`${listing}/details`, { waitUntil: "networkidle" });
    check(
      "THE TAGLINE SURVIVED the topics save",
      (await page.locator("#tagline").inputValue()) === "Boils water, deliberately",
    );

    // ── the people step returns to itself too ──
    await page.goto(`${listing}/people`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/actions")),
      page.locator('button[type="submit"]:has-text("Save maintainers")').click(),
    ]);
    await settled(page);
    check(
      "saving People comes back to People",
      new URL(page.url()).pathname.endsWith("/people"),
      new URL(page.url()).pathname,
    );

    // ── no bundle, and no draft in the browser ──
    const storage = await page.evaluate(() => {
      try {
        return { local: localStorage.length, session: sessionStorage.length };
      } catch {
        return { local: -1, session: -1 };
      }
    });
    check(
      "the studio keeps no draft in the browser — a closed tab loses nothing",
      storage.local === 0 && storage.session === 0,
      JSON.stringify(storage),
    );
  } finally {
    await browser.close();
  }

  // 0 or 1, like every other lane — `run.mjs` folds these with `||`, and a
  // boolean `false` there would read as "no failure" and pass silently.
  if (failures.length > 0) {
    console.error(`web-studio: ${failures.length} FAILED → ${failures.join(" · ")}`);
    return 1;
  }
  console.log("web-studio: ALL CHECKS PASS");
  return 0;
}
