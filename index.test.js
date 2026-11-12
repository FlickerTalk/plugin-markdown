import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blocksOf, inlineOf, noteName } from "./dist/index.js";
import source from "./dist/index.js?raw";
import manifest from "./module.json";

const languages = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];

const length = (text) => [...text].length;

describe("manifest", () => {
  it("sums itself up in every language of the app, and keeps its name", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(languages);
    for (const code of languages) {
      const { summary, ...rest } = manifest.locales[code];
      expect(rest, code).toEqual({});
      expect(summary?.trim(), code).toBeTruthy();
      expect(length(summary), code).toBeLessThanOrEqual(200);
    }
  });

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

  it("never lets a message bring its own markup or a dangerous link", () => {
    expect(inlineOf("<script>evil()</script>")).toEqual([{ kind: "text", text: "<script>evil()</script>" }]);
    expect(inlineOf("[tap](javascript:steal())")).toEqual([{ kind: "text", text: "[tap](javascript:steal())" }]);
    expect(inlineOf("[file](file:///etc/passwd)")).toEqual([{ kind: "text", text: "[file](file:///etc/passwd)" }]);
  });

  it("shows what it is written", async () => {
    const view = document.createElement("ft-markdown");
    document.body.append(view);
    view.setAttribute("text", "# Title\n\ntext");

    const written = view.querySelector("textarea");
    expect(written.value).toBe("# Title\n\ntext");
    expect(view.querySelector("[data-test='view']")).toBe(null);

    await new Promise((resolve) => setTimeout(resolve, 0));
    view.querySelector("[data-act='look']").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.querySelector("[data-test='view'] h1").textContent).toBe("Title");
    expect(view.querySelector("textarea")).toBe(null);
    view.remove();
  });

  it("names a note after the day it was written", () => {
    expect(noteName(new Date(2026, 8, 23, 10, 5, 9))).toBe("note-20260923-100509.md");
  });
});

describe("with the Ionic the app lends", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
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

  it("asks for an app that lends Ionic", () => {
    expect(manifest.minCoreVersion).toBe("1.6.0");
  });

  it("draws in the page, not in a shadow root, so Ionic's own styles reach it", async () => {
    const element = await mount();
    expect(element.shadowRoot).toBe(null);
    expect(element.querySelector(":scope > ion-header > ion-toolbar")).toBeTruthy();
    expect(element.querySelector(":scope > ion-content textarea")).toBeTruthy();
  });

  it("has every action as a labelled Ionic button in its toolbar, the side it shows pressed", async () => {
    const element = await mount();
    const acts = [...element.querySelectorAll("ion-toolbar ion-button")].map((button) => [button.dataset.act, label(button)]);
    expect(acts).toEqual([
      ["write", "Write"],
      ["look", "Look at it"],
      ["open", "Open a file"],
      ["save", "Save it on the phone"],
      ["send", "Put it in the chat"],
    ]);
    const isPressed = (button) => (button.getAttribute("aria-pressed") ?? button.shadowRoot?.querySelector("button")?.getAttribute("aria-pressed")) === "true";
    const pressed = () => [...element.querySelectorAll("ion-toolbar ion-button")].filter(isPressed).map((button) => button.dataset.act);
    expect(pressed()).toEqual(["write"]);
    element.querySelector('ion-button[data-act="look"]').click();
    await tick();
    expect(pressed()).toEqual(["look"]);
    expect(element.querySelector('ion-button[data-act="look"]').fill).toBe("solid");
  });

  it("puts what is written in the chat, saves it, and opens a file, from its buttons", async () => {
    const element = await mount("hello");
    element.querySelector("textarea").value = "hello *world*";
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
    element.querySelector('ion-button[data-act="look"]').click();
    await tick();
    element.querySelector('ion-button[data-act="write"]').click();
    await tick();
    expect(element.querySelector("textarea").value).toBe("# Back");
    expect(element.querySelectorAll("ion-toolbar")).toHaveLength(1);
  });

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

  it("carries no Ionic of its own", () => {
    for (const file of files) {
      const code = readFileSync(join(dist, file), "utf8");
      expect(code, file).not.toMatch(/@ionic\/core|ionicframework|stencil|defineCustomElement|__registerHost/i);
      expect(code, file).not.toMatch(/^\s*import\s.*from\s+["'](?!\.\/)/m);
    }
  });

  it("is small enough to be a seed", () => {
    const bytes = files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(128 * 1024);
  });
});

describe("the image of the Apps grid", () => {
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
