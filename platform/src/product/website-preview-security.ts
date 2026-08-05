import {
  parse,
  parseFragment,
  serialize,
  type DefaultTreeAdapterTypes,
} from "parse5";

export const BUILDER_EDITOR_SANDBOX =
  "allow-same-origin allow-popups";
export const BUILDER_VISUAL_PREVIEW_SANDBOX = BUILDER_EDITOR_SANDBOX;
export const BUILDER_STANDALONE_PREVIEW_SANDBOX =
  "allow-popups";

export const BUILDER_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "img-src https: http: data:",
  "media-src https: http: data:",
  "font-src https: http: data:",
  "style-src 'unsafe-inline' https: http:",
].join("; ");

type HtmlAttribute = {
  name: string;
  value: string;
  namespace?: string;
  prefix?: string;
};

type MutableHtmlNode = {
  nodeName: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: MutableHtmlNode[];
  parentNode?: MutableHtmlNode | null;
  value?: string;
  content?: MutableHtmlNode;
};

const removedTags = new Set([
  "applet",
  "base",
  "embed",
  "frame",
  "frameset",
  "iframe",
  "noembed",
  "noscript",
  "object",
  "plaintext",
  "portal",
  "script",
  "xmp",
]);
const removedAttributes = new Set([
  "action",
  "download",
  "formaction",
  "formtarget",
  "method",
  "enctype",
  "ping",
  "srcdoc",
  "srcset",
  "target",
]);
const urlAttributes = new Set([
  "background",
  "cite",
  "href",
  "poster",
  "src",
  "xlink:href",
]);

export function sanitizeBuilderPreviewHtml(input: string) {
  const document = parse(input) as unknown as MutableHtmlNode;
  sanitizeChildren(document);
  injectPreviewCsp(document);
  return serialize(document as unknown as DefaultTreeAdapterTypes.Document);
}

export function createSandboxedBuilderPreviewDocument(input: string) {
  const safeHtml = sanitizeBuilderPreviewHtml(input);
  const escapedHtml = escapeHtmlAttribute(safeHtml);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src 'self' blob: data:; base-uri 'none'; form-action 'none'; script-src 'none'"><style>html,body{height:100%;margin:0;background:#fff}iframe{display:block;width:100%;height:100%;border:0;background:#fff}</style></head><body><iframe title="Preview visual seguro" sandbox="${BUILDER_STANDALONE_PREVIEW_SANDBOX}" referrerpolicy="no-referrer" srcdoc="${escapedHtml}"></iframe></body></html>`;
}

function sanitizeChildren(parent: MutableHtmlNode) {
  const children = parent.childNodes ?? [];
  const safeChildren: MutableHtmlNode[] = [];

  for (const child of children) {
    const tagName = child.tagName?.toLowerCase();
    if (tagName && shouldRemoveElement(child, tagName)) continue;

    if (tagName) sanitizeElement(child, tagName);
    sanitizeChildren(child);
    if (child.content) sanitizeChildren(child.content);
    safeChildren.push(child);
  }

  parent.childNodes = safeChildren;
}

function shouldRemoveElement(node: MutableHtmlNode, tagName: string) {
  if (removedTags.has(tagName)) return true;
  if (tagName !== "meta") return false;
  return Boolean(findAttribute(node, "http-equiv"));
}

