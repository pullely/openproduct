// The Talk lane: threads, public and private, in a real browser
// (openproduct-redesign OPR-4, design §7). A GATE.
//
// The privacy rule is the repository's SQL and is proved against a live
// engine in `packages/db`. What THIS lane holds is the web around it, driven
// as four people would drive it, over the fixture gateway — which answers a
// private thread by the bearer, the way the real one does:
//
//   nobody      signed out. Every public page, the sitemap and the feeds are
//               read and searched for the private thread's marker strings;
//               the private thread's own address shows the site's not-found;
//               and no public render ever ASKED the gateway for a private
//               thread (the fixture keeps a receipt of every ask).
//   Sam         signed in, on no crew, author of nothing. Sees a Private
//               filter with nothing under it, and the same not-found.
//   Lin         signed in, on no crew, the private thread's author. Sees it
//               under Private, opens it, reads the crew's reply, starts
//               another, and has an Activity row for the reply.
//   Ada         on the product's crew. Sees both under Private and in "Needs
//               you", replies with the Crew tag, and marks issues resolved.
//
// The done-when lines of OPR-4 are the four blocks below, in that order.

import { createRequire } from "node:module";
import { chromium } from "playwright";

import {
  ABSENT,
  CREW_SLUG,
  PRIVATE_MARKER,
  PRIVATE_MARKERS,
  READER_TOKEN,
  ROUTES,
  SAMPLE_IDEA_SLUG,
  SAMPLE_ISSUE_THREAD,
  SAMPLE_OPEN_ISSUE_THREAD,
  SAMPLE_PRIVATE_THREAD,
  STARTED_PRIVATE_THREAD,
  THIRD_TOKEN,
  resetTalk,
  sessionCookie,
} from "./fixture.mjs";
import { newRampContext } from "./ramp.mjs";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const NOT_FOUND_HEADING = "No product lives at this address";
const NEVER_ISSUED = "0b0b0b0b-0000-4000-8000-00000000ffff";

const LIN = { subjectId: "sub_000000000000000000000002", accessToken: READER_TOKEN, displayName: "Lin Park" };
const SAM = { subjectId: "sub_000000000000000000000003", accessToken: THIRD_TOKEN, displayName: "Sam Okafor" };

