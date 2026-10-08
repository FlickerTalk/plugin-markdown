// The plugin's own tests: what it makes of the message it is handed (Plan §53). Everything is
// built as nodes, never as raw HTML, so a message can never bring markup of its own.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blocksOf, inlineOf, noteName } from "./dist/index.js";
import source from "./dist/index.js?raw";
import manifest from "./module.json";

// The app's languages (plugin-sdk, module.schema.json): English is the top level.
const languages = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];

// The schema counts characters, not UTF-16 units.
const length = (text) => [...text].length;

describe("manifest", () => {
  // Markdown is the name of the format: it stays as it is, only the summary is translated.
  it("sums itself up in every language of the app, and keeps its name", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(languages);
    for (const code of languages) {
      const { summary, ...rest } = manifest.locales[code];
      expect(rest, code).toEqual({});
      expect(summary?.trim(), code).toBeTruthy();
      expect(length(summary), code).toBeLessThanOrEqual(200);
    }
  });

  // What it makes goes to the chat through ft.send or ft.say, which the core refuses without the
  // send permission (A2): the manifest has to ask for it, or the main action does nothing.
  it("asks to write in the chat, since it puts its result there", () => {
    expect(source).toMatch(/\bft\??\.(send|say)\(/);
    expect(manifest.permissions.send).toBe("propose");
  });
});

describe("markdown", () => {
  it("reads headings, lists, quotes and code", () => {
    const blocks = blocksOf("# Title\n\n- one\n- two\n\n> quoted\n\n```js\nlet x = 1\n```");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "list", "quote", "code"]);
    expect(blocks[0]).toEqual({ kind: "heading", level: 1, text: "Title" });
    expect(blocks[1].items).toEqual(["one", "two"]);
    expect(blocks[3]).toEqual({ kind: "code", language: "js", code: "let x = 1" });
  });

  it("keeps a paragraph a paragraph", () => {
    expect(blocksOf("hello\nthere")).toEqual([{ kind: "paragraph", text: "hello\nthere" }]);
  });

  it("reads bold, italic, code and links inside a line", () => {
    expect(inlineOf("**bold** and *soft* and `code`")).toEqual([
      { kind: "strong", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "em", text: "soft" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
    ]);
    expect(inlineOf("see [the site](https://flickertalk.com)")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "the site", href: "https://flickertalk.com" },
    ]);
  });

  // A message is text: it may say anything, and none of it is markup or a way out.
  it("never lets a message bring its own markup or a dangerous link", () => {
    expect(inlineOf("<script>evil()</script>")).toEqual([{ kind: "text", text: "<script>evil()</script>" }]);
    expect(inlineOf("[tap](javascript:steal())")).toEqual([{ kind: "text", text: "[tap](javascript:steal())" }]);
    expect(inlineOf("[file](file:///etc/passwd)")).toEqual([{ kind: "text", text: "[file](file:///etc/passwd)" }]);
  });

  // Opened from the apps bar it is an editor: you write, you look at it, and you hand it over.
  it("shows what it is written", async () => {
    const view = document.createElement("ft-markdown");
    document.body.append(view);
    view.setAttribute("text", "# Title\n\ntext");

    const written = view.querySelector("ion-textarea");
    expect(written.value).toBe("# Title\n\ntext");
    expect(view.querySelector("[data-test='view']")).toBe(null);

    view.querySelector("ion-segment-button[value='look']").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.querySelector("[data-test='view'] h1").textContent).toBe("Title");
    expect(view.querySelector("ion-textarea")).toBe(null);
    view.remove();
  });

  it("names a note after the day it was written", () => {
    expect(noteName(new Date(2026, 8, 23, 10, 5, 9))).toBe("note-20260923-100509.md");
  });
});