function sanitizeElement(node: MutableHtmlNode, tagName: string) {
  const safeAttributes: HtmlAttribute[] = [];

  for (const attribute of node.attrs ?? []) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on") || removedAttributes.has(name)) continue;

    if (name === "style") {
      const safeStyle = sanitizeCssText(attribute.value);
      if (safeStyle) safeAttributes.push({ ...attribute, value: safeStyle });
      continue;
    }

    if ((tagName === "a" || tagName === "area") && name === "rel") continue;
    if (urlAttributes.has(name)) {
      const safeUrl = sanitizePreviewUrl(attribute.value, tagName, name);
      if (safeUrl) safeAttributes.push({ ...attribute, value: safeUrl });
      continue;
    }

    safeAttributes.push(attribute);
  }

  node.attrs = safeAttributes;

  if (tagName === "style") {
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === "#text" && typeof child.value === "string") {
        child.value = sanitizeCssText(child.value);
      }
    }
  }

  if (tagName === "form") {
    setAttribute(node, "data-imobiflow-preview-inert", "true");
    setAttribute(node, "aria-disabled", "true");
  }

  if (tagName === "button") setAttribute(node, "type", "button");
  if (tagName === "input") {
    const type = findAttribute(node, "type")?.value.toLowerCase();
    if (type === "submit" || type === "image") setAttribute(node, "type", "button");
  }

  if (tagName === "a" || tagName === "area") {
    const href = findAttribute(node, "href")?.value;
    if (!href) return;
    setAttribute(node, "rel", "noopener noreferrer");
    setAttribute(node, "target", href.startsWith("#") ? "_self" : "_blank");
  }

  if (tagName === "link") {
    const rel = findAttribute(node, "rel")?.value.toLowerCase() ?? "";
    if (!rel.split(/\s+/).some((value) => value === "stylesheet" || value === "icon")) {
      removeAttribute(node, "href");
    }
  }
}

function sanitizePreviewUrl(value: string, tagName: string, attributeName: string) {
  const normalized = value.trim().replace(/[\u0000-\u0020\u007f-\u009f]+/g, "");
  if (!normalized) return null;
  if (normalized.startsWith("#") || normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("?")) {
    return value.trim();
  }

  try {
    const url = new URL(normalized, "https://preview.invalid");
    if (url.protocol === "http:" || url.protocol === "https:") return value.trim();
    if (attributeName === "href" && (url.protocol === "mailto:" || url.protocol === "tel:")) {
      return value.trim();
    }
    if (
      attributeName !== "href" &&
      url.protocol === "data:" &&
      /^(img|image|audio|video|source)$/.test(tagName) &&
      /^data:(image|audio|video)\/[a-z0-9.+-]+(?:;base64)?,/i.test(normalized)
    ) {
      return value.trim();
    }
  } catch {
    return null;
  }

  return null;
}

export function sanitizeCssText(input: string) {
  const canonical = decodeCssEscapes(input);
  return canonical
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/(?:behavior|-moz-binding)\s*:[^;}]+[;}]?/gi, "")
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote: string, rawUrl: string) => {
      const safeUrl = sanitizePreviewUrl(rawUrl, "img", "src");
      return safeUrl ? `url("${safeUrl.replace(/["\\\n\r]/g, "")}")` : "none";
    })
    .trim();
}

function decodeCssEscapes(value: string) {
  return value
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, codePoint: string) => {
      const parsed = Number.parseInt(codePoint, 16);
      return parsed > 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : "";
    })
    .replace(/\\([^\n\r0-9a-f])/gi, "$1");
}

function injectPreviewCsp(document: MutableHtmlNode) {
  const head = findElement(document, "head");
  if (!head) return;
  const fragment = parseFragment(
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(BUILDER_PREVIEW_CSP)}">`,
  ) as unknown as MutableHtmlNode;
  const cspMeta = fragment.childNodes?.[0];
  if (!cspMeta) return;
  cspMeta.parentNode = head;
  head.childNodes = [cspMeta, ...(head.childNodes ?? [])];
}

function findElement(node: MutableHtmlNode, tagName: string): MutableHtmlNode | null {
  if (node.tagName?.toLowerCase() === tagName) return node;
  for (const child of node.childNodes ?? []) {
    const match = findElement(child, tagName);
    if (match) return match;
  }
  return null;
}

function findAttribute(node: MutableHtmlNode, name: string) {
  return node.attrs?.find((attribute) => attribute.name.toLowerCase() === name);
}

function removeAttribute(node: MutableHtmlNode, name: string) {
  node.attrs = (node.attrs ?? []).filter((attribute) => attribute.name.toLowerCase() !== name);
}

function setAttribute(node: MutableHtmlNode, name: string, value: string) {
  removeAttribute(node, name);
  node.attrs = [...(node.attrs ?? []), { name, value }];
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
