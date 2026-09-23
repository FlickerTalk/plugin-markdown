// The plugin's own tests: what it makes of the message it is handed (Plan §53). Everything is
// built as nodes, never as raw HTML, so a message can never bring markup of its own.
import { describe, expect, it } from "vitest";
import { blocksOf, inlineOf, noteName } from "./dist/index.js";

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
  it("shows what it is written", () => {
    const view = document.createElement("ft-markdown");
    document.body.append(view);
    view.setAttribute("text", "# Title\n\ntext");

    const written = view.shadowRoot.querySelector("textarea");
    expect(written.value).toBe("# Title\n\ntext");
    expect(view.shadowRoot.querySelector("[data-test='view']")).toBe(null);

    view.shadowRoot.querySelector("[data-act='look']").click();
    expect(view.shadowRoot.querySelector("[data-test='view'] h1").textContent).toBe("Title");
    expect(view.shadowRoot.querySelector("textarea")).toBe(null);
    view.remove();
  });

  it("names a note after the day it was written", () => {
    expect(noteName(new Date(2026, 8, 23, 10, 5, 9))).toBe("note-20260923-100509.md");
  });
});
