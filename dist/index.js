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

class Markdown extends HTMLElement {
  static observedAttributes = ["text"];

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; font: 15px/1.6 system-ui, -apple-system, sans-serif; color: #111; }
      @media (prefers-color-scheme: dark) { :host { color: #f5f5f5; } }
      h1,h2,h3,h4,h5,h6 { margin: 0.8em 0 0.3em; line-height: 1.25; }
      p, ul, blockquote, pre { margin: 0 0 0.8em; }
      ul { padding-left: 1.2em; }
      blockquote { padding-left: 0.8em; border-left: 3px solid currentColor; opacity: 0.75; }
      pre { padding: 10px 12px; border-radius: 10px; background: rgba(127,127,127,0.18); overflow-x: auto; }
      code { font: 13px/1.5 ui-monospace, Menlo, monospace; }
      a { color: inherit; }
    `;
    root.append(style);

    for (const block of blocksOf(this.getAttribute("text") ?? "")) {
      if (block.kind === "heading") {
        const node = document.createElement(`h${Math.min(block.level + 1, 6)}`);
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
}

customElements.define("ft-markdown", Markdown);
