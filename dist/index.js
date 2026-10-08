// Markdown for FlickerTalk (Plan §53–§55). It reads the message it is handed and builds nodes: no
// HTML of the message ever becomes markup, no network, nothing of the chat but this one message.

const SAFE_LINK = /^https?:\/\//i;

/** The blocks of a markdown text, in order. */
export function blocksOf(text) {
  const blocks = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^```([^\n]*)$/.exec(line.trim());
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "```") {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const language = fence[1].trim().toLowerCase();
      blocks.push({ kind: "code", language: /^[a-z0-9+#-]*$/.test(language) ? language : "", code: code.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: quoted.join("\n") });
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*>)/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

/** The pieces of one line: bold, italic, code, links and plain text. */
export function inlineOf(line) {
  const pieces = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) pieces.push({ kind: "text", text: line.slice(last, match.index) });
    if (match[2] !== undefined) pieces.push({ kind: "strong", text: match[2] });
    else if (match[4] !== undefined) pieces.push({ kind: "em", text: match[4] });
    else if (match[6] !== undefined) pieces.push({ kind: "code", text: match[6] });
    else if (match[8] !== undefined) {
      // Only a link we can open safely; anything else stays as the text it was.
      if (SAFE_LINK.test(match[9])) pieces.push({ kind: "link", text: match[8], href: match[9] });
      else pieces.push({ kind: "text", text: match[0] });
    }
    last = pattern.lastIndex;
  }

  if (last < line.length) pieces.push({ kind: "text", text: line.slice(last) });
  if (!pieces.length) return [{ kind: "text", text: line }];

  // Text that ended up in pieces is still one piece of text.
  return pieces.reduce((joined, piece) => {
    const previous = joined[joined.length - 1];
    if (piece.kind === "text" && previous && previous.kind === "text") previous.text += piece.text;
    else joined.push(piece);
    return joined;
  }, []);
}

/** Turns the pieces of a line into nodes; the text is always text. */
function inlineNodes(line) {
  return inlineOf(line).map((piece) => {
    if (piece.kind === "text") return document.createTextNode(piece.text);
    const tag = piece.kind === "strong" ? "strong" : piece.kind === "em" ? "em" : piece.kind === "code" ? "code" : "a";
    const node = document.createElement(tag);
    node.textContent = piece.text;
    if (piece.kind === "link") {
      node.setAttribute("href", piece.href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer noopener");
    }
    return node;
  });
}

/** What a note is called when it is saved: the day and the time it was written. */
export function noteName(now) {
  const two = (value) => String(value).padStart(2, "0");
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  return `note-${day}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}.md`;
}

// Ionic draws the window (the app lends it to the frame, app 1.6.0); this is only what is the
// tool's own: how the markdown reads. The colours are the app's, through Ionic's variables.
const STYLE = `
ft-markdown { display: flex; flex-direction: column; height: 100%; }
ft-markdown ion-content { flex: 1; }
ft-markdown ion-segment { width: auto; }
ft-markdown .ft-i {
  display: block; width: 22px; height: 22px; background: currentColor;
  -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat;
}
ft-markdown ion-textarea {
  --padding-start: 12px; --padding-end: 12px; font: 14px/1.5 ui-monospace, Menlo, monospace;
  border: 1px solid var(--ion-border-color, rgba(127,127,127,0.35)); border-radius: 12px;
}
ft-markdown [data-test="view"] { font-size: 15px; line-height: 1.6; }
ft-markdown [data-test="view"] :is(h1, h2, h3, h4, h5, h6) { margin: 0.8em 0 0.3em; line-height: 1.25; }
ft-markdown [data-test="view"] :is(p, ul, blockquote, pre) { margin: 0 0 0.8em; }
ft-markdown [data-test="view"] ul { padding-inline-start: 1.2em; }
ft-markdown [data-test="view"] blockquote { padding-inline-start: 0.8em; border-inline-start: 3px solid var(--ion-color-medium, currentColor); color: var(--ion-color-medium, inherit); }
ft-markdown [data-test="view"] pre { padding: 10px 12px; border-radius: 10px; background: var(--ion-item-background, rgba(127,127,127,0.18)); overflow-x: auto; }
ft-markdown [data-test="view"] code { font: 13px/1.5 ui-monospace, Menlo, monospace; }
ft-markdown [data-test="view"] a { color: var(--ion-color-primary, inherit); }
`;

/** An Ionicon: Ionic's own `ion-icon` when the app lent it by name, else the one the app serves at
 *  `./icon/<name>.svg`, painted in the button's colour. Never a picture of ours. */
const icon = (name, slot = "icon-only") =>
  globalThis.Ionicons?.map?.has(name)
    ? `<ion-icon slot="${slot}" name="${name}" aria-hidden="true"></ion-icon>`
    : `<i slot="${slot}" class="ft-i" style="--i:url(./icon/${name}.svg)" aria-hidden="true"></i>`;

/**
 * Markdown in FlickerTalk: write it, look at it, and hand it to the chat. It reads a message it is
 * handed and it reads a file the user picks, and it builds nodes —never HTML— so nothing that
 * arrives can bring markup of its own (§53).
 */
class Markdown extends HTMLElement {
  static observedAttributes = ["text"];

  constructor() {
    super();
    this.text = "";
    this.looking = false;
  }

  attributeChangedCallback(name, before, value) {
    this.text = String(value ?? "");
    this.render();
  }

  connectedCallback() {
    this.text = this.getAttribute("text") ?? this.text;
    globalThis.ft?.onOpen?.(({ text }) => {
      if (text) {
        this.text = text;
        this.looking = true;
        this.render();
      }
    });
    this.render();
  }

  /** The window, once: Ionic's toolbar with the choice and the actions, and the page below it. In
   *  the page, not in a shadow root: Ionic's global styles do not cross a shadow boundary. */
  frame() {
    if (this.page) return;
    this.innerHTML = `
      <style>${STYLE}</style>
      <ion-toolbar>
        <ion-segment slot="start" value="write">
          <ion-segment-button value="write" aria-label="Write">${icon("pencil-outline", "")}</ion-segment-button>
          <ion-segment-button value="look" aria-label="Look at it">${icon("eye-outline", "")}</ion-segment-button>
        </ion-segment>
        <ion-buttons slot="end">
          <ion-button data-act="open" aria-label="Open a file">${icon("folder-open-outline")}</ion-button>
          <ion-button data-act="save" aria-label="Save it on the phone">${icon("download-outline")}</ion-button>
          <ion-button data-act="send" aria-label="Put it in the chat">${icon("send-outline")}</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-content class="ion-padding"></ion-content>
    `;
    this.page = this.querySelector("ion-content");
    this.segment = this.querySelector("ion-segment");
    this.segment.addEventListener("ionChange", (event) => {
      this.text = this.written();
      this.looking = event.detail.value === "look";
      this.render();
    });
    this.querySelector("ion-buttons").addEventListener("click", (event) => this.onClick(event));
  }

  /** What is written right now, whichever side is showing. */
  written() {
    const box = this.page?.querySelector("ion-textarea");
    return box ? String(box.value ?? "") : this.text;
  }

  onClick(event) {
    const act = event.target.closest("ion-button")?.dataset.act;
    if (!act) return;
    this.text = this.written();
    if (act === "open") this.open();
    else if (act === "save") globalThis.ft?.save(noteName(new Date()), "text/markdown", base64Of(this.text));
    else if (act === "send") globalThis.ft?.say(this.text);
  }

  /** A file the user picks, read as text. The plugin never opens a picker itself (§53). */
  async open() {
    const picked = await globalThis.ft?.pickFile("text/*");
    if (!picked) return;
    this.text = textOf(picked.data);
    this.looking = false;
    this.render();
  }

  render() {
    this.frame();
    this.segment.value = this.looking ? "look" : "write";
    this.page.innerHTML = "";

    if (this.looking) {
      const view = document.createElement("div");
      view.dataset.test = "view";
      draw(view, this.text);
      this.page.append(view);
      return;
    }

    const box = document.createElement("ion-textarea");
    box.value = this.text;
    box.autoGrow = true;
    box.rows = 12;
    box.setAttribute("aria-label", "Markdown");
    box.setAttribute("spellcheck", "false");
    box.setAttribute("autocapitalize", "off");
    this.page.append(box);
  }
}

/** Base64 of a text, as the app carries files. */
function base64Of(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(binary);
}

/** The text of a file the app handed over. */
function textOf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return new TextDecoder().decode(bytes);
}

/** Builds the markdown of `text` into `root`, as nodes. */
function draw(root, text) {
  for (const block of blocksOf(text)) {
    if (block.kind === "heading") {
      const node = document.createElement(`h${Math.min(block.level, 6)}`);
      node.append(...inlineNodes(block.text));
      root.append(node);
    } else if (block.kind === "list") {
      const list = document.createElement("ul");
      for (const item of block.items) {
        const entry = document.createElement("li");
        entry.append(...inlineNodes(item));
        list.append(entry);
      }
      root.append(list);
    } else if (block.kind === "quote") {
      const quote = document.createElement("blockquote");
      quote.append(...inlineNodes(block.text));
      root.append(quote);
    } else if (block.kind === "code") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.code;
      pre.append(code);
      root.append(pre);
    } else {
      const paragraph = document.createElement("p");
      paragraph.append(...inlineNodes(block.text));
      root.append(paragraph);
    }
  }
}

customElements.define("ft-markdown", Markdown);
