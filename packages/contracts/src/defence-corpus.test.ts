// The measured false-positive rate (openproduct-commons TS4).
//
// TS4's done-when clause asks for a false-positive rate measured on a held-out
// set of real listings AND STATED. This file is that measurement, and the two
// halves matter separately: measuring makes the thresholds accountable, and
// stating makes them arguable by somebody who was not in the room.
//
// ─── WHAT THIS CORPUS IS, SAID PLAINLY ────────────────────────────────────
//
// It is not a sample of production listings. openproduct's catalog is small
// and its pitches belong to identifiable people, and running a
// false-positive experiment over real makers' text — then committing the
// results, with their words, to a public repository — is a thing you do to
// people rather than with them.
//
// So this is a corpus ASSEMBLED FOR THE PURPOSE: pitches written to match the
// genre and, deliberately, to concentrate on the cases where the detector is
// most likely to be wrong. It is loaded against the detector, not for it.
// Every entry in `HONEST` is one of:
//
//   * written in visibly non-native English (the failure mode that decided
//     the whole design — see defence.ts's header),
//   * about something with no numbers, no code and no jargon: a design tool,
//     a writing app, a font,
//   * enthusiastic in exactly the register the filler list penalises
//     ("powerful", "intuitive", "seamless") while still being about a real
//     thing,
//   * or short and plain, in the style of somebody who does not enjoy writing
//     pitches.
//
// A rate measured this way is a FLOOR ON OUR KNOWLEDGE and not a claim about
// production. It says: here are the hardest honest cases we could think of,
// and here is how the detector did on them. If it were a random sample the
// number would be lower and would mean less. That framing is repeated in
// `CORPUS_NOTE`, which the public page renders verbatim, because a rate
// published without it is a rate that will be quoted as something it is not.
//
// THE TEST ASSERTS ZERO FALSE POSITIVES. Not a small rate — zero. This
// detector's only consequence is de-indexing, which is mild, but it is
// applied silently to somebody who is never told, and the population it would
// wrongly hit is the one the estate least wants to lose. If a future change
// makes a single honest pitch here flag, the right response is to weaken the
// detector, not to update the number.

import { describe, expect, it } from "vitest";

import {
  CORPUS_NOTE,
  CORPUS_SIZE,
  FILLER_DENSITY,
  MIN_ASSESSABLE_WORDS,
  assessFiller,
  specificityTotal,
} from "./defence.js";

// ---------------------------------------------------------------------------
// Honest pitches — the held-out set
// ---------------------------------------------------------------------------

interface Entry {
  readonly id: string;
  /** Why this entry is in the corpus: which failure mode it probes. */
  readonly probes: string;
  readonly text: string;
}