const failures = [];
function check(name, ok, detail) {
  console.log(`[talk] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function as(browser, base, who, viewport = DESKTOP, colorScheme = "light") {
  const context = await newRampContext(browser, { viewport, colorScheme });
  if (who === "ada") await context.addCookies(sessionCookie(base));
  else if (who) await context.addCookies(sessionCookie(base, who));
  return context;
}

/** The Talk list's filter, as the page draws it: [[label, count], …]. */
async function filterOf(page) {
  return page.$$eval("[data-talk-filter-option]", (buttons) =>
    buttons.map((b) => [b.getAttribute("data-talk-filter-option"), b.querySelector("span")?.textContent ?? null, b.getAttribute("aria-pressed")]),
  );
}

/** Wait for the signed-in read to land: the Private segment is drawn — and,
 *  when the reader has private threads, their rows (a chunk of their own). */
async function privateSegment(page, rows = false) {
  await page.waitForSelector('[data-talk-filter-option="private"]', { timeout: 15000 });
  if (rows) await page.waitForSelector('[data-thread][data-visibility="private"]', { state: "attached", timeout: 15000 });
}

async function visibleRows(page) {
  return page.$$eval("[data-thread]", (rows) =>
    rows
      .filter((row) => row.getBoundingClientRect().height > 0)
      .map((row) => ({ id: row.getAttribute("data-thread"), visibility: row.getAttribute("data-visibility"), text: row.textContent ?? "" })),
  );
}

async function axe(page, name) {
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(
    async (t) => await window.axe.run(document, { runOnly: { type: "tag", values: t }, resultTypes: ["violations"] }),
    TAGS,
  );
  check(
    `axe ${name}`,
    result.violations.length === 0,
    result.violations.map((v) => `${v.id}×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" ; ")}`).join(" || ") || "clean",
  );
}

export async function runTalk(base, gateway) {
  console.log(`web-talk: base=${base}`);
  resetTalk();
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  const TALK = `/${CREW_SLUG}/talk`;
  const PRIVATE_ADDRESS = `/threads/private/${SAMPLE_PRIVATE_THREAD}`;
  /** One walker's block. A step that never arrives is a failure of that
   *  block, named, and the walkers after it still walk. */
  const block = async (name, run) => {
    try {
      await run();
    } catch (error) {
      check(`${name}: the walk completed`, false, String(error?.message ?? error).split("\n")[0]);
    }
  };
  try {
    // ── 1. NOBODY: no public document holds the private thread ─────────
    await block('nobody', async () => {
      const context = await as(browser, base, null);
      const asksBefore = gateway.privateAsks.length;
      const paths = [
        ...ROUTES.map((route) => route.path),
        ...ABSENT.map((route) => route.path),
        "/sitemap.xml",
        `/${SAMPLE_IDEA_SLUG}`,
        // (The OPEN issue's own page is left for block 4, which reads it
        // for the first time after the crew resolves it: a page rendered
        // here would be the cached one for the next minute.)
        `/threads/${SAMPLE_ISSUE_THREAD}`,
        // Searched for by the thread's own words. (Not by the marker itself:
        // a search page prints the reader's query back, which is theirs.)
        "/search?q=invoice",
        "/search?q=7f3a91",
        "/search?q=account",
        `/people/ada`,
        "/digest",
        "/activity",
      ];
      const leaked = [];
      let read = 0;
      for (const path of [...new Set(paths)]) {
        const res = await context.request.get(base + path, { maxRedirects: 5 });
        const body = await res.text();
        read += 1;
        if (body.includes(PRIVATE_MARKER)) leaked.push(path);
      }
      check(
        "signed out: no public page, feed, sitemap, search result or person page holds the private thread",
        leaked.length === 0,
        leaked.length ? `leaked on ${leaked.join(", ")}` : `${read} documents read, none holds "${PRIVATE_MARKER}"`,
      );
      // The public thread address for the PRIVATE thread's id is a 404.
      const publicAddress = await context.request.get(`${base}/threads/${SAMPLE_PRIVATE_THREAD}`);
      const publicBody = await publicAddress.text();
      check(
        "signed out: the private thread's id at the PUBLIC thread address is the site's 404",
        publicAddress.status() === 404 && publicBody.includes(NOT_FOUND_HEADING) && !publicBody.includes(PRIVATE_MARKER),
        `status ${publicAddress.status()}`,
      );
      check(
        "signed out: no public render asked the gateway for a private thread",
        gateway.privateAsks.length === asksBefore,
        `${gateway.privateAsks.length - asksBefore} ask(s): ${JSON.stringify(gateway.privateAsks.slice(asksBefore, asksBefore + 3))}`,
      );

      // The shell: the same document for a real id and one never issued.
      const shell = await context.request.get(base + PRIVATE_ADDRESS);
      const shellNever = await context.request.get(`${base}/threads/private/${NEVER_ISSUED}`);
      const strip = (html, id) => html.split(id).join("ID");
      check(
        "signed out: a private thread's page is the same shell for a real id and one never issued",
        shell.status() === 200 &&
          shellNever.status() === 200 &&
          strip(await shell.text(), SAMPLE_PRIVATE_THREAD) === strip(await shellNever.text(), NEVER_ISSUED),
        `statuses ${shell.status()} / ${shellNever.status()}`,
      );
      // The data behind it: one 404, one body, and never cached.
      const data = await context.request.get(`${base}${PRIVATE_ADDRESS}/data`);
      const dataNever = await context.request.get(`${base}/threads/private/${NEVER_ISSUED}/data`);
      const dataBody = await data.text();
      check(
        "signed out: the thread's data is one 404 with one body, no-store — never a 401 or a 403",
        data.status() === 404 &&
          dataNever.status() === 404 &&
          dataBody === (await dataNever.text()) &&
          (data.headers()["cache-control"] ?? "").includes("no-store") &&
          !dataBody.includes(PRIVATE_MARKER),
        `${data.status()} / ${dataNever.status()} [${data.headers()["cache-control"] ?? "no cache-control"}]`,
      );
      const list = await context.request.get(`${base}${TALK}/private`);
      const listBody = await list.text();
      check(
        "signed out: the private list is empty and no-store",
        list.status() === 200 && listBody === JSON.stringify({ data: { crew: false, threads: [] } }) && (list.headers()["cache-control"] ?? "").includes("no-store"),
        `${list.status()} ${listBody.slice(0, 80)}`,
      );

      // In a browser: Talk is the public page; the private address is the 404.
      const page = await context.newPage();
      await page.goto(base + TALK, { waitUntil: "networkidle" });
      const filter = await filterOf(page);
      const rows = await visibleRows(page);
      check(
        "signed out: Talk draws the composer, All and Public, and the public threads — no Private",
        (await page.locator("form[data-talk-composer]").count()) === 1 &&
          JSON.stringify(filter.map((f) => f[0])) === JSON.stringify(["all", "public"]) &&
          rows.length === 2 &&
          rows.every((row) => row.visibility === "public"),
        `filter ${JSON.stringify(filter)}, ${rows.length} row(s)`,
      );
      check(
        "signed out: a row says its kind and Public, and opens the thread at its own address",
        rows.some((row) => row.text.includes("Question")) &&
          rows.some((row) => row.text.includes("Issue")) &&
          (await page.locator(`[data-thread="${SAMPLE_OPEN_ISSUE_THREAD}"] a[data-thread-open]`).getAttribute("href")) === `/threads/${SAMPLE_OPEN_ISSUE_THREAD}` &&
          (await page.locator("[data-resolve]").count()) === 0,
        rows.map((row) => row.text.slice(0, 60)).join(" | "),
      );
      await page.goto(`${base}/${SAMPLE_IDEA_SLUG}`, { waitUntil: "networkidle" });
      check(
        "signed out: a resolved issue says Resolved to everybody (the idea page's Talk)",
        (await page.locator(`[data-thread="${SAMPLE_ISSUE_THREAD}"] [data-resolved]`).innerText().catch(() => "")) === "Resolved" &&
          (await page.locator("form[data-talk-composer]").count()) === 1,
        "",
      );
      await page.goto(`${base}/threads/${SAMPLE_ISSUE_THREAD}`, { waitUntil: "networkidle" });
      const crumbs = await page.locator('nav[aria-label="Breadcrumb"] a').evaluateAll((links) => links.map((a) => a.getAttribute("href")));
      check(
        "signed out: the resolved issue's own page says its kind and Resolved, and links back to its product's Talk",
        (await page.locator("[data-resolved]").innerText().catch(() => "")) === "Resolved" &&
          (await page.locator("main").innerText()).includes("Issue") &&
          crumbs.includes(`/${SAMPLE_IDEA_SLUG}/talk`),
        `crumbs ${JSON.stringify(crumbs)}`,
      );
      await page.goto(base + PRIVATE_ADDRESS, { waitUntil: "networkidle" });
      await page.waitForSelector("h1", { timeout: 15000 });
      const heading = await page.locator("h1").innerText();
      const text = await page.locator("body").innerText();
      check(
        "signed out: the private thread's address shows the site's ordinary not-found",
        heading === NOT_FOUND_HEADING && !text.includes(PRIVATE_MARKER) && (await page.locator("[data-private-thread]").count()) === 0,
        `h1 “${heading}”`,
      );
      await page.close();
      await context.close();

      // With scripts off the public parts still work: the form, the rows.
      const plain = await browser.newContext({ viewport: DESKTOP, javaScriptEnabled: false });
      const noScript = await plain.newPage();
      await noScript.goto(base + TALK, { waitUntil: "load" });
      const action = await noScript.locator("form[data-talk-composer]").getAttribute("action");
      const radios = await noScript.locator('form[data-talk-composer] input[type="radio"]').count();
      const plainRows = await noScript.locator("[data-thread]").count();
      check(
        "scripts off: the composer is a form that posts, with its kinds and Public/Private, and the threads are drawn",
        action === `/${CREW_SLUG}/talk/start` && radios === 5 && plainRows === 2,
        `action ${action}, ${radios} radios, ${plainRows} rows`,
      );
      // The button's sentence follows the checked visibility by CSS alone.
      const sentence = async () => (await noScript.locator("button[data-talk-post]").innerText()).trim();
      const publicSentence = await sentence();
      await noScript.locator('form[data-talk-composer] label:has(input[value="private"])').click();
      const privateSentence = await sentence();
      check(
        "scripts off: the button reads “Post publicly”, then “Send to the crew” once Private is chosen",
        publicSentence === "Post publicly" && privateSentence === "Send to the crew",
        `“${publicSentence}” → “${privateSentence}”`,
      );
      await plain.close();
    });

    // ── 2. SAM: signed in, not the author, not the crew ────────────────
    await block('a third signed-in person', async () => {
      const context = await as(browser, base, SAM);
      const page = await context.newPage();
      await page.goto(base + TALK, { waitUntil: "networkidle" });
      await privateSegment(page);
      const filter = await filterOf(page);
      await page.locator('[data-talk-filter-option="private"]').click();
      const rows = await visibleRows(page);
      const empty = await page.locator("[data-talk-empty]").innerText().catch(() => "");
      check(
        "a third signed-in person: Private is offered and holds nothing — the thread is in no list",
        JSON.stringify(filter) === JSON.stringify([["all", "2", "true"], ["public", "2", "false"], ["private", "0", "false"]]) &&
          rows.length === 0 &&
          empty === "No threads" &&
          !(await page.content()).includes(PRIVATE_MARKER),
        `filter ${JSON.stringify(filter)}, ${rows.length} row(s), “${empty}”`,
      );
      check(
        "a third signed-in person: no crew control is drawn",
        (await page.locator("[data-resolve]").count()) === 0 && (await page.locator("[data-needs-you]").count()) === 0,
        "",
      );
      const data = await context.request.get(`${base}${PRIVATE_ADDRESS}/data`);
      const anonymous = await (await as(browser, base, null)).request.get(`${base}${PRIVATE_ADDRESS}/data`);
      check(
        "a third signed-in person: the thread's data is the 404 a signed-out reader gets, byte for byte",
        data.status() === 404 && (await data.text()) === (await anonymous.text()),
        `status ${data.status()}`,
      );
      await page.goto(base + PRIVATE_ADDRESS, { waitUntil: "networkidle" });
      await page.waitForSelector("h1", { timeout: 15000 });
      check(
        "a third signed-in person: the thread's address shows the site's ordinary not-found",
        (await page.locator("h1").innerText()) === NOT_FOUND_HEADING && !(await page.locator("body").innerText()).includes(PRIVATE_MARKER),
        "",
      );
      await page.goto(`${base}/activity`, { waitUntil: "networkidle" });
      check(
        "a third signed-in person: Activity says nothing about the thread",
        !(await page.locator("body").innerText()).includes("private thread"),
        "",
      );
      await context.close();
    });

    // ── 3. LIN: the author ──────────────────────────────────────────────
    await block('the author', async () => {
      const context = await as(browser, base, LIN);
      const page = await context.newPage();
      await page.goto(base + TALK, { waitUntil: "networkidle" });
      await privateSegment(page, true);
      const filter = await filterOf(page);
      await page.locator('[data-talk-filter-option="private"]').click();
      const rows = await visibleRows(page);
      check(
        "the author: their private thread is under Private, as theirs, with its badge",
        JSON.stringify(filter.map((f) => f.slice(0, 2))) === JSON.stringify([["all", "3"], ["public", "2"], ["private", "1"]]) &&
          rows.length === 1 &&
          rows[0].visibility === "private" &&
          rows[0].text.includes(PRIVATE_MARKERS.title) &&
          rows[0].text.includes("You") &&
          /Private · crew only/i.test(rows[0].text),
        `filter ${JSON.stringify(filter)}; row “${rows[0]?.text.slice(0, 90) ?? ""}”`,
      );
      await axe(page, "Talk with a private thread (desktop/light)");
      await page.locator(`[data-thread="${SAMPLE_PRIVATE_THREAD}"] a[data-thread-open]`).click();
      await page.waitForSelector('[data-private-thread="ready"]', { timeout: 15000 });
      const replies = await page.$$eval("[data-reply]", (nodes) => nodes.map((n) => n.textContent ?? ""));
      check(
        "the author: the thread's own address shows its words, the replies, and the Crew tag on the crew's",
        (await page.locator("h1").innerText()) === PRIVATE_MARKERS.title &&
          replies.length === 2 &&
          replies[0].includes(PRIVATE_MARKERS.body) &&
          !/Crew/.test(replies[0].replace("ZQPRIVATE-CREW", "")) &&
          replies[1].includes(PRIVATE_MARKERS.reply) &&
          /Ada Lovelace\s*Crew/i.test(replies[1]) &&
          (await page.locator("[data-resolve]").count()) === 0,
        `h1 ok; ${replies.length} replies`,
      );
      await axe(page, "a private thread (desktop/light)");

      // Start another, privately, as an issue. FROM THE ORIGIN THE SERVER
      // REDIRECTS TO: `next start` builds a redirect from its own idea of
      // the host (`localhost`), and the draft is kept per origin — on one
      // host, as deployed, there is only one.
      const local = base.replace("127.0.0.1", "localhost");
      await page.goto(local + TALK, { waitUntil: "networkidle" });
      await page.locator('form[data-talk-composer] input[name="title"]').fill("Lane: the receipt shows the wrong total");
      await page.locator('form[data-talk-composer] label:has(input[value="issue"])').click();
      await page.locator('form[data-talk-composer] label:has(input[value="private"])').click();
      const buttonText = (await page.locator("button[data-talk-post]").innerText()).trim();
      await Promise.all([page.waitForURL((u) => u.pathname === `/threads/private/${STARTED_PRIVATE_THREAD}`, { timeout: 15000 }), page.locator("button[data-talk-post]").click()]);
      await page.waitForSelector('[data-private-thread="ready"]', { timeout: 15000 });
      check(
        "the author: starts a private thread from the composer and sees it at its own address",
        buttonText === "Send to the crew" &&
          (await page.locator("h1").innerText()) === "Lane: the receipt shows the wrong total" &&
          /Issue/.test(await page.locator("[data-thread]").innerText()) &&
          !new URL(page.url()).search.includes("started"),
        `button “${buttonText}”, at ${new URL(page.url()).pathname}${new URL(page.url()).search}`,
      );
      await page.goto(new URL(page.url()).origin + TALK, { waitUntil: "networkidle" });
      await privateSegment(page, true);
      const after = await filterOf(page);
      check(
        "the author: the new thread is in their list, and the draft is gone from the composer",
        after.find((f) => f[0] === "private")?.[1] === "2" && (await page.locator('form[data-talk-composer] input[name="title"]').inputValue()) === "",
        JSON.stringify(after),
      );
      await page.goto(`${base}/activity`, { waitUntil: "networkidle" });
      const row = page.locator(`a[href="${PRIVATE_ADDRESS}"]`).first();
      const sentence = (await row.innerText().catch(() => "")).replace(/\s+/g, " ");
      check(
        "the author: Activity has a row for the crew's reply, linking to the thread — and none of its words",
        /replied to your private thread on/.test(sentence) && !(await page.locator("body").innerText()).includes(PRIVATE_MARKER),
        `“${sentence.slice(0, 90)}”`,
      );
      await context.close();

      // …and Sam still sees neither.
      const sam = await as(browser, base, SAM);
      const started = await sam.request.get(`${base}/threads/private/${STARTED_PRIVATE_THREAD}/data`);
      const list = await sam.request.get(`${base}${TALK}/private`);
      check(
        "a third signed-in person: the thread the author just started is a 404 for them too, and in no list",
        started.status() === 404 && (await list.text()) === JSON.stringify({ data: { crew: false, threads: [] } }),
        `status ${started.status()}`,
      );
      await sam.close();
    });

    // ── 4. ADA: the crew ────────────────────────────────────────────────
    await block('the crew', async () => {
      const context = await as(browser, base, "ada");
      const page = await context.newPage();
      // "Needs you" is on the product's own page (the Updates tab).
      await page.goto(`${base}/${CREW_SLUG}`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-needs-you-thread]", { timeout: 15000 });
      const needs = (await page.locator("[data-needs-you-thread]").first().innerText()).replace(/\s+/g, " ");
      const open = await page.locator("[data-needs-you-thread] a", { hasText: "Open" }).first().getAttribute("href");
      check(
        "the crew: “Needs you” says who started a private thread — not what it says — and Open goes to Talk's Private filter",
        /Lin Park started a private thread/.test(needs) && !needs.includes(PRIVATE_MARKER) && open === `/${CREW_SLUG}/talk#private`,
        `“${needs}” → ${open}`,
      );
      await page.goto(`${base}${TALK}#private`, { waitUntil: "networkidle" });
      await privateSegment(page, true);
      await page.waitForFunction(() => document.querySelector("#threads")?.getAttribute("data-talk-filter") === "private", null, { timeout: 15000 });
      const rows = await visibleRows(page);
      check(
        "the crew: sees every private thread on the product under Private, each by its author",
        rows.length === 2 &&
          rows.every((row) => row.visibility === "private" && row.text.includes("Lin Park")) &&
          rows.some((row) => row.text.includes(PRIVATE_MARKERS.title)) &&
          rows.some((row) => row.text.includes("Lane: the receipt shows the wrong total")),
        rows.map((row) => row.text.slice(0, 70)).join(" | "),
      );
      // Reply, as the crew.
      await page.goto(base + PRIVATE_ADDRESS, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-private-thread="ready"]', { timeout: 15000 });
      await page.locator('[data-private-thread] form input[name="body"]').fill("Lane: we have sent a corrected one.");
      await page.locator('[data-private-thread] form button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelectorAll("[data-reply]").length === 3, null, { timeout: 15000 });
      const last = await page.locator("[data-reply]").last().innerText();
      check(
        "the crew: replies in the private thread, and the reply carries the Crew tag",
        last.includes("Lane: we have sent a corrected one.") && /Crew/i.test(last),
        last.replace(/\s+/g, " ").slice(0, 90),
      );
      // Mark the PRIVATE issue resolved.
      await page.goto(`${base}/threads/private/${STARTED_PRIVATE_THREAD}`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-resolve]", { timeout: 15000 });
      await page.locator("[data-resolve]").click();
      await page.waitForFunction(() => document.querySelector("[data-resolve]")?.getAttribute("aria-pressed") === "true", null, { timeout: 15000 });
      const lin = await as(browser, base, LIN);
      const linPage = await lin.newPage();
      await linPage.goto(`${base}/threads/private/${STARTED_PRIVATE_THREAD}`, { waitUntil: "networkidle" });
      await linPage.waitForSelector('[data-private-thread="ready"]', { timeout: 15000 });
      check(
        "the crew marks a private issue resolved, and its author reads Resolved",
        (await linPage.locator("[data-resolved]").innerText().catch(() => "")) === "Resolved" && (await linPage.locator("[data-resolve]").count()) === 0,
        "",
      );
      await lin.close();

      // Mark the PUBLIC issue resolved, from its row on Talk.
      await page.goto(base + TALK, { waitUntil: "networkidle" });
      const button = page.locator(`[data-thread="${SAMPLE_OPEN_ISSUE_THREAD}"] [data-resolve]`);
      await button.waitFor({ timeout: 15000 });
      const before = (await button.innerText()).trim();
      const answer = (await page.locator(`[data-thread="${SAMPLE_OPEN_ISSUE_THREAD}"] a[data-thread-open]`).innerText()).trim();
      await button.click();
      await page.waitForFunction(
        (id) => document.querySelector(`[data-thread="${id}"] [data-resolve]`)?.getAttribute("aria-pressed") === "true",
        SAMPLE_OPEN_ISSUE_THREAD,
        { timeout: 15000 },
      );
      const publicRead = await (await fetch(`${gateway.url}/v1/public/openproduct/threads/${SAMPLE_OPEN_ISSUE_THREAD}`)).json();
      check(
        "the crew marks a public issue resolved from its row, and the PUBLIC read — no bearer — says resolved",
        before === "Mark resolved" && answer === "Answer" && (await button.innerText()).trim() === "Resolved" && publicRead.data.thread.resolvedAt !== null,
        `“${before}” → “${(await button.innerText()).trim()}”; public resolvedAt ${publicRead.data.thread.resolvedAt}`,
      );
      // …which a signed-out reader then sees on the thread's own page. (That
      // address is first rendered now, after the write: Talk itself is a
      // cached document and catches up within its minute.)
      const visitor = await as(browser, base, null);
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`${base}/threads/${SAMPLE_OPEN_ISSUE_THREAD}?fresh=${Date.now()}`, { waitUntil: "networkidle" });
      const mark = await visitorPage.locator("[data-resolved]").innerText().catch(() => "");
      check(
        "…and the thread then shows Resolved to a signed-out reader",
        mark === "Resolved" && (await visitorPage.locator("[data-resolve]").count()) === 0,
        `mark “${mark}” (a page cached before the write would say nothing for up to a minute)`,
      );
      await visitor.close();
      await context.close();
    });

    // ── 5. the phone board: dark, 390 wide, every target 44px ──────────
    await block('phone', async () => {
      const context = await as(browser, base, LIN, PHONE, "dark");
      const page = await context.newPage();
      await page.goto(base + TALK, { waitUntil: "networkidle" });
      await privateSegment(page, true);
      const small = await page.evaluate(() => {
        const out = [];
        const scope = [document.querySelector("form[data-talk-composer]"), document.querySelector("#threads")].filter(Boolean);
        for (const root of scope) {
          for (const el of root.querySelectorAll("a, button, input[type=text], label:has(input[type=radio]) > span")) {
            const box = el.getBoundingClientRect();
            if (box.height === 0 || box.width === 0) continue;
            // A name in a row's header is a word in a line, not a control of its own height.
            if (el.matches("a") && !el.hasAttribute("data-thread-open")) continue;
            if (box.height < 44) out.push(`${el.tagName.toLowerCase()} “${(el.textContent ?? "").trim().slice(0, 20)}” ${Math.round(box.height)}px`);
          }
        }
        return out;
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const badge = (await page.locator(`[data-thread="${SAMPLE_PRIVATE_THREAD}"]`).innerText()).replace(/\s+/g, " ");
      check("phone: every Talk control is at least 44px tall", small.length === 0, small.join("; ") || "all ≥ 44px");
      check("phone: Talk does not scroll sideways", overflow <= 0, `${overflow}px wider than the screen`);
      check("phone: a private row's badge is the short one", /PRIVATE/i.test(badge) && !/crew only/i.test(badge), badge.slice(0, 80));
      await axe(page, "Talk with a private thread (phone/dark)");
      await page.goto(base + PRIVATE_ADDRESS, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-private-thread="ready"]', { timeout: 15000 });
      await axe(page, "a private thread (phone/dark)");
      await context.close();
    });

    // ── 6. the receipt: who asked for a private thread, all run long ───
    await block('the receipt', async () => {
      const anonymous = gateway.privateAsks.filter((ask) => ask.token === null);
      const strangers = new Set(gateway.privateAsks.map((ask) => ask.token));
      check(
        "the gateway was asked for a private thread only ever with a bearer: a signed-out ask stops at the website",
        anonymous.length === 0,
        `${gateway.privateAsks.length} asks by ${[...strangers].join(", ")}; ${anonymous.length} with no bearer`,
      );
    });
  } finally {
    resetTalk();
    await browser.close();
  }

  if (failures.length) {
    console.error(`\nweb-talk: ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log("\nweb-talk: clean");
  return 0;
}