describe("with the Ionic the app lends", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  // Ionic moves a button's label to the native button inside it once it has drawn.
  const label = (button) => button.getAttribute("aria-label") ?? button.shadowRoot?.querySelector("button")?.getAttribute("aria-label");
  let core;
  const mount = async (text = "") => {
    core = { said: [], saved: [], picked: 0 };
    globalThis.ft = {
      onOpen() {},
      say: (written) => core.said.push(written),
      save: async (name, mime) => core.saved.push([name, mime]),
      pickFile: async () => ((core.picked += 1), null),
    };
    document.body.innerHTML = "";
    const element = document.createElement("ft-markdown");
    document.body.append(element);
    if (text) element.setAttribute("text", text);
    await tick();
    return element;
  };

  afterEach(() => {
    delete globalThis.Ionicons;
    delete globalThis.ft;
  });

  // Only an app that lends Ionic can show it (app 1.6.0): an older one keeps the version it has.
  it("asks for an app that lends Ionic", () => {
    expect(manifest.minCoreVersion).toBe("1.6.0");
  });

  it("draws in the page, not in a shadow root, so Ionic's own styles reach it", async () => {
    const element = await mount();
    expect(element.shadowRoot).toBe(null);
    expect(element.querySelector("ion-toolbar")).toBeTruthy();
    expect(element.querySelector("ion-content ion-textarea")).toBeTruthy();
  });

  it("chooses between writing and looking with a segment, and acts with labelled Ionic buttons", async () => {
    const element = await mount();
    const segment = element.querySelector("ion-toolbar ion-segment");
    expect(segment.value).toBe("write");
    expect([...segment.querySelectorAll("ion-segment-button")].map((one) => [one.value, label(one) ?? one.getAttribute("aria-label")])).toEqual([
      ["write", "Write"],
      ["look", "Look at it"],
    ]);
    const acts = [...element.querySelectorAll("ion-toolbar ion-button")].map((button) => [button.dataset.act, label(button)]);
    expect(acts).toEqual([
      ["open", "Open a file"],
      ["save", "Save it on the phone"],
      ["send", "Put it in the chat"],
    ]);
  });

  it("puts what is written in the chat, saves it, and opens a file, from its buttons", async () => {
    const element = await mount("hello");
    element.querySelector("ion-textarea").value = "hello *world*";
    element.querySelector('ion-button[data-act="send"]').click();
    element.querySelector('ion-button[data-act="save"]').click();
    element.querySelector('ion-button[data-act="open"]').click();
    await tick();
    expect(core.said).toEqual(["hello *world*"]);
    expect(core.saved).toEqual([[expect.stringMatching(/^note-\d{8}-\d{6}\.md$/), "text/markdown"]]);
    expect(core.picked).toBe(1);
  });

  it("goes back to writing what it was looking at", async () => {
    const element = await mount("# Back");
    element.querySelector("ion-segment-button[value='look']").click();
    await tick();
    element.querySelector("ion-segment-button[value='write']").click();
    await tick();
    expect(element.querySelector("ion-textarea").value).toBe("# Back");
    expect(element.querySelectorAll("ion-toolbar")).toHaveLength(1);
  });

  // The icons are the app's: Ionic's own when the app lent them by name, else the ones it serves.
  it("draws an Ionicon the app lent by name with ion-icon, and the one it serves otherwise", async () => {
    let element = await mount();
    expect(element.querySelector('[data-act="open"] ion-icon')).toBe(null);
    expect(element.querySelector('[data-act="open"] [slot="icon-only"]').getAttribute("style")).toContain("./icon/folder-open-outline.svg");

    globalThis.Ionicons = { map: new Map([["folder-open-outline", "data:image/svg+xml;utf8,<svg></svg>"]]) };
    element = await mount();
    expect(element.querySelector('[data-act="open"] ion-icon[slot="icon-only"]').getAttribute("name")).toBe("folder-open-outline");
  });
});

describe("the package", () => {
  const dist = join(import.meta.dirname, "dist");
  const files = readdirSync(dist);

  // Ionic is the app's, lent to the frame: a copy in the package would be a second one, and heavy.
  it("carries no Ionic of its own", () => {
    for (const file of files) {
      const code = readFileSync(join(dist, file), "utf8");
      expect(code, file).not.toMatch(/@ionic\/core|ionicframework|stencil|defineCustomElement|__registerHost/i);
      expect(code, file).not.toMatch(/^\s*import\s.*from\s+["'](?!\.\/)/m);
    }
  });

  // The app carries it as a seed on iOS: 128 KiB at most (plugin-sdk).
  it("is small enough to be a seed", () => {
    const bytes = files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(128 * 1024);
  });
});

describe("the image of the Apps grid", () => {
  // icon.svg beside module.json and dist/, signed with the rest: the app draws it on the tile; the
  // Ionicon in module.json stays as the fallback (2026-10-08).
  const image = join(import.meta.dirname, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(existsSync(join(import.meta.dirname, "dist", "icon.svg"))).toBe(false);
  });
});