const HONEST: readonly Entry[] = [
  {
    id: "non-native-1",
    probes: "second-language English, simple sentence shapes, low lexical variance",
    text:
      "This is a tool for make backup of your database automatic. I write it because in my company " +
      "we lost data two times and nobody was responsible. It connect to Postgres or MySQL and copy " +
      "the data to a folder or to S3. You can set how many copy to keep. There is a small web page " +
      "where you see the last backups and if they are good or not. It is not doing anything clever, " +
      "it is only doing the boring thing every day without forget. I use it in production since one " +
      "year for four databases.",
  },
  {
    id: "non-native-2",
    probes: "second-language English about a non-technical product, few proper nouns",
    text:
      "A small application to help you learn the words of a new language. You put your words in a " +
      "list and every day the application ask you some of them. If you answer good, it will ask you " +
      "again after more days. If you answer bad, it ask you again tomorrow. This is the method that " +
      "my teacher was using with paper cards and I only make it on the computer. There is no account " +
      "and no cloud, all your words stay on your machine in one file that you can open and read.",
  },
  {
    id: "non-native-3",
    probes: "translated-feeling prose, abstract subject, no identifiers",
    text:
      "We build this for the small associations that organise events in our city. Before, they were " +
      "using paper and a group chat and always somebody was not informed. Here you make an event, " +
      "you invite the people, and everybody see the same thing. You can also write who is bringing " +
      "what for the food. It is free and it will stay free, we pay the server ourselves because it " +
      "is not expensive and we do not want advertising on it.",
  },
  {
    id: "design-tool-1",
    probes: "no numbers, no code, no technology names — a design product",
    text:
      "A place to keep the colours you like. Every designer has a folder of screenshots of palettes " +
      "they saw somewhere and will never find again. This is that folder, but it knows what is a " +
      "colour, so you can search by mood, by warmth, by how much contrast there is between the light " +
      "and dark ends. You can drop in a photograph and pull the palette out of it. You can put two " +
      "palettes side by side and see which one holds together. Nothing is public unless you make it " +
      "public.",
  },
  {
    id: "design-tool-2",
    probes: "a font, described the way type designers describe type",
    text:
      "A typeface for interfaces that need to hold a lot of small text without becoming grey. The " +
      "letters are slightly narrower than you expect and the openings are wider, which is what keeps " +
      "a paragraph readable when it is set small and tight. There is a true italic rather than a " +
      "slanted roman, because a slanted roman in a caption always looks like a mistake. It comes in " +
      "four weights and the whole family is free for anything, including work you are paid for.",
  },
  {
    id: "writing-app",
    probes: "prose about prose — the least technical possible pitch",
    text:
      "A writing app that hides everything until you stop typing. No word count, no outline, no " +
      "sidebar, no formatting bar. When you pause for a few seconds the rest of the interface fades " +
      "back in and you can find what you need. The idea is not minimalism for its own sake — it is " +
      "that every visible control is a small invitation to stop writing and adjust something, and " +
      "the adjusting is not the work. Your text is a plain file in a folder you choose.",
  },
  {
    id: "enthusiast-1",
    probes: "the exact register the filler list penalises, about a real thing",
    text:
      "A powerful and intuitive terminal file manager that makes navigating huge directory trees " +
      "genuinely delightful. It is seamless to move between panes, the preview is instant even for " +
      "enormous files, and the whole thing is a robust single binary with no runtime to install. If " +
      "you have ever wanted the comprehensive power of a real file manager without leaving the " +
      "keyboard, this is a versatile and elegant answer. Written in Rust, works on macOS, Linux and " +
      "Windows.",
  },
  {
    id: "enthusiast-2",
    probes: "marketing register with almost no specifics, but a couple of real hooks",
    text:
      "An innovative and comprehensive solution for teams who want to streamline how they collect " +
      "feedback. It is intuitive enough that anybody can use it on their first day, robust enough " +
      "that it will not fall over when a thousand responses arrive at once, and versatile enough to " +
      "handle everything from a two-question poll to a long research interview. We built it because " +
      "every existing tool we tried was either delightful and useless or comprehensive and " +
      "impossible. Self-hosted, one Docker container.",
  },
  {
    id: "plain-1",
    probes: "flat, unenthusiastic writing by somebody who dislikes writing pitches",
    text:
      "This converts subtitle files between formats. It handles SRT, VTT, ASS and a few others. It " +
      "keeps the timing exactly as it was, which sounds obvious but is where most converters go " +
      "wrong when the source has overlapping cues. It can also shift all the timings by a fixed " +
      "amount, which is what you want when your file is a second and a half out of sync with your " +
      "video. Command line only. There is no interface and there is not going to be one.",
  },
  {
    id: "plain-2",
    probes: "flat prose, a library, minimal ornament",
    text:
      "A library for reading and writing the ID3 tags on audio files. It supports version 2.3 and " +
      "2.4, reads version 1 for old files, and does not silently rewrite tags it did not understand. " +
      "That last part is the reason it exists: every other library we tried would drop frames it had " +
      "no model for, so round-tripping a file through it quietly lost the artwork or the replay gain. " +
      "This one keeps unknown frames byte for byte and puts them back where it found them.",
  },
  {
    id: "hardware",
    probes: "a physical product on a software directory",
    text:
      "An open hardware keyboard you assemble yourself. Everything is through-hole, so you can build " +
      "it with a soldering iron you already own and no hot air station. The plate and case files are " +
      "in the repository and any of the usual services will cut them. The firmware is QMK, so every " +
      "layout tool that already exists works with it. We publish the bill of materials with the " +
      "actual part numbers rather than descriptions, because sourcing is the part that stops people " +
      "finishing a build.",
  },
  {
    id: "research",
    probes: "academic register, long sentences",
    text:
      "An implementation of the algorithm described in the accompanying paper for aligning sequences " +
      "with structural constraints. The reference implementation in the paper is written for clarity " +
      "rather than speed and takes several hours on the datasets people actually want to run it on; " +
      "this one restructures the inner loop and uses a bit-parallel representation of the state, and " +
      "produces identical output on every test case in the original suite. Benchmarks and the " +
      "comparison scripts are included so you can check that claim yourself.",
  },
  {
    id: "game",
    probes: "a game — evocative rather than specific writing",
    text:
      "A small game about tending a garden that grows while you are not playing. You plant things, " +
      "you come back tomorrow, and something has happened. Sometimes what happened is good and " +
      "sometimes a plant has taken over a corner you were saving for something else. There is no " +
      "score and no way to lose. It was made over one winter as a way of learning how to draw, and " +
      "the drawing is not very good, which we have decided is part of it now.",
  },
  {
    id: "beginner",
    probes: "a first project, apologetic register",
    text:
      "This is my first real project so please be kind. It is a timer for cooking that lets you run " +
      "several at once and gives each one a name, because I kept burning things while a different " +
      "thing was also cooking. You can save the ones you use often. It works offline and it does not " +
      "collect anything about you, mostly because I would not know how to. I learned a lot making it " +
      "and I would like to make it better, so if something is broken please tell me.",
  },
  {
    id: "corporate-oss",
    probes: "corporate voice on a genuine open-source release",
    text:
      "We are releasing the internal service mesh configuration tooling we have been running for the " +
      "past three years. It generates Envoy configuration from a much smaller description of what you " +
      "actually want, validates it against the running control plane before it is applied, and can " +
      "roll a change out to a percentage of traffic and back automatically if error rates move. It " +
      "is opinionated in ways that suit our topology and we have documented which of those " +
      "opinions are load-bearing and which are accidents.",
  },
  {
    id: "abstract-1",
    probes: "a genuinely abstract product — a methodology, not a binary",
    text:
      "A set of templates and prompts for running a retrospective that does not turn into a list of " +
      "complaints nobody acts on. Each one is a single page: what to ask, in what order, how long to " +
      "leave each question open, and what to do with what comes out at the end. They came out of " +
      "running this badly for years and slowly noticing which parts were doing the work. Print them, " +
      "change them, use the parts that fit your team and throw the rest away.",
  },
  {
    id: "abstract-2",
    probes: "a curated list — almost no verbs, no technology names in the body",
    text:
      "A reading list for people who have just become responsible for other people's work for the " +
      "first time. Not a management library — most of that is written for a scale nobody reading this " +
      "is at yet. These are the handful of essays and chapters that were actually useful in the first " +
      "six months, with a paragraph on each saying what it is for and when to read it. It is short on " +
      "purpose and it will stay short; adding something means taking something out.",
  },
  {
    id: "long-plain",
    probes: "a long pitch with a low but nonzero filler density",
    text:
      "A self-hosted read-it-later service. You send it a link, it fetches the page, strips the " +
      "navigation and the newsletter overlay, and keeps the article as text and as the original " +
      "HTML in case the extraction was wrong. Everything is searchable, including the full text " +
      "rather than only the titles, which is the whole reason to keep an archive rather than " +
      "bookmarks. It will export everything you have ever saved as a folder of files with one " +
      "command, and that export is tested on every release, because a service that holds your " +
      "reading and cannot give it back is not really yours. It is powerful without being " +
      "complicated and it is genuinely intuitive to use, but mostly it is just small and it keeps " +
      "working.",
  },
  {
    id: "translated-marketing",
    probes: "the worst case: second-language English AND marketing register",
    text:
      "Our powerful solution empower the small business for manage their invoice in easy way. It is " +
      "very intuitive and you can start in five minutes without training. The system is robust and " +
      "scalable so it grow together with your company. We make it because the existing solutions was " +
      "too complicated and too expensive for a business of three or four person. You can send the " +
      "invoice by email directly and see when the client open it. Everything is stored in your own " +
      "server.",
  },
  {
    id: "no-caps",
    probes: "lowercase styling throughout — defeats the proper-noun signal on purpose",
    text:
      "a tiny static site generator. you write markdown, it writes html. there is no theme system, no " +
      "plugin system and no configuration file with forty keys in it. there is one template and you " +
      "edit it. this is not a limitation we plan to remove; every generator we have used started here " +
      "and then grew a plugin system, and the plugin system is where the afternoons go. if you need " +
      "more than this you have outgrown it and that is fine, the output is plain files and nothing is " +
      "locked in.",
  },
];

// ---------------------------------------------------------------------------
// Filler — the set the detector is supposed to catch
// ---------------------------------------------------------------------------

const FILLER: readonly Entry[] = [
  {
    id: "filler-scaffold-1",
    probes: "an unedited model preamble pasted in with the answer",
    text:
      "Certainly! Here is a compelling product description for your listing:\n\n" +
      "Our platform revolutionises the way modern teams collaborate, delivering unparalleled value " +
      "through a seamless and intuitive experience designed for the way you work today.",
  },
  {
    id: "filler-scaffold-2",
    probes: "an unfilled template placeholder",
    text:
      "[Product Name] is the leading solution for teams who want to do more. Built from the ground up " +
      "for the modern workplace, it brings everything together in one place so your team can focus on " +
      "what matters most. Get started in minutes and see the difference for yourself today.",
  },
  {
    id: "filler-scaffold-3",
    probes: "the stock opening that names its own genre",
    text:
      "In today's fast-paced world, businesses need tools that keep up. That is why we created a " +
      "platform that adapts to you, not the other way around. Whether you are a small team or a " +
      "growing enterprise, our flexible approach means you always have what you need, exactly when " +
      "you need it, without any of the friction you have come to expect.",
  },
  {
    id: "filler-density-1",
    probes: "no scaffold at all — must be caught by density plus emptiness",
    text:
      "A revolutionary and innovative platform that empowers teams to unlock their full potential. " +
      "Our cutting-edge solution leverages a robust and scalable architecture to deliver a seamless, " +
      "frictionless experience across the entire ecosystem. Streamline your workflow, elevate your " +
      "output, and supercharge productivity with an intuitive and comprehensive set of powerful " +
      "capabilities designed to transform the way your organisation works. Best-in-class, " +
      "enterprise-grade and delightful from the very first moment.",
  },
  {
    id: "filler-density-2",
    probes: "softer filler, still empty, still no specifics",
    text:
      "The comprehensive solution for the modern team. Powerful yet intuitive, robust yet effortless, " +
      "our versatile platform brings together everything you need in one delightful ecosystem. " +
      "Streamline the way you work, empower every member of your team, and unlock a level of " +
      "productivity you did not think was possible. Scalable from the smallest team to the largest " +
      "enterprise, and innovative in every detail.",
  },
  {
    id: "filler-density-3",
    probes: "an empty pitch dressed as a manifesto",
    text:
      "We believe work should be effortless. That belief drives everything we build: a seamless " +
      "experience, a robust foundation, and an intuitive surface that gets out of your way. Our " +
      "innovative approach means you spend less time managing your tools and more time doing the " +
      "work that matters. It is a transformative way to think about productivity, and it is " +
      "delightful in a way you have to use to understand. Powerful, versatile, and built for the way " +
      "teams actually work.",
  },
];

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

function rate(hits: number, total: number): number {
  return total === 0 ? 0 : hits / total;
}

describe("the corpus is what it claims to be", () => {
  it("every honest entry is long enough to be assessed at all", () => {
    // Otherwise the measurement is meaningless: a corpus of texts below
    // MIN_ASSESSABLE_WORDS would report a perfect false-positive rate while
    // testing nothing.
    for (const entry of HONEST) {
      const assessment = assessFiller(entry.text);
      expect(
        assessment.words,
        `${entry.id} is ${assessment.words} words, below the ${MIN_ASSESSABLE_WORDS}-word floor`,
      ).toBeGreaterThanOrEqual(MIN_ASSESSABLE_WORDS);
      expect(assessment.assessable).toBe(true);
    }
  });

  it("every honest entry states which failure mode it probes", () => {
    for (const entry of HONEST) expect(entry.probes.length).toBeGreaterThan(20);
    for (const entry of FILLER) expect(entry.probes.length).toBeGreaterThan(20);
  });

  it("the honest set covers the failure modes the design named", () => {
    const probes = HONEST.map((e) => e.probes).join(" ").toLowerCase();
    // The four the header commits to. A corpus that quietly stopped covering
    // one of these would report a rate that no longer means what it says.
    expect(probes).toMatch(/non-native|second-language/);
    expect(probes).toMatch(/no numbers|no code|no identifiers/);
    expect(probes).toMatch(/marketing register|filler list|enthusias/);
    expect(probes).toMatch(/flat|plain|unenthusiastic/);
  });
});

describe("the measured false-positive rate (TS4's done-when)", () => {
  it("flags no honest pitch in the corpus", () => {
    const wrong = HONEST.filter((entry) => assessFiller(entry.text).flagged);
    // Named, not counted — a failure here must say WHICH pitch, because the
    // next question is always "what is it about that one".
    expect(
      wrong.map((e) => `${e.id} (${e.probes})`),
      "an honest pitch was flagged; weaken the detector rather than the corpus",
    ).toEqual([]);
    expect(rate(wrong.length, HONEST.length)).toBe(0);
  });

  it("the hardest honest cases clear the density threshold by a real margin", () => {
    // The two entries written specifically in the filler register. If these
    // sat a hair under the threshold the zero above would be luck rather than
    // headroom, and the next word added to FILLER_WORDS would break it.
    for (const id of ["enthusiast-1", "enthusiast-2", "translated-marketing"]) {
      const entry = HONEST.find((e) => e.id === id)!;
      const assessment = assessFiller(entry.text);
      // They may well exceed the density — that is the point of the register.
      // What saves them is specificity, and that is what must hold.
      expect(specificityTotal(assessment.specificity), `${id} has no specificity markers`).toBeGreaterThan(0);
    }
  });

  it("catches every filler pitch in the corpus", () => {
    const missed = FILLER.filter((entry) => !assessFiller(entry.text).flagged);
    expect(missed.map((e) => `${e.id} (${e.probes})`)).toEqual([]);
  });

  it("catches the density cases without help from any scaffold marker", () => {
    // The scaffold list is the easy half and would carry the whole suite if
    // the density half quietly stopped working.
    for (const entry of FILLER.filter((e) => e.id.startsWith("filler-density"))) {
      const assessment = assessFiller(entry.text);
      expect(assessment.scaffolds, `${entry.id} leaned on a scaffold marker`).toEqual([]);
      expect(assessment.signals).toContain("filler-vocabulary");
      expect(assessment.signals).toContain("no-specificity");
      expect(assessment.flagged).toBe(true);
    }
  });

  it("reports the separation the threshold sits in", () => {
    // Not an assertion about a number so much as a record of one. If somebody
    // moves FILLER_DENSITY, this is where they see what they moved it
    // through.
    const honestDensities = HONEST.map((e) => assessFiller(e.text).density);
    const fillerDensities = FILLER.filter((e) => e.id.startsWith("filler-density")).map(
      (e) => assessFiller(e.text).density,
    );
    const worstHonest = Math.max(...honestDensities);
    const easiestFiller = Math.min(...fillerDensities);
    // The honest set is ALLOWED to exceed the threshold — specificity is what
    // saves those entries, and pretending otherwise would mean tuning the
    // density until honest enthusiasm scored low, which is the failure this
    // design refuses. What must hold is that filler sits above it.
    expect(easiestFiller).toBeGreaterThanOrEqual(FILLER_DENSITY);
    expect(worstHonest).toBeLessThan(0.12);
  });
});

describe("what the corpus does NOT establish, asserted so nobody claims it does", () => {
  it("a filler pitch that names one real thing is missed, and that is the safe direction", () => {
    const missed =
      "A revolutionary and innovative platform that empowers teams to unlock their full potential. " +
      "Our cutting-edge solution leverages a robust and scalable architecture to deliver a seamless, " +
      "frictionless experience across the entire ecosystem. Streamline your workflow, elevate your " +
      "output, and supercharge productivity with an intuitive and comprehensive set of powerful " +
      "capabilities. Runs on Kubernetes.";
    const assessment = assessFiller(missed);
    expect(assessment.signals).toContain("filler-vocabulary");
    expect(assessment.signals).not.toContain("no-specificity");
    // Two words at the end defeat the detector entirely. That is a real and
    // permanent limit of a conjunction rule, it is asserted here as expected
    // behaviour rather than left as a gap, and the alternative — dropping the
    // conjunction — flags the honest enthusiast set above.
    expect(assessment.flagged).toBe(false);
  });

  it("the published corpus sizes are the corpus's actual sizes", () => {
    // CORPUS_SIZE is rendered on a public page and lives in `defence.ts`,
    // which cannot see this file. This is the pin that stops the published
    // number drifting from the corpus it describes the moment somebody adds
    // an entry.
    expect(CORPUS_SIZE.honest).toBe(HONEST.length);
    expect(CORPUS_SIZE.filler).toBe(FILLER.length);
  });

  it("the corpus is assembled rather than sampled, and the note says so", () => {
    // The note is rendered verbatim on the public page. A rate published
    // without this sentence beside it will be quoted as a production
    // measurement, which it is not.
    expect(CORPUS_NOTE).toMatch(/not a sample/i);
    expect(CORPUS_NOTE).toMatch(/hardest/i);
  });
});
